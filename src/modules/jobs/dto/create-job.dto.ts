import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
  IsArray as IsArrayValidator,
} from 'class-validator';

class TargetDto {
  @IsString()
  @IsNotEmpty()
  url: string;

  @IsString()
  @IsIn(['GET', 'POST', 'PUT', 'PATCH', 'DELETE'])
  method: string;
}

class RetriesDto {
  @IsBoolean()
  @IsOptional()
  enabled?: boolean;

  @IsInt()
  @IsOptional()
  max_attempts?: number;

  @IsArrayValidator()
  @IsOptional()
  retryable_statuses?: number[];

  @IsString()
  @IsOptional()
  on_failure?: string;
}

export class CreateJobDto {
  @IsIn(['oneoff', 'recurring'])
  type: 'oneoff' | 'recurring';

  @ValidateNested()
  @Type(() => TargetDto)
  target: TargetDto;

  @IsObject()
  @IsOptional()
  headers?: Record<string, string>;

  @IsObject()
  @IsOptional()
  params?: Record<string, any>;

  @IsObject()
  @IsOptional()
  payload?: any;

  @IsObject()
  @IsOptional()
  body?: any;

  @IsOptional()
  scheduling?: any;

  @ValidateNested()
  @Type(() => RetriesDto)
  @IsOptional()
  retries?: RetriesDto;
}
