import { ApiProperty } from '@nestjs/swagger';
import { IsEmail } from 'class-validator';
import { ToLowerCase } from '../../common/decorators/tolowercase.decorator.js';

export class ForgotPasswordDto {
  @ApiProperty({ format: 'email', example: 'user@example.com' })
  @IsEmail()
  @ToLowerCase()
  email: string;
}
