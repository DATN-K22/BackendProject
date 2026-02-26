"""
session/redis_session_service.py

ADK-compatible SessionService backed by Redis.
Each session is stored as a JSON hash under the key:
    session:{app_name}:{user_id}:{session_id}

TTL is refreshed on every read/write.
"""

from __future__ import annotations

import json
import uuid
from datetime import timedelta
from typing import Any, Dict, Optional

import redis.asyncio as aioredis
from google.adk.sessions import BaseSessionService, Session
from google.adk.sessions.base_session_service import (
    GetSessionConfig,
    ListSessionsResponse,
)

DEFAULT_TTL = timedelta(hours=2)
KEY_PREFIX = "session"


class RedisSessionService(BaseSessionService):
    def __init__(
        self,
        redis_url: str = "redis://localhost:6379/0",
        ttl: timedelta = DEFAULT_TTL,
    ):
        self._redis_url = redis_url
        self._ttl = ttl
        self._client: Optional[aioredis.Redis] = None

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    async def connect(self) -> None:
        self._client = await aioredis.from_url(
            self._redis_url, decode_responses=True
        )

    async def close(self) -> None:
        if self._client:
            await self._client.aclose()

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    @property
    def _r(self) -> aioredis.Redis:
        if self._client is None:
            raise RuntimeError("RedisSessionService not connected – call connect().")
        return self._client

    @staticmethod
    def _key(app_name: str, user_id: str, session_id: str) -> str:
        return f"{KEY_PREFIX}:{app_name}:{user_id}:{session_id}"

    # ------------------------------------------------------------------
    # BaseSessionService interface
    # ------------------------------------------------------------------

    async def create_session(
        self,
        *,
        app_name: str,
        user_id: str,
        state: Optional[Dict[str, Any]] = None,
        session_id: Optional[str] = None,
    ) -> Session:
        session_id = session_id or str(uuid.uuid4())
        session = Session(
            id=session_id,
            app_name=app_name,
            user_id=user_id,
            state=state or {},
        )
        await self._save(session)
        return session

    async def get_session(
        self,
        *,
        app_name: str,
        user_id: str,
        session_id: str,
        config: Optional[GetSessionConfig] = None,
    ) -> Optional[Session]:
        key = self._key(app_name, user_id, session_id)
        raw = await self._r.get(key)
        if raw is None:
            return None
        data = json.loads(raw)
        session = Session(
            id=data["id"],
            app_name=data["app_name"],
            user_id=data["user_id"],
            state=data.get("state", {}),
        )
        # Refresh TTL on access
        await self._r.expire(key, int(self._ttl.total_seconds()))
        return session

    async def list_sessions(
        self,
        *,
        app_name: str,
        user_id: Optional[str] = None,
    ) -> ListSessionsResponse:
        # Scan keys matching session:{app_name}:{user_id}:* or session:{app_name}:*:*
        if user_id:
            pattern = self._key(app_name, user_id, "*")
        else:
            pattern = f"{KEY_PREFIX}:{app_name}:*"

        sessions: list[Session] = []
        async for key in self._r.scan_iter(pattern):
            raw = await self._r.get(key)
            if raw is None:
                continue
            data = json.loads(raw)
            sessions.append(
                Session(
                    id=data["id"],
                    app_name=data["app_name"],
                    user_id=data["user_id"],
                    state=data.get("state", {}),
                )
            )
        return ListSessionsResponse(sessions=sessions)

    async def update_session(self, session: Session) -> None:
        await self._save(session)

    async def delete_session(
        self,
        *,
        app_name: str,
        user_id: str,
        session_id: str,
    ) -> None:
        key = self._key(app_name, user_id, session_id)
        await self._r.delete(key)

    # ------------------------------------------------------------------

    async def _save(self, session: Session) -> None:
        key = self._key(session.app_name, session.user_id, session.id)
        payload = json.dumps(
            {
                "id": session.id,
                "app_name": session.app_name,
                "user_id": session.user_id,
                "state": session.state,
            }
        )
        await self._r.set(key, payload, ex=int(self._ttl.total_seconds()))