import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class RegisterDto {
  @IsEmail()
  @Transform(({ value }) => typeof value == 'string' ? value.toLowerCase() : value,)
  email: string;

  @IsString()
  @IsNotEmpty()
  password: string;
}
