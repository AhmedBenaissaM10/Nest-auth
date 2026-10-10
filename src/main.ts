import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { AllExceptionsFilter } from './common/filters/all-exceptions/all-exceptions.filter.js';
import { ConfigService } from '@nestjs/config';
import { Env } from './config/env.js';
import { ResponseInterceptor } from './common/interceptors/response/response.interceptor.js';
import { Logger } from 'nestjs-pino';
import cookieParser from 'cookie-parser';
import { configureApp } from './app.setup.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  configureApp(app);
  app.use(cookieParser());
  const config = app.get<ConfigService<Env, true>>(ConfigService);
  await app.listen(config.get('PORT', { infer: true }));
}
await bootstrap();
