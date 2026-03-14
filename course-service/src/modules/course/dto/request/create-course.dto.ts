import { IsNumber } from '@nestjs/class-validator'
import { ApiProperty } from '@nestjs/swagger'
import { ContentStatus } from '@prisma/client'
import { IsEnum, IsOptional, IsString } from 'class-validator'

export class CreateCourseDto {
  @ApiProperty({ example: 'E.g: 1' })
  @IsString()
  owner_id: string

  @IsString()
  @ApiProperty({
    example: 'AWS Certified Solutions Architect - Associate (SAA-C03): Scaling and Decoupling Architectures'
  })
  title: string

  @ApiProperty({ example: '' })
  @IsString()
  @IsOptional()
  short_description?: string

  @ApiProperty({
    example:
      'Becoming an AWS Solutions Architect requires that you have a deep understanding of the entire AWS ecosystem and an understanding of properly designing optimized, decoupled architectures. In this course, AWS Certified Solutions Architect - Associate (SAA-C03): Scaling and Decoupling Architectures, you’re going to learn to efficiently implement AWS services and best practices to achieve this. First, you’ll explore how to leverage Elastic Load Balancers to front Auto Scaling Groups for self-healing architectures, as well as implementing messaging queues via Amazon SQS. Next, you’ll discover how to leverage serverless options for event-driven designs, including Amazon ECS containers, AWS Lambda functions, and Amazon EventBridge buses. Finally, you’ll learn how to implement different networking and application caching features to improve response times of your applications using services like Amazon CloudFront and AWS Global Accelerator. When you’re finished with this course, you’ll have the skills and knowledge of AWS Solutions Architecture needed to pass exam objectives covering these different AWS services, as well as successfully implement them into real-world designs.'
  })
  @IsString()
  @IsOptional()
  long_description?: string

  @ApiProperty({ example: '' })
  @IsString()
  @IsOptional()
  thumbnail_url?: string

  @ApiProperty({ example: '100000' })
  @IsNumber()
  price: number

  @ApiProperty({
    example: ContentStatus.draft,
    enum: ContentStatus
  })
  @IsEnum(ContentStatus)
  status: ContentStatus
}
