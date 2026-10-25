import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AuthModule } from './auth/auth.module.js';
import { Env, validateEnv } from './config/env.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { UsersModule } from './users/users.module.js';
import { HealthModule } from './health/health.module.js';
import { RedisModule } from './redis/redis.module.js';
import { MailModule } from './mail/mail.module.js';
import { RedisService } from './redis/redis.service.js';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import { join } from 'node:path';
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: process.env.NODE_ENV === 'test' ? '.env.test' : '.env',
      validate: validateEnv,
    }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => {
        const env = config.get('NODE_ENV', { infer: true });
        const isProd = env === 'production';
        const logDir = 'logs';
        return {
          pinoHttp: {
            level: env === 'test' ? 'silent' : isProd ? 'info' : 'debug',
            transport:
              env === 'test'
                ? undefined
                : {
                    targets: [
                      isProd
                        ? { target: 'pino/file', options: { destination: 1 } }
                        : {
                            target: 'pino-pretty',
                            options: { singleLine: true },
                          },
                      {
                        target: 'pino-roll',
                        options: {
                          file: join(logDir, 'app'),
                          extension: '.log',
                          dateFormat: 'yyyy-MM-dd',
                          frequency: 'daily',
                          size: '10m',
                          limit: { count: 14 },
                          mkdir: true,
                        },
                      },
                    ],
                  },
            redact: [
              'req.headers.authorization',
              'req.headers.cookie',
              'res.headers["set-cookie"]',
            ],
            autoLogging: {
              ignore: (req) => req.url?.startsWith('/health') ?? false,
            },
          },
        };
      },
    }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService, RedisService],
      useFactory: (config: ConfigService<Env, true>, redis: RedisService) => ({
        throttlers: [{ ttl: 60_000, limit: 100 }],
        skipIf: () => config.get('THROTTLE_DISABLED', { infer: true }),
        storage: new ThrottlerStorageRedisService(redis.client),
      }),
    }),
    AuthModule,
    UsersModule,
    PrismaModule,
    HealthModule,
    RedisModule,
    MailModule,
  ],
  controllers: [AppController],
  providers: [AppService, { provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
