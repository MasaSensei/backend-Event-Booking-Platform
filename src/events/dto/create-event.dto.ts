/* eslint-disable @typescript-eslint/no-unsafe-call */
import {
  IsString,
  IsNotEmpty,
  IsArray,
  ValidateNested,
  IsInt,
  Min,
  IsISO8601,
  IsOptional,
} from 'class-validator';
import { Type } from 'class-transformer';

class CreateSlotDto {
  @IsString()
  @IsOptional()
  id?: string;

  @IsISO8601()
  startTime: string;

  @IsISO8601()
  endTime: string;

  @IsInt()
  @Min(1, { message: 'Kapasitas minimal 1 orang' })
  capacity: number;
}

export class CreateEventDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsNotEmpty()
  description: string;

  @IsString()
  @IsNotEmpty()
  location: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateSlotDto)
  slots: CreateSlotDto[];
}
