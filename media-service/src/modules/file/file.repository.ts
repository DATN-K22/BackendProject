import { Injectable } from "@nestjs/common";
import { PrismaService } from "src/modules/prisma/prisma.service";

@Injectable()
class FileRepository {
    constructor(private readonly prismaService: PrismaService) {}
    
}