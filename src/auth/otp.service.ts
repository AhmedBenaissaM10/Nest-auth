import { Injectable } from '@nestjs/common';
import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import { RedisService } from '../redis/redis.service.js';

export type OtpPurpose = 'reset-password';

@Injectable()
export class OtpService {
  constructor(private readonly redis: RedisService) {}

  private key(purpose: OtpPurpose, email: string) {
    return `otp:${purpose}:${email}`;
  }

  private hash(code: string) {
    return createHash('sha256').update(code).digest('hex');
  }

  async generate(purpose: OtpPurpose, email: string, ttlSeconds = 600) {
    const code = randomInt(100000, 1000000).toString();
    await this.redis.client.del(`${this.key(purpose, email)}:attempts`);
    await this.redis.client.set(
      this.key(purpose, email),
      this.hash(code),
      'EX',
      ttlSeconds,
    );
    return code;
  }
  async verify(
    purpose: OtpPurpose,
    email: string,
    code: string,
    maxAttemps = 5,
  ) {
    const key = this.key(purpose, email);
    const attemptsKey = `${key}:attempts`;
    const stored = await this.redis.client.get(key);
    if (!stored) return false;
    const attempts = await this.redis.client.incr(attemptsKey);
    if (attempts === 1) {
      const ttl = await this.redis.client.ttl(key);
      if (ttl > 0) await this.redis.client.expire(attemptsKey, ttl);
    }
    if (attempts > maxAttemps) {
      await this.remove(purpose, email);
      return false;
    }
    const a = Buffer.from(stored);
    const b = Buffer.from(this.hash(code));
    if (a.length != b.length || !timingSafeEqual(a, b)) return false;
    await this.remove(purpose, email);
    return true;
  }

  async acquireCooldown(purpose: OtpPurpose, email: string, seconds = 60) {
    const res = await this.redis.client.set(
      `${this.key(purpose, email)}:cooldown`,
      '1',
      'EX',
      seconds,
      'NX',
    );
    return res === 'OK';
  }

  async remove(purpose: OtpPurpose, email: string) {
    const key = this.key(purpose, email);
    await this.redis.client.del(key, `${key}:attempts`);
  }
}
