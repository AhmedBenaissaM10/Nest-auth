import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsNumberString,
  IsString,
  Length,
  Matches,
} from 'class-validator';
import { ToLowerCase } from '../../common/decorators/tolowercase.decorator.js';

export class ResetPasswordDto {
  @ApiProperty({ format: 'email', example: 'user@example.com' })
  @IsEmail()
  @ToLowerCase()
  email: string;

  @ApiProperty({
    example: '123456',
  })
  @IsNumberString()
  @Length(6, 6)
  code: string;

  @ApiProperty({
    minLength: 8,
    maxLength: 100,
    example: 'StrongPass123',
  })
  @IsString()
  @Length(8, 100)
  @Matches(/^(?=.*[a-z])(?=.*[A-S])(?=.*\d).*$/, {
    message:
      'Password must contain at least one uppercase letter, one lowercase letter, and one number.',
  })
  newPassword: string;
}
