import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Env } from './config/env.js';

export function buildOpenApiDocument(app: INestApplication) {
  const options = new DocumentBuilder()
    .setTitle('Auth API')
    .setDescription(
      'Authentication API: short-lived access token in the Authorization header, rotating refresh token in an httpOnly cookie.',
    )
    .setVersion('1.0.0')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      'access-token',
    )
    .addCookieAuth(
      'refresh_token',
      { type: 'apiKey', in: 'cookie', name: 'refresh_token' },
      'refresh-cookie',
    )
    .build();

  return SwaggerModule.createDocument(app, options);
}

export function setupSwagger(app: INestApplication) {
  const config = app.get<ConfigService<Env, true>>(ConfigService);
  if (config.get('NODE_ENV', { infer: true }) === 'production') return;

  SwaggerModule.setup('docs', app, buildOpenApiDocument(app), {
    swaggerOptions: { persistAuthorization: true },
  });
}
