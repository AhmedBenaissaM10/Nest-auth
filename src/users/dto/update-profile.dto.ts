import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';
import { Trim } from '../../common/decorators/trim.decorator.js';

export class UpdateProfileDto {
  @ApiProperty({
    type: 'string',
    minLength: 2,
    maxLength: 50,
    example: 'John Doe',
  })
  @IsString()
  @Length(2, 50)
  @Trim()
  name: string;
}
