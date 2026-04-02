import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsNumber, IsOptional, IsString, ValidateNested } from 'class-validator';

export class PaymentItemDto {
  @ApiProperty({ example: 'Course fee', description: 'Item name' })
  @IsString()
  name: string;

  @ApiProperty({ example: 1, description: 'Item quantity' })
  @IsNumber()
  quantity: number;

  @ApiProperty({ example: 100000, description: 'Item unit price' })
  @IsNumber()
  price: number;

  @ApiProperty({ example: 'VND', description: 'Unit label' })
  @IsString()
  unit: string;

  @ApiProperty({ example: 10, description: 'Tax percentage for this item' })
  @IsNumber()
  taxPercentage: number;
}

export class PaymentInvoiceDto {
  @ApiProperty({ example: true, description: 'Whether buyer does not request invoice' })
  @IsBoolean()
  buyerNotGetInvoice: boolean;

  @ApiProperty({ example: 10, description: 'Invoice tax percentage' })
  @IsNumber()
  taxPercentage: number;
}

export class PaymentCreationDto {
  @ApiProperty({ example: 'Thanh toan khoa hoc', description: 'Payment description' })
  @IsOptional()
  description?: string;

  @ApiProperty({ example: 'Nguyen Van A', description: 'Buyer full name' })
  @IsString()
  buyerName: string;

  @ApiProperty({ example: 'ABC Company', description: 'Buyer company name' })
  @IsOptional()
  buyerCompanyName?: string;

  @ApiProperty({ example: '0101234567', description: 'Buyer tax code' })
  @IsOptional()
  buyerTaxCode?: string;

  @ApiProperty({ example: '123 Nguyen Trai, Ha Noi', description: 'Buyer address' })
  @IsOptional()
  buyerAddress?: string;

  @ApiProperty({ example: 'user@example.com', description: 'Buyer email address' })
  @IsOptional()
  buyerEmail?: string;

  @ApiProperty({ example: '0901234567', description: 'Buyer phone number' })
  @IsOptional()
  buyerPhone?: string;

  @ApiProperty({ type: () => PaymentItemDto, isArray: true, description: 'Payment items' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PaymentItemDto)
  items: PaymentItemDto[];

  @ApiProperty({ example: 'http://example.com/cancel', description: 'Cancel redirect URL' })
  @IsString()
  cancelUrl: string;

  @ApiProperty({ example: 'http://example.com/return', description: 'Success redirect URL' })
  @IsString()
  returnUrl: string;

  @ApiProperty({ type: () => PaymentInvoiceDto, description: 'Invoice information' })
  @ValidateNested()
  @Type(() => PaymentInvoiceDto)
  invoice: PaymentInvoiceDto;
}
