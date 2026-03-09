import { Injectable, UseGuards } from "@nestjs/common";
import { ScheduleService } from "./schedule.service";
import { Tool } from "@rekog/mcp-nest";
import z from "zod";
import { stringify } from "yaml";
import { RRule } from "rrule";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { GetUser } from "../auth/decorators/get-user.decorator";

/** Expands a single event row into all concrete occurrences within [windowStart, windowEnd]. */
function expandOccurrences(
    event: any,
    windowStart: Date,
    windowEnd: Date
): { start: Date; end: Date; title: string; [key: string]: any }[] {
    const duration = new Date(event.time_end).getTime() - new Date(event.time_start).getTime();

    if (!event.rrule_string) {
        const start = new Date(event.time_start);
        const end = new Date(event.time_end);
        if (start < windowEnd && end > windowStart) {
            return [{ ...event, start, end }];
        }
        return [];
    }

    const exDates = new Set(
        (event.exception_dates ?? []).map((e: any) => new Date(e.exception_date).toISOString())
    );

    const rule = RRule.fromString(event.rrule_string);
    return rule
        .between(windowStart, windowEnd, true)
        .filter(start => !exDates.has(start.toISOString()))
        .map(start => ({ id: event.id,
                         title: event.title, 
                         start, 
                         end: new Date(start.getTime() + duration) 
                      
        }));
}


@Injectable()
export class ScheduleTool {
    constructor(private readonly scheduleService: ScheduleService){}

    @Tool({
        name: "get-events",
        description: "Fetch events in the schedule of user in the limit of event happened within today and end date with the default value for endate is 90 days from today",
        parameters: z.object({
            userId: z.string(),
            today: z.string(),
            endDate: z.string().optional(),
            timeZone: z.string().default("Asia/Ho_Chi_Minh")
        }),
    })
    async getEvents({userId, today, endDate, timeZone}){
        const events = await this.scheduleService.getMySchedule(userId);
        const markDate = new Date(today);
        const upperBound = endDate != null
            ? new Date(endDate)
            : new Date(markDate.getTime() + 90 * 24 * 60 * 60 * 1000);

        const occurrences = events.flatMap(event => expandOccurrences(event, markDate, upperBound));


        return {
            content: [{
                type: 'text',
                text: stringify(occurrences)
            }],
        }
    }

    @Tool({
        name: "get-events-by-name-or-id",
        description: "Get event in the schedule of user by its name or id, ensure one and only one out of 2 field (eventName or eventId) is provided",
        parameters: z.object({
            userId: z.string(),
            eventName: z.string().optional(),
            eventId: z.string().optional()
        }),
    })
    async getEvent({userId, eventName, eventId}){
        let event: any;
        if (eventId != null) {
            event = this.scheduleService.getEventById(eventId, userId);
        } 
        else if (eventName != null) {
            event = this.scheduleService.getEventsByName(eventName, userId)
        }
        else {
            event = "No eventName or eventId provided"
        }
        return {
            content: [{
                type: 'text',
                text: stringify(event)
            }],
        }

    }


    @Tool({
        name: "create-event",
        description: "Create a new calendar event for a user. Supports one-time and recurring events via rrule_string.",
        parameters: z.object({
            userId: z.string(),
            title: z.string(),
            time_start: z.string().describe("ISO 8601 datetime, e.g. '2026-03-09T09:00:00+07:00'"),
            time_end: z.string().describe("ISO 8601 datetime, e.g. '2026-03-09T10:00:00+07:00'"),
            description: z.string().optional(),
            location: z.string().optional(),
            status: z.enum(["CONFIRMED", "TENTATIVE", "CANCELLED"]).optional(),
            timezone: z.string().optional().default("Asia/Ho_Chi_Minh"),
            rrule_string: z.string().optional().describe("RRULE string, e.g. 'RRULE:FREQ=WEEKLY;BYDAY=MO'"),
            recurrence_id: z.string().optional(),
            original_event_id: z.string().optional().describe("Parent event ID for exception instances"),
        }),
    })
    async createEvent({ userId, original_event_id, ...dto }) {
        const event = await this.scheduleService.createEvent(
            {
                ...dto,
                ...(original_event_id != null && { original_event_id: BigInt(original_event_id) }),
            } as any,
            userId
        );
        return {
            content: [{ type: 'text', text: stringify(event) }],
        };
    }

    @Tool({
        name: "update-event",
        description: "Update fields of an existing event. Only provided fields are changed.",
        parameters: z.object({
            userId: z.string(),
            eventId: z.string().describe("The numeric ID of the event to update"),
            title: z.string().optional(),
            time_start: z.string().optional().describe("ISO 8601 datetime"),
            time_end: z.string().optional().describe("ISO 8601 datetime"),
            description: z.string().optional(),
            location: z.string().optional(),
            status: z.enum(["CONFIRMED", "TENTATIVE", "CANCELLED"]).optional(),
            timezone: z.string().optional(),
            rrule_string: z.string().optional(),
            recurrence_id: z.string().optional(),
        }),
    })
    async updateEvent({ userId, eventId, ...dto }) {
        const result = await this.scheduleService.updateEvent(dto, userId, BigInt(eventId));
        return {
            content: [{ type: 'text', text: stringify(result) }],
        };
    }

