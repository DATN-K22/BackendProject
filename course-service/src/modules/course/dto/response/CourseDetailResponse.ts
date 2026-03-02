import { CourseLevel } from '@prisma/client'
import { ApiProperty } from '@nestjs/swagger'

export class CourseDetailResponse {
  @ApiProperty({
    description: 'Unique identifier for the course',
    example: 1
  })
  id: string

  @ApiProperty({
    description: 'URL to the course thumbnail image',
    example: 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=800'
  })
  thumbnail_url: string

  @ApiProperty({
    description: 'The title of the course',
    example: 'Complete Web Development Bootcamp 2024'
  })
  title: string

  @ApiProperty({
    description: 'The difficulty level of the course',
    enum: ['Beginner', 'Intermediate', 'Advanced'],
    example: 'Intermediate'
  })
  course_level: CourseLevel

  @ApiProperty({
    description: 'A brief summary of the course content',
    example:
      'Master modern web development with HTML, CSS, JavaScript, React, Node.js and more in this comprehensive course.'
  })
  short_description: string

  @ApiProperty({
    description: 'A detailed description of what will be learned in the course',
    example:
      "This complete web development bootcamp will take you from beginner to advanced level. You'll learn the latest technologies including HTML5, CSS3, JavaScript ES6+, React, Node.js, Express, MongoDB, and deployment strategies. Build real-world projects and gain the skills needed to become a professional web developer. Perfect for aspiring developers, career changers, and anyone looking to build modern web applications."
  })
  long_description: string

  @ApiProperty({
    description: 'ISO 8601 timestamp of when the course was created',
    example: '2024-01-15T10:00:00Z'
  })
  created_at: string

  @ApiProperty({
    example: {
      name: 'Example User',
      avt_url: null
    }
  })
  user: {
    name: string
    avt_url: string
  }

  @ApiProperty({
    description: 'The course rating on a scale of 0 to 5',
    example: 4.8,
    type: Number
  })
  rating: number

  @ApiProperty({
    description: 'The price of the course in USD',
    example: 49.99,
    type: Number
  })
  price: number

  @ApiProperty({ example: 45.5 })
  progress: number
}
