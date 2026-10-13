import { IsEmail, IsNotEmpty, IsString } from 'class-validator';
import { ToLowerCase } from '../../common/decorators/tolowercase.decorator.js';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({ format: 'email', example: 'user@example.com' })
  @IsEmail()
  @ToLowerCase()
  email: string;
  @ApiProperty({ example: 'StrongPass123' })
  @IsString()
  @IsNotEmpty()
  password: string;
}
