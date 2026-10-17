import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Profile, Strategy } from 'passport-google-oauth20';
import { Env } from '../../config/env.js';
import { OAuthProfile } from '../types/oauth-profile.js';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(config: ConfigService<Env, true>) {
    super({
      clientID: config.get('GOOGLE_CLIENT_ID', { infer: true }),
      clientSecret: config.get('GOOGLE_CLIENT_SECRET', { infer: true }),
      callbackURL: config.get('GOOGLE_CALLBACK_URL', { infer: true }),
      scope: ['email', 'profile'],
    });
  }

  validate(
    _accessToken: string,
    _refreshToken: string,
    profile: Profile,
  ): OAuthProfile {
    const email = profile.emails?.[0]?.value;
    const emailVerified = (profile._json as { email_verified?: boolean })
      .email_verified;

    if (!email || !emailVerified) {
      throw new UnauthorizedException('Google email is not verified');
    }

    return {
      provider: 'google',
      providerAccountId: profile.id,
      email,
      name: profile.displayName || email.split('@')[0],
    };
  }
}
