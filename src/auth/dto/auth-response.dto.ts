import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';
import { Role } from '../../generated/prisma/client.js';

export class PublicUserDto {
  @ApiProperty({
    format: 'uuid',
    example: '3f6c1c2e-8a1b-4d0e-9f3a-2b7c5d9e1a44',
  })
  id: string;

  @ApiProperty({ example: 'John Doe' })
  name: string;
  @ApiProperty({ format: 'email', example: 'ahmed@example.com' })
  email: string;

  @ApiProperty({ enum: Role, enumName: 'Role', example: Role.USER })
  role: Role;
}

export class AuthResultDto {
  @ApiProperty({ type: PublicUserDto })
  user: PublicUserDto;

  @ApiProperty({
    description:
      'JWT access token (15 minutes). Send it as "Authorization: Bearer <token>".',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  accessToken: string;
}

export class AccessTokenDto {
  @ApiProperty({
    description: 'New JWT access token (15 minutes).',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  accessToken: string;
}

export class CurrentUserDto {
  @ApiProperty({
    format: 'uuid',
    example: '3f6c1c2e-8a1b-4d0e-9f3a-2b7c5d9e1a44',
  })
  id: string;

  @ApiProperty({ enum: Role, enumName: 'Role', example: Role.USER })
  role: Role;
}

export class AuthMessageResponseDto {
  @ApiProperty({ example: 'Password has been reset successfully.' })
  @IsString()
  @IsNotEmpty()
  message!: string;
}
