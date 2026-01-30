import { PartialType } from "@nestjs/mapped-types";
import { CreateEventDto } from "./event.dto";
import { IsInt } from "class-validator";

export class UpdateEventDto extends PartialType(CreateEventDto) {
    @IsInt()
    id: number;
}