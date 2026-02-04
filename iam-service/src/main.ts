import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // 1. Cấu hình CORS
  app.enableCors({
    origin: true, // Cho phép tất cả các nguồn (hoặc điền mảng domain cụ thể)
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
  });

  const configService = app.get(ConfigService);
  
  // 2. Swagger
  const swaggerConfig = new DocumentBuilder()
    .setTitle('My API') 
    .setDescription('API documentation') 
    .setVersion('1.0')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);

  if (configService.get('NODE_ENV') !== 'production') {
    SwaggerModule.setup('api/docs', app, document);
  }

  await app.listen(process.env.PORT ?? 3001);
}

bootstrap()
  .then(() => console.log('Application is running'))
  .catch((err) => console.error(err));