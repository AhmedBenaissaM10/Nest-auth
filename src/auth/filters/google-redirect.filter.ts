import {
  ArgumentsHost,
  Catch,
  ConflictException,
  ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { Env } from '../../config/env.js';

@Catch()
export class OAuthRedirectFilter implements ExceptionFilter {
  private readonly logger = new Logger(OAuthRedirectFilter.name);

  constructor(private readonly config: ConfigService<Env, true>) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();

    if (exception instanceof HttpException) {
      this.logger.warn(`OAuth callback rejected: ${exception.message}`);
    } else {
      this.logger.error(
        'Unexpected error during OAuth callback',
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    const reason =
      exception instanceof ConflictException
        ? 'account_exists'
        : 'oauth_failed';

    const url = new URL(
      '/login',
      this.config.get('FRONTEND_URL', { infer: true }),
    );
    url.searchParams.set('error', reason);

    res.redirect(url.toString());
  }
}
