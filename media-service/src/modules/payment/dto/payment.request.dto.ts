import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Min,
  ValidateNested
} from 'class-validator';

export class PaymentItemDto {
  @ApiProperty({ example: 'Course fee', description: 'Item name' })
  @IsString()
  @IsNotEmpty({ message: 'Item name is required' })
  name: string;

  @ApiProperty({ example: 1, description: 'Item quantity' })
  @IsNumber()
  @Min(1, { message: 'Quantity must be at least 1' })
  quantity: number;

  @ApiProperty({ example: 100000, description: 'Item unit price in USD' })
  @IsNumber()
  @Min(0.0, { message: 'Price must be greater than 0' })
  price: number;

  @ApiPropertyOptional({ example: 'VND', description: 'Unit label' })
  @IsString()
  @IsOptional()
  unit?: string;

  @ApiPropertyOptional({ example: 10, description: 'Tax percentage for this item' })
  @IsNumber()
  @Min(0)
  @IsOptional()
  taxPercentage?: number;
}

export class PaymentInvoiceDto {
  @ApiProperty({ example: true, description: 'Whether buyer does not request invoice' })
  @IsBoolean()
  buyerNotGetInvoice: boolean;

  @ApiPropertyOptional({ example: 10, description: 'Invoice tax percentage' })
  @IsNumber()
  @Min(0)
  @IsOptional()
  taxPercentage?: number;
}

export class PaymentCreationDto {
  @ApiPropertyOptional({ example: 'Thanh toan khoa hoc', description: 'Payment description' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ example: 'Nguyen Van A', description: 'Buyer full name' })
  @IsString()
  @IsNotEmpty({ message: 'Buyer name is required' })
  buyerName: string;

  @ApiPropertyOptional({ example: 'ABC Company' })
  @IsString()
  @IsOptional()
  buyerCompanyName?: string;

  @ApiPropertyOptional({ example: '0101234567' })
  @IsString()
  @IsOptional()
  buyerTaxCode?: string;

  @ApiPropertyOptional({ example: '123 Nguyen Trai, Ha Noi' })
  @IsString()
  @IsOptional()
  buyerAddress?: string;

  @ApiPropertyOptional({ example: 'user@example.com' })
  @IsEmail({}, { message: 'Invalid email format' })
  @IsOptional()
  buyerEmail?: string;

  @ApiPropertyOptional({ example: '0901234567' })
  @IsString()
  @IsOptional()
  buyerPhone?: string;

  @ApiProperty({ type: () => PaymentItemDto, isArray: true })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PaymentItemDto)
  items: PaymentItemDto[];

  @ApiProperty({ example: 'http://example.com/cancel' })
  @IsUrl(
    {
      require_tld: false,
      allow_underscores: true
    },
    { message: 'cancelUrl must be a valid URL' }
  )
  cancelUrl: string;

  @ApiProperty({ example: 'http://example.com/return' })
  @IsUrl(
    {
      require_tld: false,
      allow_underscores: true
    },
    { message: 'returnUrl must be a valid URL' }
  )
  returnUrl: string;

  @ApiPropertyOptional({ type: () => PaymentInvoiceDto })
  @ValidateNested()
  @Type(() => PaymentInvoiceDto)
  @IsOptional()
  invoice?: PaymentInvoiceDto;
}
