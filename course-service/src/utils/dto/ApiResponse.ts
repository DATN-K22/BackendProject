import { ApiProperty } from "@nestjs/swagger";

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

    static OkResponse(message: string, data: any, code: number = 2000) {
        return new ApiResponse(true, 2000, message, data);
    }

    static OkCreateResponse(message: string, data: any, code: number = 2001) {
        return new ApiResponse(true, code, message, data);
    }
}