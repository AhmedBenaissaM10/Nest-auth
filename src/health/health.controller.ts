import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { HealthCheck, HealthCheckService } from '@nestjs/terminus';
import { Public } from '../auth/decorators/public.decorator.js';
import { ApiErrors } from '../common/swagger/api-docs.decorator.js';
import { DatabaseHealthIndicator } from './database.health.js';
import { RedisHealthIndicator } from './redis.health.js';

@ApiTags('Health')
@Public()
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly db: DatabaseHealthIndicator,
    private readonly redis: RedisHealthIndicator,
  ) {}

  @Get('live')
  @HealthCheck()
  @ApiOperation({
    summary: 'Liveness probe',
    description:
      'Answers 200 as long as the process is running. Checks no dependency.',
  })
  @ApiOkResponse({ description: 'The process is alive' })
  live() {
    return this.health.check([]);
  }

  @Get('ready')
  @HealthCheck()
  @ApiOperation({
    summary: 'Readiness probe',
    description: 'Answers 200 only if the app can reach the database.',
  })
  @ApiOkResponse({ description: 'The app is ready to receive traffic' })
  @ApiErrors(503)
  ready() {
    return this.health.check([() => this.db.isHealthy('database')]);
  }
  @Get('redis')
  @HealthCheck()
  redisStatus() {
    return this.health.check([() => this.redis.isHealthy('redis')]);
  }
}
