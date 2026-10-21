import { Injectable } from '@nestjs/common';
import { HealthIndicatorService } from '@nestjs/terminus';
import { RedisService } from '../redis/redis.service.js';

const PING_TIMEOUT_MS = 1500;

@Injectable()
export class RedisHealthIndicator {
  constructor(
    private readonly indicator: HealthIndicatorService,
    private readonly redis: RedisService,
  ) {}

  async isHealthy(key: string) {
    const check = this.indicator.check(key);
    try {
      const reply = await this.pingWithTimeout();
      return reply === 'PONG'
        ? check.up()
        : check.down({ message: 'Unexpected reply from Redis' });
    } catch (error) {
      return check.down({
        message: error instanceof Error ? error.message : 'Redis unreachable',
      });
    }
  }

  // Without a timeout, a dead Redis could hold the probe until the
  // client's retry strategy gives up, and Kubernetes would time out first.
  private async pingWithTimeout(): Promise<string> {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error('Redis ping timed out')),
        PING_TIMEOUT_MS,
      );
    });
    try {
      return await Promise.race([this.redis.client.ping(), timeout]);
    } finally {
      clearTimeout(timer);
    }
  }
}
