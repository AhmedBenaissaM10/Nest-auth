import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class LoginDto {
  @IsEmail()
  @Transform(({ value }) =>
    typeof value == 'string' ? value.toLowerCase() : value,
  )
  email: string;

  @IsString()
  @IsNotEmpty()
  password: string;
}
