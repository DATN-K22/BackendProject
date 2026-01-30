import { Injectable } from "@nestjs/common";
import { PrismaService } from "src/modules/prisma/prisma.service";
import { CreateFileDto } from "./dto/request/create-file.dto";

@Injectable()
export class FileRepository {
    constructor(private readonly prismaService: PrismaService) {}
    
    async create(createFileDto: CreateFileDto) {
        const record = await this.prismaService.resource.create({
            data: {
                title: createFileDto.title,
                type: createFileDto.type,
                link: createFileDto.link,
                manifest_url: createFileDto.manifest_url,
                thumb: createFileDto.thumb,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                lesson_id: createFileDto.lesson_id
            }
        })
        return {
            ...record,
            id: record.id.toString(),
            lesson_id: record.lesson_id.toString()
        }
    }

    async findById(id: number) {
        return this.prismaService.resource.findFirst({where: {id}})
    }

    async deleteById(id: number) {
        return this.prismaService.resource.delete({where: {id}})
    }
}