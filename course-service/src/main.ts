import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger'
import { ConfigService } from '@nestjs/config'
import { BigIntInterceptor } from './utils/interceptors/bigint.interceptor'
import { Logger } from '@nestjs/common'

async function bootstrap() {
  const app = await NestFactory.create(AppModule)

  app.useGlobalInterceptors(new BigIntInterceptor())

  app.enableCors({
    origin: true,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true
  })
  const configService = app.get(ConfigService)

  const swaggerConfig = new DocumentBuilder().setTitle('Course Service API').build()

  const document = SwaggerModule.createDocument(app, swaggerConfig)

  if (configService.get('NODE_ENV') !== 'production') {
    SwaggerModule.setup('api/docs', app, document)
  }

  const port = configService.get<number>('PORT', 3003)
  await app.listen(port)

  const logger = new Logger('Bootstrap')
  logger.log(`=== Course Service running ===`)
}

bootstrap()
  .then(() => {})
  .catch((err) => {})
