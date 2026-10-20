import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ApiBearerAuth,
  ApiCookieAuth,
  ApiExcludeEndpoint,
  ApiNoContentResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import {
  ApiEnvelope,
  ApiErrors,
} from '../common/swagger/api-docs.decorator.js';
import { Env } from '../config/env.js';
import { UpdateProfileDto } from '../users/dto/update-profile.dto.js';
import { PublicUser, UsersService } from '../users/users.service.js';
import { REFRESH_COOKIE, REFRESH_TOKEN_TTL_SECONDS } from './auth.constants.js';
import { AuthService } from './auth.service.js';
import { CurrentUser } from './decorators/current-user.decorator.js';
import { Public } from './decorators/public.decorator.js';
import {
  AccessTokenDto,
  AuthResultDto,
  CurrentUserDto,
  PublicUserDto,
} from './dto/auth-response.dto.js';
import { ChangePasswordDto } from './dto/change-password.dto.js';
import { DeleteAccountDto } from './dto/delete-account.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { RegisterDto } from './dto/register.dto.js';
import { OAuthRedirectFilter } from './filters/google-redirect.filter.js';
import { GoogleAuthGuard } from './guards/google-auth.guard.js';
import type { AuthUser } from './types/auth-user.js';
import { OAuthProfile } from './types/oauth-profile.js';
import { SessionMeta } from './types/tokens.js';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly users: UsersService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('signup')
  @ApiOperation({
    summary: 'Create an account',
    description:
      'Creates the user, opens a session and sets the refresh token in an httpOnly cookie.',
  })
  @ApiEnvelope(AuthResultDto, { status: 201 })
  @ApiErrors(400, 409, 429)
  async signup(
    @Body() dto: RegisterDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { user, accessToken, refreshToken } = await this.authService.register(
      dto,
      this.getMeta(req),
    );
    this.setRefreshCookie(res, refreshToken);
    return { user, accessToken };
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Log in',
    description:
      'Opens a new session and sets the refresh token in an httpOnly cookie.',
  })
  @ApiEnvelope(AuthResultDto)
  @ApiErrors(400, 401, 429)
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { user, accessToken, refreshToken } = await this.authService.login(
      dto,
      this.getMeta(req),
    );
    this.setRefreshCookie(res, refreshToken);
    return { user, accessToken };
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiCookieAuth('refresh-cookie')
  @ApiOperation({
    summary: 'Get a new access token',
    description:
      'Reads the refresh token from the cookie, rotates it (new cookie) and returns a new access token. Reusing an old refresh token revokes all sessions of the user.',
  })
  @ApiEnvelope(AccessTokenDto)
  @ApiErrors(401, 429)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const token = req.cookies?.[REFRESH_COOKIE] as string | undefined;
    if (!token) throw new UnauthorizedException('Missing refresh token');
    try {
      const { accessToken, refreshToken } =
        await this.authService.refresh(token);
      this.setRefreshCookie(res, refreshToken);
      return { accessToken };
    } catch (error) {
      this.clearRefreshCookie(res);
      throw error;
    }
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiCookieAuth('refresh-cookie')
  @ApiOperation({
    summary: 'Log out',
    description: 'Revokes the current session and clears the refresh cookie.',
  })
  @ApiNoContentResponse({ description: 'Session revoked, cookie cleared' })
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = req.cookies?.[REFRESH_COOKIE] as string | undefined;
    await this.authService.logout(token);
    this.clearRefreshCookie(res);
  }

  @Get('me')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Get the current user (from the access token)' })
  @ApiEnvelope(CurrentUserDto)
  @ApiErrors(401)
  profile(@CurrentUser() user: AuthUser) {
    return user;
  }

  @Get('profile')
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Get my profile',
    description:
      'Returns the profile of the logged-in user, read from the database.',
  })
  @ApiEnvelope(PublicUserDto)
  @ApiErrors(401, 404)
  getProfile(@CurrentUser() user: AuthUser): Promise<PublicUser> {
    return this.users.findProfileById(user.id);
  }

  @Patch('profile')
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Update my profile',
    description: 'A user can only change their own name.',
  })
  @ApiEnvelope(PublicUserDto)
  @ApiErrors(400, 401, 404)
  updateProfile(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateProfileDto,
  ): Promise<PublicUser> {
    return this.users.updateProfile(user.id, dto);
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Change my password',
    description:
      'Requires the current password. Revokes every session (all devices), then opens a new one for this device.',
  })
  @ApiEnvelope(AccessTokenDto)
  @ApiErrors(400, 401, 404, 429)
  async changePassword(
    @CurrentUser() user: AuthUser,
    @Body() dto: ChangePasswordDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { accessToken, refreshToken } = await this.authService.changePassword(
      user.id,
      dto,
      this.getMeta(req),
    );
    this.setRefreshCookie(res, refreshToken);
    return { accessToken };
  }
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Delete('account')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Delete my account',
    description:
      'Requires the password. Deletes the user and all their sessions, and clears the refresh cookie.',
  })
  @ApiNoContentResponse({ description: 'Account deleted' })
  @ApiErrors(400, 401, 404, 429)
  async deleteAccount(
    @CurrentUser() user: AuthUser,
    @Body() dto: DeleteAccountDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.authService.deleteAccount(user.id, dto);
    this.clearRefreshCookie(res);
  }

  private getMeta(req: Request): SessionMeta {
    return { ip: req.ip, userAgent: req.headers['user-agent'] };
  }
  private cookieOptions() {
    return {
      httpOnly: true,
      secure: this.config.get('NODE_ENV', { infer: true }) === 'production',
      sameSite: 'strict' as const,
      path: '/api/auth',
    };
  }
  @Public()
  @UseGuards(GoogleAuthGuard)
  @Get('google')
  @ApiOperation({
    summary: 'Sign in with Google',
    description:
      'Open this URL in the browser (not with fetch). Redirects to Google, then back to the callback.',
  })
  @ApiResponse({ status: 302, description: 'Redirect to Google' })
  googleAuth() {}

  @Public()
  @UseGuards(GoogleAuthGuard)
  @UseFilters(OAuthRedirectFilter)
  @Get('google/callback')
  @ApiExcludeEndpoint()
  async googleCallBack(@Req() req: Request, @Res() res: Response) {
    const { refreshToken } = await this.authService.loginWithOAuth(
      req.user as OAuthProfile,
      this.getMeta(req),
    );
    this.setRefreshCookie(res, refreshToken);
    res.redirect(
      new URL(
        'auth/callback',
        this.config.get('FRONTEND_URL', { infer: true }),
      ).toString(),
    );
  }

  // private Methods
  private setRefreshCookie(res: Response, token: string) {
    res.cookie(REFRESH_COOKIE, token, {
      ...this.cookieOptions(),
      maxAge: REFRESH_TOKEN_TTL_SECONDS * 1000,
    });
  }
  private clearRefreshCookie(res: Response) {
    res.clearCookie(REFRESH_COOKIE, this.cookieOptions());
  }
}
