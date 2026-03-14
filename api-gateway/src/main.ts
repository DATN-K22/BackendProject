import { createProxyMiddleware } from 'http-proxy-middleware';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import * as jwt from 'jsonwebtoken';
import * as swaggerUi from 'swagger-ui-express';
import { ConfigService } from '@nestjs/config';
import { getMergedSwagger } from './config/swagger-aggregator';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);
  const server = app.getHttpAdapter().getInstance();

  app.enableCors({
    origin: true,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
  });

  /**
   * =========================
   * Swagger Aggregation
   * =========================
   */
  const mergedDoc = await getMergedSwagger(configService);

  // Inject bearerAuth vào merged spec
  mergedDoc.components = mergedDoc.components || {};
  mergedDoc.components.securitySchemes = {
    ...(mergedDoc.components.securitySchemes || {}),
    bearerAuth: {
      type: 'http',
      scheme: 'bearer',
      bearerFormat: 'JWT',
    },
  };

  mergedDoc.security = [{ bearerAuth: [] }];

  server.use(
    '/api/docs',
    swaggerUi.serve,
    swaggerUi.setup(mergedDoc, {
      swaggerOptions: {
        persistAuthorization: true,
      },
    }),
  );

  /**
   * =========================
   * JWT Middleware
   * =========================
   */
  const jwtSecret = configService.get<string>('JWT_ACCESS_TOKEN_SECRET');

  server.use((req, res, next) => {
    // Public routes
    if (
      req.path.startsWith('/api/docs') ||
      req.path === '/api/users/auth/signin' ||
      req.path === '/api/users/auth/signup' ||
      req.path.startsWith('/api/orchestrator/health') ||
      req.path.startsWith('/api/orchestrator/ready') ||
      req.path.startsWith('/api/orchestrator/docs') ||
      req.path.startsWith('/api/orchestrator/openapi.json') ||
      req.path.startsWith('/api/courses/mcp')
    ) {
      return next();
    }

    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({
        success: false,
        code: '4001',
        message: 'Unauthenticated',
      });
    }

    const token = authHeader.split(' ')[1];

    try {
      const decoded: any = jwt.verify(token, jwtSecret!);

      // Forward user info xuống service
      req.headers['x-user-id'] = decoded.sub;
      req.headers['x-user-role'] = decoded.role;
      req.headers['x-tenant-id'] = decoded.tenantId ?? req.headers['x-tenant-id'] ?? 'default';
      req.headers['x-forwarded-by-gateway'] = 'true';

      next();
    } catch {
      return res.status(401).json({
        success: false,
        code: '4002',
        message: 'Invalid token',
      });
    }
  });

  /**
   * =========================
   * Proxy Services
   * =========================
   */

  // Courses
  server.use(
    '/api/courses',
    createProxyMiddleware({
      target: configService.get<string>('COURSE_SERVICE_URL'),
      changeOrigin: true,
      pathRewrite: { '^/api/courses': '' },
    }),
  );

  // Users
  server.use(
    '/api/users',
    createProxyMiddleware({
      target: configService.get<string>('IAM_SERVICE_URL'),
      changeOrigin: true,
      pathRewrite: { '^/api/users': '' },
    }),
  );

  // Media
  server.use(
    '/api/media',
    createProxyMiddleware({
      target: configService.get<string>('MEDIA_SERVICE_URL'),
      changeOrigin: true,
      pathRewrite: { '^/api/media': '' },
    }),
  );

  // Orchestrator AI
  server.use(
    '/api/orchestrator',
    createProxyMiddleware({
      target: configService.get<string>('ORCHESTRATOR_AI_URL'),
      changeOrigin: true,
      pathRewrite: { '^/api/orchestrator': '' },
    }),
  );

  await app.listen(configService.get<number>('PORT') || 3000);
}

bootstrap();
