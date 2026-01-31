// main.ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { GlobalExceptionFilter } from './utils/excreption/GlobalExceptionHandler';
import { AppValidationPipe } from './utils/pipe/validation.pipe';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(AppValidationPipe);
  app.useGlobalFilters(new GlobalExceptionFilter())
  const configService = app.get(ConfigService);

  const swaggerConfig = new DocumentBuilder()
    .setTitle('My API')
    .setDescription('API documentation')
    .setVersion('1.0')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);

  if (configService.get('NODE_ENV') !== 'production') {
    SwaggerModule.setup('api/docs', app, document);
  }

  const port = configService.get<number>('PORT', 3003);
  await app.listen(port);
}

bootstrap();