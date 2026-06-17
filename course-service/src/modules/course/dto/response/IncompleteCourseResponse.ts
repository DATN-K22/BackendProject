import { ApiProperty } from '@nestjs/swagger'

export class IncompleteCourse {
  @ApiProperty({ example: 123 })
  id!: string

  @ApiProperty({ example: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa' })
  thumbnail_url!: string

  @ApiProperty({ example: 'AWS Certified Solutions Architect - Associate (SAA-C03)' })
  title!: string

  @ApiProperty({
    example: {
      name: 'Example User',
      avt_url: null
    }
  })
  user!: {
    name: string
    avt_url: string
  }

  @ApiProperty({ example: '58.9' })
  progress!: number
}