    @Tool({
        name: "delete-event",
        description: "Delete an event and its entire recurrence series. If a child instance ID is given, the whole parent series is deleted.",
        parameters: z.object({
            userId: z.string(),
            eventId: z.string().describe("The numeric ID of the event to delete"),
        }),
    })
    async deleteEvent({ userId, eventId }) {
        const result = await this.scheduleService.deleteEvent(BigInt(eventId), userId);
        return {
            content: [{ type: 'text', text: result.message }],
        };
    }

    @Tool({
        name: "add-exception-date",
        description: "Skip a specific occurrence of a recurring event by adding an exception date (EXDATE). The occurrence on that date will no longer appear in the schedule.",
        parameters: z.object({
            userId: z.string(),
            eventId: z.string().describe("The numeric ID of the recurring event"),
            exception_date: z.string().describe("ISO 8601 date of the occurrence to skip, e.g. '2026-03-17T09:00:00+07:00'"),
            reason: z.string().optional().describe("Optional reason for skipping this occurrence"),
        }),
    })
    async addExDate({ userId, eventId, exception_date, reason }) {
        const result = await this.scheduleService.addExDate(
            { event_id: BigInt(eventId), exception_date, reason },
            userId
        );
        return {
            content: [{ type: 'text', text: stringify(result) }],
        };
    }

    @Tool({
        name: "modify-this-and-following",
        description: "Split a recurring series at a given date and apply updates to all occurrences from that point forward.",
        parameters: z.object({
            userId: z.string(),
            eventId: z.string().describe("The numeric ID of the recurring event"),
            recurrence_id: z.string().describe("ISO 8601 date of the occurrence to split from"),
            title: z.string().optional(),
            time_start: z.string().optional(),
            time_end: z.string().optional(),
            description: z.string().optional(),
            location: z.string().optional(),
            status: z.enum(["CONFIRMED", "TENTATIVE", "CANCELLED"]).optional(),
            timezone: z.string().optional(),
            rrule_string: z.string().optional(),
        }),
    })
    async modifyThisAndFollowing({ userId, eventId, recurrence_id, ...updates }) {
        const result = await this.scheduleService.modifyThisAndFollow(
            BigInt(eventId),
            new Date(recurrence_id),
            updates,
            userId
        );
        return {
            content: [{ type: 'text', text: stringify(result) }],
        };
    }

    @Tool({
        name: "get-free-time",
        description: "Get the free time slots per day within a daily working window (e.g. 09:00–18:00) for the next 3 months since today",
        parameters: z.object({
            userId: z.string(),
            today: z.string(),
            timeStart: z.string().describe("Daily window start in HH:mm format, e.g. '09:00'"),
            timeEnd: z.string().describe("Daily window end in HH:mm format, e.g. '18:00'")
        })
    })
    async get_free_time({ userId, today, timeStart, timeEnd }) {
        const rangeStart = new Date(today);
        const rangeEnd = new Date(rangeStart.getTime() + 90 * 24 * 60 * 60 * 1000);

        const events = await this.scheduleService.getMySchedule(userId);

        // Expand all recurrences within the 3-month window (respects RRULE + EXDATEs)
        const allOccurrences = events.flatMap(event => expandOccurrences(event, rangeStart, rangeEnd));

        const freeSlots: { date: string; free: { from: string; to: string }[] }[] = [];
        const MS_PER_DAY = 24 * 60 * 60 * 1000;

        for (let d = new Date(rangeStart); d < rangeEnd; d = new Date(d.getTime() + MS_PER_DAY)) {
            const dateStr = d.toISOString().split('T')[0];
            const dayStart = new Date(`${dateStr}T${timeStart}:00Z`);
            const dayEnd   = new Date(`${dateStr}T${timeEnd}:00Z`);

            // Clamp each overlapping occurrence to the day window and sort by start
            const busy = allOccurrences
                .filter(occ => occ.start < dayEnd && occ.end > dayStart)
                .map(occ => ({
                    start: Math.max(occ.start.getTime(), dayStart.getTime()),
                    end:   Math.min(occ.end.getTime(),   dayEnd.getTime())
                }))
                .sort((a, b) => a.start - b.start);

            // Walk through busy blocks and collect gaps
            const free: { from: string; to: string }[] = [];
            let cursor = dayStart.getTime();

            for (const block of busy) {
                if (block.start > cursor) {
                    free.push({ from: new Date(cursor).toISOString(), to: new Date(block.start).toISOString() });
                }
                cursor = Math.max(cursor, block.end);
            }

            if (cursor < dayEnd.getTime()) {
                free.push({ from: new Date(cursor).toISOString(), to: dayEnd.toISOString() });
            }

            if (free.length > 0) {
                freeSlots.push({ date: dateStr, free });
            }
        }

        return {
            content: [{ type: 'text', text: stringify(freeSlots) }]
        };
    }
}