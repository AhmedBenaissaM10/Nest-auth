import { HealthIndicatorService } from '@nestjs/terminus';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DatabaseHealthIndicator } from '../../src/health/database.health.js';
import type { PrismaService } from '../../src/prisma/prisma.service.js';

const makeIndicator = (queryRaw: () => Promise<unknown>) =>
  new DatabaseHealthIndicator(new HealthIndicatorService(), {
    $queryRaw: queryRaw,
  } as unknown as PrismaService);

describe('DatabaseHealthIndicator (unit)', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('reports up when the query succeeds', async () => {
    const indicator = makeIndicator(async () => [{ '?column?': 1 }]);

    const result = await indicator.isHealthy('database');

    expect(result).toMatchObject({ database: { status: 'up' } });
  });

  it('reports down when the query fails, without leaking the error', async () => {
    const indicator = makeIndicator(async () => {
      throw new Error('connection refused to secret-host:5432');
    });

    const result = await indicator.isHealthy('database');

    expect(result).toMatchObject({ database: { status: 'down' } });
    expect(JSON.stringify(result)).not.toContain('secret-host');
  });

  it('reports down when the query hangs for more than 3 seconds', async () => {
    vi.useFakeTimers();
    const indicator = makeIndicator(() => new Promise(() => {}));

    const pending = indicator.isHealthy('database');
    await vi.advanceTimersByTimeAsync(3000);

    expect(await pending).toMatchObject({ database: { status: 'down' } });
  });

  it('clears its timer after a successful query', async () => {
    vi.useFakeTimers();
    const indicator = makeIndicator(async () => [{ '?column?': 1 }]);

    await indicator.isHealthy('database');

    expect(vi.getTimerCount()).toBe(0);
  });
});
