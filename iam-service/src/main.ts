import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import { ConfigService } from '@nestjs/config'
import * as cookieParser from 'cookie-parser'

async function bootstrap() {
  const app = await NestFactory.create(AppModule)

  app.use(cookieParser())

  const configService = app.get(ConfigService)
  const swaggerConfig = new DocumentBuilder().setTitle('IAM Service API').build()

  const document = SwaggerModule.createDocument(app, swaggerConfig)

  if (configService.get('NODE_ENV') !== 'production') {
    SwaggerModule.setup('api/docs', app, document)
  }

  await app.listen(process.env.PORT ?? 3001)
}

bootstrap()
  .then(() => {})
  .catch((err) => {})
