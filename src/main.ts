import {  ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { AllExceptionsFilter } from './common/filters/all-exceptions/all-exceptions.filter.js';
import { ConfigService } from '@nestjs/config';
import { Env } from './config/env.js';
import { ResponseInterceptor } from './common/interceptors/response/response.interceptor.js';
import { Logger } from 'nestjs-pino';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {bufferLogs: true});
  app.useLogger(app.get(Logger))
  const config = app.get<ConfigService<Env, true>>(ConfigService)
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalInterceptors(new ResponseInterceptor())
  await app.listen(config.get('PORT', {infer: true}));
}
await bootstrap();
