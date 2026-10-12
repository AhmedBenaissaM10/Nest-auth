import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, Length, Matches } from 'class-validator';
import { ToLowerCase } from '../../common/decorators/tolowercase.decorator.js';

export class RegisterDto {
  @ApiProperty({
    type: 'string',
    minLength: 2,
    maxLength: 50,
    example: 'John Doe',
  })
  @IsString()
  @Length(2, 50)
  name: string;

  @ApiProperty({ format: 'email', example: 'user@example.com' })
  @IsEmail()
  @ToLowerCase()
  email: string;

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
  password: string;
}
