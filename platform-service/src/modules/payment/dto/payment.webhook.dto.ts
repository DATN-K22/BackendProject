import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsNumber, IsString } from 'class-validator';

export class PayosWebhookDto {
  @ApiProperty()
  @IsString()
  code!: string; // '00' = success

  @ApiProperty()
  @IsString()
  desc!: string;

  @ApiProperty()
  @IsString()
  signature!: string; // HMAC-SHA256 for verification

  @ApiProperty()
  data!: {
    orderCode: number;
    amount: number;
    description: string;
    desc: string;
    accountNumber: string;
    reference: string;
    transactionDateTime: string;
    paymentLinkId: string;
    code: string;
    currency: string;
    counterAccountBankId?: string;
    counterAccountBankName?: string;
    counterAccountName?: string;
    counterAccountNumber?: string;
    virtualAccountName?: string;
    virtualAccountNumber?: string;
  };
}

export class WebhookResponseDto {
  @ApiProperty()
  success!: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  message?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  orderCode?: number;
}
