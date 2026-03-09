import { Module } from '@nestjs/common'
import { HttpModule } from '@nestjs/axios'
import { ConfigService } from '@nestjs/config'
import { MediaHtppClient } from './MediaHttpClient'

@Module({
  imports: [
    HttpModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        baseURL: config.get<string>('Media_SERVICE_URL'),
        timeout: 5000,
        maxRedirects: 5
      })
    })
  ],
  providers: [
    {
      provide: 'MediaClient',
      useClass: MediaHtppClient
    }
  ],
  exports: ['MediaClient']
})
export class MediaModule {}
