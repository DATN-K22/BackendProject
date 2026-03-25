import axios from 'axios';
import { merge } from 'openapi-merge';
import { ConfigService } from '@nestjs/config';

export async function getMergedSwagger(configService: ConfigService) {
  const services = [
    {
      name: 'media-service',
      url: `${configService.get<string>('MEDIA_SERVICE_URL')}/api/docs-json`,
    },
    {
      name: 'users',
      url: `${configService.get<string>('IAM_SERVICE_URL')}/api/docs-json`,
    },
    {
      name: 'courses',
      url: `${configService.get<string>('COURSE_SERVICE_URL')}/api/docs-json`,
    },
  ];

  const specs: Parameters<typeof merge>[0] = [];

  for (const service of services) {
    try {
      const { data } = await axios.get(service.url);

      specs.push({
        oas: data,
        pathModification: {
          prepend: `/api/${service.name}`,
        },
      });
    } catch (error) {
      console.warn(`Cannot load swagger from ${service.name}`);
    }
  }

  const result = merge(specs);

  if ('output' in result) {
    return result.output;
  }

  console.error(result);
  throw new Error('Failed to merge OpenAPI specs');
}
