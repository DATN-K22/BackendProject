import { Injectable, NotFoundException } from '@nestjs/common'
import { CreateMessageDto } from './dto/create-message.dto'
import { UpdateMessageDto } from './dto/update-message.dto'
import { PrismaService } from '../prisma/prisma.service'

@Injectable()
export class MessageService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createMessageDto: CreateMessageDto) {
    return await this.prisma.message.create({
      data: {
        ...createMessageDto,
        forum_id: BigInt(createMessageDto.forum_id),
        user_id: createMessageDto.user_id ? BigInt(createMessageDto.user_id) : undefined,
        parent_message_id: createMessageDto.parent_message_id ? BigInt(createMessageDto.parent_message_id) : undefined
      },
      include: {
        replies: true,
        parent_message: true
      }
    })
  }

  async findAllByForum(forumId: number) {
    const forum = await this.prisma.forum.findUnique({
      where: { id: BigInt(forumId) }
    })

    if (!forum) {
      throw new NotFoundException(`Forum with ID ${forumId} not found`)
    }

    return await this.prisma.message.findMany({
      where: {
        forum_id: BigInt(forumId),
        parent_message_id: null
      },
      include: {
        replies: {
          include: {
            replies: true
          }
        }
      },
      orderBy: { created_at: 'asc' }
    })
  }

  async findReplies(messageId: number) {
    const message = await this.prisma.message.findUnique({
      where: { id: BigInt(messageId) }
    })

    if (!message) {
      throw new NotFoundException(`Message with ID ${messageId} not found`)
    }

    return await this.prisma.message.findMany({
      where: { parent_message_id: BigInt(messageId) },
      include: { replies: true },
      orderBy: { created_at: 'asc' }
    })
  }

  async findOne(id: number) {
    const message = await this.prisma.message.findUnique({
      where: { id: BigInt(id) },
      include: {
        replies: true,
        parent_message: true
      }
    })

    if (!message) {
      throw new NotFoundException(`Message with ID ${id} not found`)
    }

    return message
  }

  async update(id: number, updateMessageDto: UpdateMessageDto) {
    await this.findOne(id)

    return await this.prisma.message.update({
      where: { id: BigInt(id) },
      data: {
        ...updateMessageDto,
        forum_id: updateMessageDto.forum_id ? BigInt(updateMessageDto.forum_id) : undefined,
        user_id: updateMessageDto.user_id ? BigInt(updateMessageDto.user_id) : undefined,
        parent_message_id: updateMessageDto.parent_message_id ? BigInt(updateMessageDto.parent_message_id) : undefined
      },
      include: {
        replies: true,
        parent_message: true
      }
    })
  }

  async remove(id: number) {
    await this.findOne(id)

    return await this.prisma.message.delete({
      where: { id: BigInt(id) }
    })
  }
}
