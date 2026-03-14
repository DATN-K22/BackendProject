import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post } from '@nestjs/common'
import { CreateMessageDto } from './dto/create-message.dto'
import { UpdateMessageDto } from './dto/update-message.dto'
import { MessageService } from './message.service'

@Controller('messages')
export class MessageController {
  constructor(private readonly messageService: MessageService) {}

  @Post()
  create(@Body() createMessageDto: CreateMessageDto) {
    return this.messageService.create(createMessageDto)
  }

  @Get('forum/:forumId')
  findAllByForum(@Param('forumId', ParseIntPipe) forumId: number) {
    return this.messageService.findAllByForum(forumId)
  }

  @Get(':id/replies')
  findReplies(@Param('id', ParseIntPipe) id: number) {
    return this.messageService.findReplies(id)
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.messageService.findOne(id)
  }

  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() updateMessageDto: UpdateMessageDto) {
    return this.messageService.update(id, updateMessageDto)
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.messageService.remove(id)
  }
}
