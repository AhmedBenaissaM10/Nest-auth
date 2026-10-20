import { UnauthorizedException } from '@nestjs/common';
import type { Profile } from 'passport-google-oauth20';
import { describe, expect, it } from 'vitest';
import { GoogleStrategy } from '../../src/auth/strategies/google.strategy.js';

const fakeConfig = {
  get: (key: string) =>
    key === 'GOOGLE_CALLBACK_URL'
      ? 'http://localhost:3001/api/auth/google/callback'
      : 'test-value',
};

const strategy = new GoogleStrategy(fakeConfig as never);

const profileOf = (overrides: Record<string, unknown> = {}) =>
  ({
    id: 'google-1',
    displayName: 'Ahmed',
    emails: [{ value: 'ahmed@example.com' }],
    _json: { email_verified: true },
    ...overrides,
  }) as unknown as Profile;

describe('GoogleStrategy.validate (unit)', () => {
  it('maps a verified Google profile to our OAuthProfile', () => {
    const result = strategy.validate('access', 'refresh', profileOf());

    expect(result).toEqual({
      provider: 'google',
      providerAccountId: 'google-1',
      email: 'ahmed@example.com',
      name: 'Ahmed',
    });
  });

  it('keeps Google tokens out of the result', () => {
    const result = strategy.validate('access', 'refresh', profileOf());

    expect(Object.keys(result).sort()).toEqual([
      'email',
      'name',
      'provider',
      'providerAccountId',
    ]);
  });

  it('rejects an email that Google has not verified', () => {
    const profile = profileOf({ _json: { email_verified: false } });

    expect(() => strategy.validate('access', 'refresh', profile)).toThrow(
      UnauthorizedException,
    );
  });

  it('rejects a profile that does not say whether the email is verified', () => {
    const profile = profileOf({ _json: {} });

    expect(() => strategy.validate('access', 'refresh', profile)).toThrow(
      UnauthorizedException,
    );
  });

  it('rejects a profile without an email', () => {
    expect(() =>
      strategy.validate('access', 'refresh', profileOf({ emails: [] })),
    ).toThrow(UnauthorizedException);
    expect(() =>
      strategy.validate('access', 'refresh', profileOf({ emails: undefined })),
    ).toThrow(UnauthorizedException);
  });

  it('uses the part of the email before @ when Google sends no name', () => {
    const result = strategy.validate(
      'access',
      'refresh',
      profileOf({ displayName: '' }),
    );

    expect(result.name).toBe('ahmed');
  });
});
