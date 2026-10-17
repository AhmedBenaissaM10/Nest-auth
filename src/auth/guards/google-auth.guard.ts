import {
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthGuard } from '@nestjs/passport';
import { randomBytes, timingSafeEqual } from 'crypto';
import type { Request, Response } from 'express';
import { Env } from '../../config/env.js';
import { OAUTH_STATE_COOKIE } from '../auth.constants.js';

const STATE_TTL_MS = 10 * 60 * 1000;
// Goo
@Injectable()
export class GoogleAuthGuard extends AuthGuard('google') {
  constructor(private readonly config: ConfigService<Env, true>) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const { req, res } = this.getHttp(context);

    if (this.isCallback(req)) {
      this.verifyState(req, res);
    }

    return super.canActivate(context);
  }

  getAuthenticateOptions(context: ExecutionContext) {
    const { req, res } = this.getHttp(context);

    if (this.isCallback(req)) return {};

    const state = randomBytes(32).toString('hex');
    res.cookie(OAUTH_STATE_COOKIE, state, {
      ...this.cookieOptions(),
      maxAge: STATE_TTL_MS,
    });

    return { state };
  }

  private verifyState(req: Request, res: Response) {
    const expected = req.cookies?.[OAUTH_STATE_COOKIE] as string | undefined;
    const received =
      typeof req.query.state === 'string' ? req.query.state : undefined;

    res.clearCookie(OAUTH_STATE_COOKIE, this.cookieOptions());

    if (!expected || !received) {
      throw new UnauthorizedException('Invalid OAuth state');
    }

    const a = Buffer.from(expected);
    const b = Buffer.from(received);

    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new UnauthorizedException('Invalid OAuth state');
    }
  }

  private isCallback(req: Request) {
    return req.path.endsWith('/callback');
  }

  private getHttp(context: ExecutionContext) {
    const http = context.switchToHttp();
    return {
      req: http.getRequest<Request>(),
      res: http.getResponse<Response>(),
    };
  }

  private cookieOptions() {
    return {
      httpOnly: true,
      secure: this.config.get('NODE_ENV', { infer: true }) === 'production',
      sameSite: 'lax' as const,
      path: 'api/auth/google',
    };
  }
}
