import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger'
import { ConfigService } from '@nestjs/config'
import { GlobalExceptionFilter } from './utils/excreption/GlobalExceptionHandler'
import { AppValidationPipe } from './utils/pipe/validation.pipe'
import { BigIntInterceptor } from './common/interceptors/bigint.interceptor'

async function bootstrap() {
  const app = await NestFactory.create(AppModule)

  app.useGlobalInterceptors(new BigIntInterceptor())

  app.useGlobalPipes(AppValidationPipe)
  app.useGlobalFilters(new GlobalExceptionFilter())
  const configService = app.get(ConfigService)

  const swaggerConfig = new DocumentBuilder().setTitle('Course Service API').build()

  const document = SwaggerModule.createDocument(app, swaggerConfig)

  if (configService.get('NODE_ENV') !== 'production') {
    SwaggerModule.setup('api/docs', app, document)
  }

  const port = configService.get<number>('PORT', 3003)
  await app.listen(port)
}

bootstrap()
  .then(() => {})
  .catch((err) => {})
