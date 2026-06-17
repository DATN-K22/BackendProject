import { Logger } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';

export class ApiResponse<T> {
  constructor(success: boolean, code: number, message: string, data: any) {
    this.success = success;
    this.code = code;
    this.message = message;
    this.data = data;
    this.timestamp = new Date().toISOString();
  }

  @ApiProperty({ example: true })
  success: boolean = true;

  @ApiProperty({ example: 201 })
  code: number;

  @ApiProperty({ example: 'Success' })
  message?: string;

  data?: T | null;

  @ApiProperty({ example: '2024-10-01T12:34:56.789Z' })
  timestamp: string;

  static OkResponse(data: any, message: string = '', code: number = 2000) {
    return new ApiResponse(true, code, message, data);
  }

  static OkCreateResponse(data: any, message: string = '', code: number = 2001) {
    return new ApiResponse(true, code, message, data);
  }
}
