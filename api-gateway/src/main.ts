import { createProxyMiddleware } from 'http-proxy-middleware';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import * as jwt from 'jsonwebtoken';
import * as swaggerUi from 'swagger-ui-express';
import { ConfigService } from '@nestjs/config';
import { getMergedSwagger } from './config/swagger-aggregator';
import Redis from 'ioredis';
import { Logger } from '@nestjs/common';
import { Role, roleRoutes } from './config/role-routes';
import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from '@aws-sdk/client-secrets-manager';

// ─── Types ───────────────────────────────────────────────────────────────────

interface JwtPayload {
  user: {
    sub: string;
    displayName: string;
    userName: string;
    email: string;
    roles: string[];
  };
  tenantId?: string;
  jti: string;
  iat: number;
  exp: number;
}

interface CachedSecret {
  value: string;
  loadedAt: number;
}

const SECRET_CACHE = new Map<string, CachedSecret>();
const SECRET_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function buildSmClient(config: ConfigService): SecretsManagerClient {
  return new SecretsManagerClient({
    region: config.getOrThrow<string>('AWS_REGION'),
    credentials: {
      accessKeyId: config.getOrThrow<string>('AWS_ACCESS_KEY'),
      secretAccessKey: config.getOrThrow<string>('AWS_SECRET_KEY'),
    },
  });
}

function parseSecretString(raw: string): string {
  try {
    const parsed = JSON.parse(raw) as Record<string, string>;
    return parsed['jwt_secret'] ?? raw;
  } catch {
    return raw;
  }
}

async function fetchSecretFromAws(
  client: SecretsManagerClient,
  secretName: string,
): Promise<string> {
  const res = await client.send(
    new GetSecretValueCommand({ SecretId: secretName }),
  );
  if (!res.SecretString) throw new Error(`Secret "${secretName}" is empty`);
  return parseSecretString(res.SecretString);
}

async function resolveSecret(
  client: SecretsManagerClient,
  secretName: string,
): Promise<string> {
  const cached = SECRET_CACHE.get(secretName);
  if (cached && Date.now() - cached.loadedAt < SECRET_TTL_MS) {
    return cached.value;
  }
  Logger.log(`Fetching secret from AWS SM: ${secretName}`, 'Gateway');
  const value = await fetchSecretFromAws(client, secretName);
  SECRET_CACHE.set(secretName, { value, loadedAt: Date.now() });
  return value;
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);
  const server = app.getHttpAdapter().getInstance();

  const redis = new Redis({
    host: config.get('REDIS_HOST'),
    port: config.get<number>('REDIS_PORT'),
    password: config.get('REDIS_PASSWORD'),
    retryStrategy: (times) => Math.min(times * 50, 2000),
  });

  const smClient = buildSmClient(config);
  const jwtSecretName = config.getOrThrow<string>('JWT_SECRET_NAME');

  await resolveSecret(smClient, jwtSecretName);
  Logger.log('JWT secret warmed up', 'Gateway');

  app.enableCors({
    origin: true,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
  });

  const mergedDoc = await getMergedSwagger(config);

  if (mergedDoc) {
    mergedDoc.components = mergedDoc.components || {};
    mergedDoc.components.securitySchemes = {
      ...(mergedDoc.components.securitySchemes || {}),
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
    };
    mergedDoc.security = [{ bearerAuth: [] }];

    server.use(
      '/api/docs',
      swaggerUi.serve,
      swaggerUi.setup(mergedDoc, {
        swaggerOptions: { persistAuthorization: true },
      }),
    );
  } else {
    Logger.error('Failed to load Swagger documentation', 'Gateway');
  }

  const isPublicRoute = (path: string): boolean =>
    path.startsWith('/api/docs') ||
    (path.startsWith('/api/users/auth') && !path.endsWith('/logout')) ||
    path.startsWith('/api/orchestrator/health') ||
    path.startsWith('/api/orchestrator/ready') ||
    path.startsWith('/api/orchestrator/docs') ||
    path.startsWith('/api/orchestrator/openapi.json') ||
    path.startsWith('/api/courses/mcp');

  server.use(async (req, res, next) => {
    Logger.debug(`Incoming: ${req.method} ${req.originalUrl}`);

    if (isPublicRoute(req.path)) return next();

    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res
        .status(401)
        .json({ success: false, code: '4001', message: 'Unauthenticated' });
    }

    try {
      const secret = await resolveSecret(smClient, jwtSecretName);
      const decoded = jwt.verify(
        authHeader.split(' ')[1],
        secret,
      ) as JwtPayload;

      const isBlacklisted = await redis.get(`iam:blacklist:${decoded.jti}`);
      if (isBlacklisted) {
        return res.status(401).json({
          success: false,
          code: '4003',
          message: 'Token has been revoked',
        });
      }

      const primaryRole = decoded.user.roles[0] as Role;
      const matchedRoute = roleRoutes.find(
        (r) =>
          r.path.test(req.path) &&
          (r.method === '*' || r.method === req.method),
      );
      if (matchedRoute && !matchedRoute.roles.includes(primaryRole)) {
        return res.status(403).json({
          success: false,
          code: '4031',
          message: `Forbidden: required roles [${matchedRoute.roles.join(', ')}]`,
        });
      }

      req.headers['x-user-id'] = decoded.user.sub;
      req.headers['x-user-email'] = decoded.user.email;
      req.headers['x-user-role'] = primaryRole;
      req.headers['x-user-username'] = decoded.user.userName;
      req.headers['x-user-display-name'] = decoded.user.displayName;
      req.headers['x-user-jti'] = decoded.jti;
      req.headers['x-user-token-exp'] = String(decoded.exp);
      req.headers['x-tenant-id'] =
        decoded.tenantId ?? req.headers['x-tenant-id'] ?? 'default';
      req.headers['x-forwarded-by-gateway'] = 'true';

      Logger.debug(
        `Authenticated: ${decoded.user.email} (${primaryRole}) → ${req.method} ${req.originalUrl}`,
      );
      next();
    } catch {
      return res
        .status(401)
        .json({ success: false, code: '4002', message: 'Invalid token' });
    }
  });

  const proxy = (path: string, envKey: string) =>
    server.use(
      path,
      createProxyMiddleware({
        target: config.get<string>(envKey),
        changeOrigin: true,
        pathRewrite: { [`^${path}`]: '' },
      }),
    );

  proxy('/api/courses', 'COURSE_SERVICE_URL');
  proxy('/api/users', 'IAM_SERVICE_URL');
  proxy('/api/labs', 'LAB_SERVICE_URL');
  proxy('/api/media', 'MEDIA_SERVICE_URL');
  proxy('/api/orchestrator', 'ORCHESTRATOR_SERVICE_URL');

  await app.listen(config.get<number>('PORT') || 3000);
}

bootstrap();
