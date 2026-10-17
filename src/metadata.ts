/* eslint-disable */
export default async () => {
  const t = {
    ['./auth/dto/auth-response.dto.js']:
      await import('./auth/dto/auth-response.dto.js'),
  };
  return {
    '@nestjs/swagger': {
      models: [
        [
          import('./common/dto/api-envelope.dto.js'),
          {
            SuccessEnvelopeDto: {
              success: { required: true, type: () => Boolean },
              statusCode: { required: true, type: () => Number },
              path: { required: true, type: () => String },
              method: { required: true, type: () => String },
              timestamp: { required: true, type: () => String },
            },
            ErrorResponseDto: {
              success: { required: true, type: () => Boolean },
              statusCode: { required: true, type: () => Number },
              message: { required: true, type: () => Object },
              path: { required: true, type: () => String },
              method: { required: true, type: () => String },
              timestamp: { required: true, type: () => String },
            },
          },
        ],
        [
          import('./users/dto/update-profile.dto.js'),
          {
            UpdateProfileDto: {
              name: {
                required: true,
                type: () => String,
                minLength: 2,
                maxLength: 50,
              },
            },
          },
        ],
        [
          import('./auth/dto/login.dto.js'),
          {
            LoginDto: {
              email: { required: true, type: () => String, format: 'email' },
              password: { required: true, type: () => String },
            },
          },
        ],
        [
          import('./auth/dto/register.dto.js'),
          {
            RegisterDto: {
              name: {
                required: true,
                type: () => String,
                minLength: 2,
                maxLength: 50,
              },
              email: { required: true, type: () => String, format: 'email' },
              password: {
                required: true,
                type: () => String,
                minLength: 8,
                maxLength: 100,
                pattern: '^(?=.*[a-z])(?=.*[A-S])(?=.*\\d).*$',
              },
            },
          },
        ],
        [
          import('./auth/dto/change-password.dto.js'),
          {
            ChangePasswordDto: {
              currentPassword: { required: true, type: () => String },
              newPassword: {
                required: true,
                type: () => String,
                minLength: 8,
                maxLength: 128,
              },
            },
          },
        ],
        [
          import('./auth/dto/delete-account.dto.js'),
          {
            DeleteAccountDto: {
              password: { required: true, type: () => String },
            },
          },
        ],
        [
          import('./auth/dto/auth-response.dto.js'),
          {
            PublicUserDto: {
              id: { required: true, type: () => String },
              name: { required: true, type: () => String },
              email: { required: true, type: () => String },
              role: { required: true, enum: ['USER', 'ADMIN'] },
            },
            AuthResultDto: {
              user: {
                required: true,
                type: () => t['./auth/dto/auth-response.dto.js'].PublicUserDto,
              },
              accessToken: { required: true, type: () => String },
            },
            AccessTokenDto: {
              accessToken: { required: true, type: () => String },
            },
            CurrentUserDto: {
              id: { required: true, type: () => String },
              role: { required: true, enum: ['USER', 'ADMIN'] },
            },
          },
        ],
        [
          import('./users/dto/list-users.dto.js'),
          {
            UserListItemDto: {
              id: { required: true, type: () => String },
              name: { required: true, type: () => String },
              email: { required: true, type: () => String },
              role: { required: true, enum: ['USER', 'ADMIN'] },
              createdAt: { required: true, type: () => Date },
            },
          },
        ],
      ],
      controllers: [
        [
          import('./app.controller.js'),
          { AppController: { getHello: { type: String } } },
        ],
        [
          import('./auth/auth.controller.js'),
          {
            AuthController: {
              signup: {},
              login: {},
              refresh: {},
              logout: {},
              profile: { type: Object },
              getProfile: { type: Object },
              updateProfile: { type: Object },
              changePassword: {},
              deleteAccount: {},
              googleAuth: {},
              googleCallBack: {},
            },
          },
        ],
        [
          import('./users/users.controller.js'),
          { UsersController: { findAll: { type: [Object] }, findById: {} } },
        ],
        [
          import('./health/health.controller.js'),
          {
            HealthController: {
              live: { type: Object },
              ready: { type: Object },
            },
          },
        ],
      ],
    },
  };
};
