#!/bin/bash

# Default action
ACTION="${1:-run}"

PROJECT_NAME="DATN backend"
VERSION="1.0"

echo -e "\033[0;35mRunning project: $PROJECT_NAME with version $VERSION\033[0m"

ROOT_DIR="$(pwd)"
CONDA_PYTHON="$ROOT_DIR/.conda/bin/python"
PIP="$ROOT_DIR/.conda/bin/pip"

resolve_python_for_service() {
    local service_dir="$1"
    if [ -x "$service_dir/.venv/bin/python" ]; then
        echo "$service_dir/.venv/bin/python"
    elif [ -x "$CONDA_PYTHON" ]; then
        echo "$CONDA_PYTHON"
    elif command -v python3 >/dev/null 2>&1; then
        command -v python3
    elif command -v python >/dev/null 2>&1; then
        command -v python
    else
        return 1
    fi
}

resolve_pip_for_service() {
    local service_dir="$1"
    if [ -x "$service_dir/.venv/bin/pip" ]; then
        echo "$service_dir/.venv/bin/pip"
    elif [ -x "$PIP" ]; then
        echo "$PIP"
    elif command -v pip3 >/dev/null 2>&1; then
        command -v pip3
    elif command -v pip >/dev/null 2>&1; then
        command -v pip
    else
        return 1
    fi
}

# Node.js services (npm install + prisma generate)
NODE_SERVICES=("iam-service" "media-service" "api-gateway" "course-service")

# Python AI services (pip install)
AI_SERVICES=("orchestrator-ai" "rag-ai" "recommendation-ai")

case "$ACTION" in
    init)
        echo -e "\033[0;36m--- INITIALIZING NODE SERVICES ---\033[0m"
        for service in "${NODE_SERVICES[@]}"; do
            echo -e "\033[0;33mProcessing $service...\033[0m"
            cd "$ROOT_DIR/$service" || exit

            npm install
            npx prisma generate
        done

        echo -e "\033[0;36m--- INITIALIZING AI SERVICES ---\033[0m"
        for service in "${AI_SERVICES[@]}"; do
            echo -e "\033[0;33mProcessing $service...\033[0m"
            cd "$ROOT_DIR/$service" || exit

            service_pip="$(resolve_pip_for_service "$ROOT_DIR/$service")" || {
                echo -e "\033[0;31mNo pip found for $service (.venv/.conda/system).\033[0m"
                exit 1
            }
            "$service_pip" install -r requirements.txt
        done

        echo -e "\033[0;32mAll services initialized!\033[0m"
        ;;

    run-hot-ai)
        echo -e "\033[0;32m--- STARTING MICROSERVICES (HOT RELOAD) ---\033[0m"

        # Start each Node service in a new Terminal tab (already hot-reload via start:dev)
        for service in "${NODE_SERVICES[@]}"; do
            echo -e "\033[0;37mLaunching $service in a new tab...\033[0m"
            osascript -e "tell application \"Terminal\" to do script \"cd $ROOT_DIR/$service && doppler run -- npm run start:dev\""
        done

        # Start each AI service with uvicorn --reload
        echo -e "\033[0;36mLaunching AI services with uv hot reload...\033[0m"

        ORCH_PYTHON="$(resolve_python_for_service "$ROOT_DIR/orchestrator-ai")" || {
            echo -e "\033[0;31mNo python found for orchestrator-ai (.venv/.conda/system).\033[0m"
            exit 1
        }
        RECOMMEND_PYTHON="$(resolve_python_for_service "$ROOT_DIR/recommendation-ai")" || {
            echo -e "\033[0;31mNo python found for recommendation-ai (.venv/.conda/system).\033[0m"
            exit 1
        }
        RAG_PYTHON="$(resolve_python_for_service "$ROOT_DIR/rag-ai")" || {
            echo -e "\033[0;31mNo python found for rag-ai (.venv/.conda/system).\033[0m"
            exit 1
        }

        osascript -e "tell application \"Terminal\" to do script \"cd '$ROOT_DIR/orchestrator-ai' && UV_PYTHON='$ORCH_PYTHON' doppler run -- uv run uvicorn main:create_app --factory --reload --host 0.0.0.0 --port 3007\""
        osascript -e "tell application \"Terminal\" to do script \"cd '$ROOT_DIR/recommendation-ai' && UV_PYTHON='$RECOMMEND_PYTHON' doppler run -- uv run uvicorn main:create_app --factory --reload --host 0.0.0.0 --port 3009\""
        osascript -e "tell application \"Terminal\" to do script \"cd '$ROOT_DIR/rag-ai' && UV_PYTHON='$RAG_PYTHON' doppler run -- uv run uvicorn main:create_app --factory --reload --host 0.0.0.0 --port 3008\""
        ;;

    run)
        echo -e "\033[0;32m--- STARTING MICROSERVICES ---\033[0m"

        # Start each Node service in a new Terminal tab
        for service in "${NODE_SERVICES[@]}"; do
            echo -e "\033[0;37mLaunching $service in a new tab...\033[0m"
            osascript -e "tell application \"Terminal\" to do script \"cd $ROOT_DIR/$service && doppler run -- npm run start:dev\""
        done

        # Start each AI service in a new Terminal tab
        for service in "${AI_SERVICES[@]}"; do
            echo -e "\033[0;37mLaunching $service in a new tab...\033[0m"
            service_python="$(resolve_python_for_service "$ROOT_DIR/$service")" || {
                echo -e "\033[0;31mNo python found for $service (.venv/.conda/system).\033[0m"
                exit 1
            }
            osascript -e "tell application \"Terminal\" to do script \"cd '$ROOT_DIR/$service' && doppler run -- '$service_python' main.py\""
        done
        ;;

    *)
        echo -e "\033[0;31mUnknown action: $ACTION. Use 'init', 'run', or 'run-hot-ai'.\033[0m"
        exit 1
        ;;
esac
