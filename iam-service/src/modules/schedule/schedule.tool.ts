import { Injectable, UseGuards } from "@nestjs/common";
import { ScheduleService } from "./schedule.service";
import { Tool } from "@rekog/mcp-nest";
import z from "zod";
import { stringify } from "yaml";
import { RRule } from "rrule";
import { id } from "zod/v4/locales";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function parseOffsetMinutes(offsetText: string): number {
    // Supports values like GMT+7, GMT+07:00, UTC-04:30
    const match = offsetText.match(/^(?:GMT|UTC)([+-])(\d{1,2})(?::?(\d{2}))?$/);
    if (!match) return 0;
    const sign = match[1] === "+" ? 1 : -1;
    const hours = Number(match[2]);
    const minutes = Number(match[3] ?? "0");
    return sign * (hours * 60 + minutes);
}

function getTimeZoneOffsetMinutes(date: Date, timeZone: string): number {
    const formatter = new Intl.DateTimeFormat("en-US", {
        timeZone,
        hour12: false,
        timeZoneName: "shortOffset",
    });
    const tzPart = formatter.formatToParts(date).find(p => p.type === "timeZoneName")?.value ?? "GMT+0";
    return parseOffsetMinutes(tzPart);
}

function parseHHmm(time: string): { hours: number; minutes: number } {
    const [hoursRaw, minutesRaw] = time.split(":");
    const hours = Number(hoursRaw);
    const minutes = Number(minutesRaw);
    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
        throw new Error(`Invalid time format: ${time}. Expected HH:mm`);
    }
    return { hours, minutes };
}

function localDateTimeToUtc(dateStr: string, timeStr: string, timeZone: string): Date {
    const [yearRaw, monthRaw, dayRaw] = dateStr.split("-");
    const year = Number(yearRaw);
    const month = Number(monthRaw);
    const day = Number(dayRaw);
    const { hours, minutes } = parseHHmm(timeStr);

    const utcGuess = new Date(Date.UTC(year, month - 1, day, hours, minutes, 0, 0));
    const offsetMinutes = getTimeZoneOffsetMinutes(utcGuess, timeZone);
    const correctedUtc = new Date(utcGuess.getTime() - offsetMinutes * 60 * 1000);

    // Re-check once after correction for DST boundaries in zones that shift.
    const correctedOffsetMinutes = getTimeZoneOffsetMinutes(correctedUtc, timeZone);
    if (correctedOffsetMinutes !== offsetMinutes) {
        return new Date(utcGuess.getTime() - correctedOffsetMinutes * 60 * 1000);
    }

    return correctedUtc;
}

function formatDateInTimeZone(date: Date, timeZone: string): string {
    const formatter = new Intl.DateTimeFormat("en-CA", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    });
    return formatter.format(date);
}

function normalizeDateInput(input: string, timeZone: string): string {
    if (/^\d{4}-\d{2}-\d{2}$/.test(input)) {
        return input;
    }
    return formatDateInTimeZone(new Date(input), timeZone);
}

function addDaysToDateString(dateStr: string, days: number): string {
    const [yearRaw, monthRaw, dayRaw] = dateStr.split("-");
    const baseUtc = new Date(Date.UTC(Number(yearRaw), Number(monthRaw) - 1, Number(dayRaw)));
    baseUtc.setUTCDate(baseUtc.getUTCDate() + days);
    const y = baseUtc.getUTCFullYear();
    const m = String(baseUtc.getUTCMonth() + 1).padStart(2, "0");
    const d = String(baseUtc.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
}

function weekdayNameFromDateString(dateStr: string): string {
    const [yearRaw, monthRaw, dayRaw] = dateStr.split("-");
    const date = new Date(Date.UTC(Number(yearRaw), Number(monthRaw) - 1, Number(dayRaw)));
    return date.toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" }).toLowerCase();
}


/** Expands a single event row into all concrete occurrences within [windowStart, windowEnd]. */
function expandOccurrences(
    event: any,
    windowStart: Date,
    windowEnd: Date
): { start: Date; end: Date; title: string;[key: string]: any }[] {
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

    // Ensure recurrence expansion anchors to the event's stored start time.
    // RRule.fromString without DTSTART may default to "now", which shifts times.
    const parsed = RRule.parseString(event.rrule_string);
    const rule = new RRule({
        ...parsed,
        dtstart: new Date(event.time_start),
    });
    return rule
        .between(windowStart, windowEnd, true)
        .filter(start => !exDates.has(start.toISOString()))
        .map(start => ({
            id: event.id,
            title: event.title,
            start,
            end: new Date(start.getTime() + duration),
            rrule: event.rrule_string

        }));
}


@Injectable()
export class ScheduleTool {
    constructor(private readonly scheduleService: ScheduleService) { }

    private requireMutationApproval(approvalStatus: string | undefined): string | null {
        if (!approvalStatus || approvalStatus.toLowerCase() !== "approved") {
            return "APPROVAL REQUIRED: Call 'request_schedule_approval' first, present the changes to the user, wait for their reply, then call 'resolve_schedule_approval' with decision='approved'. Only then call this tool with approval_status='approved'.";
        }
        return null;
    }

    @Tool({
        name: "get-events",
        description: "Fetch events in a user's schedule from today to endDate (inclusive). If endDate is omitted, the window defaults to 90 days later from today. Date boundaries are interpreted in timeZone.",
        parameters: z.object({
            today: z.string(),
            endDate: z.string().optional(),
            timeZone: z.string().default("Asia/Ho_Chi_Minh")
        }),
    })
    async getEvents({ today, endDate, timeZone }: { today: string; endDate?: string; timeZone: string }, context: any, req: any) {
        const userId = req.user?.id ?? req.headers["x-user-id"];
        const events = await this.scheduleService.getMySchedule(userId);
        const startDateStr = normalizeDateInput(today, timeZone);
        const markDate = localDateTimeToUtc(startDateStr, "00:00", timeZone);

        const upperBound = endDate != null
            ? new Date(localDateTimeToUtc(normalizeDateInput(endDate, timeZone), "00:00", timeZone).getTime() + MS_PER_DAY - 1)
            : new Date(markDate.getTime() + 90 * MS_PER_DAY);

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
        parameters: z
            .object({
                eventName: z.string().trim().min(1).optional(),
                eventId: z.string().trim().regex(/^\d+$/, "eventId must be a numeric string").optional()
            })
            .refine(
                ({ eventName, eventId }) => Number(Boolean(eventName)) + Number(Boolean(eventId)) === 1,
                "Provide exactly one of eventName or eventId"
            ),
    })
    async getEvent({ eventName, eventId }: { eventName?: string; eventId?: string }, context: any, req: any) {
        const userId = req.user?.id ?? req.headers["x-user-id"];
        let event: any;
        if (eventId) {
            event = await this.scheduleService.getEventById(BigInt(eventId), userId);
        }
        else if (eventName) {
            event = await this.scheduleService.getEventsByName(eventName, userId)
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
        description: "Create a new calendar event. Only call this after 'resolve_schedule_approval' returned status='approved'. Supports one-time and recurring events via rrule_string.",
        parameters: z.object({
            approval_status: z.literal("approved").describe("Set to 'approved' only after 'resolve_schedule_approval' returned status='approved'. Follow the request_schedule_approval → resolve_schedule_approval flow first."),
            approval_id: z.string().optional().describe("The approval_id from 'request_schedule_approval', passed through 'resolve_schedule_approval'"),
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
            course_id: z.string().trim().regex(/^\d+$/, "course_id must be a numeric string").optional(),
        }),
    })
    async createEvent({ approval_status, original_event_id, course_id, ...dto }: any, context: any, req: any) {
        const userId = req.user?.id ?? req.headers["x-user-id"];
        const approvalError = this.requireMutationApproval(approval_status);
        if (approvalError) {
            return {
                content: [{ type: 'text', text: approvalError }],
            };
        }
        const event = await this.scheduleService.createEvent(
            {
                ...dto,
                ...(original_event_id != null && { original_event_id: BigInt(original_event_id) }),
                ...(course_id != null && { course_id: BigInt(course_id) }),
            } as any,
            userId
        );
        return {
            content: [{ type: 'text', text: stringify(event) }],
        };
    }

    @Tool({
        name: "update-event",
        description: "Update fields of an existing event. Only call this after 'resolve_schedule_approval' returned status='approved'. Only provided fields are changed.",
        parameters: z.object({
            approval_status: z.literal("approved").describe("Set to 'approved' only after 'resolve_schedule_approval' returned status='approved'. Follow the request_schedule_approval → resolve_schedule_approval flow first."),
            approval_id: z.string().optional().describe("The approval_id from 'request_schedule_approval', passed through 'resolve_schedule_approval'"),
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
            course_id: z.string().trim().regex(/^\d+$/, "course_id must be a numeric string").optional(),
        }),
    })
    async updateEvent({ approval_status, eventId, userId: _userId, course_id, ...dto }: any, context: any, req: any) {
        const userId = req.user?.id ?? req.headers["x-user-id"];
        const approvalError = this.requireMutationApproval(approval_status);
        if (approvalError) {
            return {
                content: [{ type: 'text', text: approvalError }],
            };
        }
        const result = await this.scheduleService.updateEvent(
            {
                ...dto,
                ...(course_id != null && { course_id: BigInt(course_id) }),
            } as any,
            userId,
            BigInt(eventId)
        );
        return {
            content: [{ type: 'text', text: stringify(result) }],
        };
    }

    @Tool({
        name: "delete-event",
        description: "Delete an event and its entire recurrence series. Only call this after 'resolve_schedule_approval' returned status='approved'. If a child instance ID is given, the whole parent series is deleted.",
        parameters: z.object({
            approval_status: z.literal("approved").describe("Set to 'approved' only after 'resolve_schedule_approval' returned status='approved'. Follow the request_schedule_approval → resolve_schedule_approval flow first."),
            approval_id: z.string().optional().describe("The approval_id from 'request_schedule_approval', passed through 'resolve_schedule_approval'"),
            eventId: z.string().describe("The numeric ID of the event to delete"),
        }),
    })
    async deleteEvent({ approval_status, eventId }: any, context: any, req: any) {
        const userId = req.user?.id ?? req.headers["x-user-id"];
        const approvalError = this.requireMutationApproval(approval_status);
        if (approvalError) {
            return {
                content: [{ type: 'text', text: approvalError }],
            };
        }
        const result = await this.scheduleService.deleteEvent(BigInt(eventId), userId);
        return {
            content: [{ type: 'text', text: result.message }],
        };
    }

    @Tool({
        name: "add-exception-date",
        description: "Skip a specific occurrence of a recurring event by adding an exception date (EXDATE). Only call this after 'resolve_schedule_approval' returned status='approved'. The occurrence on that date will no longer appear in the schedule.",
        parameters: z.object({
            approval_status: z.literal("approved").describe("Set to 'approved' only after 'resolve_schedule_approval' returned status='approved'. Follow the request_schedule_approval → resolve_schedule_approval flow first."),
            approval_id: z.string().optional().describe("The approval_id from 'request_schedule_approval', passed through 'resolve_schedule_approval'"),
            eventId: z.string().describe("The numeric ID of the recurring event"),
            exception_date: z.string().describe("ISO 8601 date of the occurrence to skip, e.g. '2026-03-17T09:00:00+07:00'"),
            reason: z.string().optional().describe("Optional reason for skipping this occurrence"),
        }),
    })
    async addExDate({ approval_status, eventId, exception_date, reason }: any, context: any, req: any) {
        const userId = req.user?.id ?? req.headers["x-user-id"];
        const approvalError = this.requireMutationApproval(approval_status);
        if (approvalError) {
            return {
                content: [{ type: 'text', text: approvalError }],
            };
        }
        const result = await this.scheduleService.addExDate(
            { event_id: BigInt(eventId), exception_date, reason },
            userId
        );
        return {
            content: [{ type: 'text', text: stringify(result) }],
        };
    }
    @Tool({
        name: "modify-this-only",
        description: "Edit a single occurrence of a recurring event without affecting past or future occurrences. Only call this after 'resolve_schedule_approval' returned status='approved'. Creates a standalone exception event linked to the parent series with the provided changes.",
        parameters: z.object({
            approval_status: z.literal("approved").describe("Set to 'approved' only after 'resolve_schedule_approval' returned status='approved'. Follow the request_schedule_approval → resolve_schedule_approval flow first."),
            approval_id: z.string().optional().describe("The approval_id from 'request_schedule_approval', passed through 'resolve_schedule_approval'"),
            eventId: z.string().describe("The numeric ID of the parent recurring event"),
            recurrence_id: z.string().describe("ISO 8601 datetime of the specific occurrence to modify, e.g. '2026-04-07T09:00:00+07:00'"),
            title: z.string().optional(),
            time_start: z.string().optional().describe("ISO 8601 datetime for the new start of this occurrence"),
            time_end: z.string().optional().describe("ISO 8601 datetime for the new end of this occurrence"),
            description: z.string().optional(),
            location: z.string().optional(),
            status: z.enum(["CONFIRMED", "TENTATIVE", "CANCELLED"]).optional(),
            timezone: z.string().optional().default("Asia/Ho_Chi_Minh"),
        }),
    })
    async modifyThisOnly(
        { approval_status, eventId, recurrence_id, ...updates }: any,
        context: any,
        req: any
    ) {
        const userId = req.user?.id ?? req.headers["x-user-id"];
        const approvalError = this.requireMutationApproval(approval_status);
        if (approvalError) {
            return {
                content: [{ type: 'text', text: approvalError }],
            };
        }
        const parentId = BigInt(eventId);

        // Fetch parent to inherit unmodified fields — pass BigInt so the service lookup matches the DB key type
        const parent = await this.scheduleService.getEventById(parentId as any, userId);
        if (!parent) {
            return {
                content: [{ type: 'text', text: 'Parent event not found or access denied.' }],
            };
        }


        const exceptionEvent = await this.scheduleService.createEvent(
            {
                title: updates.title ?? parent.title,
                time_start: updates.time_start ?? recurrence_id,
                time_end: updates.time_end ?? this.shiftEnd(parent, recurrence_id),
                description: updates.description ?? parent.description,
                location: updates.location ?? parent.location,
                status: updates.status ?? parent.status,
                timezone: updates.timezone ?? parent.timezone,
                recurrence_id,
                original_event_id: parentId,
            } as any,
            userId
        );

        return {
            content: [{ type: 'text', text: stringify(exceptionEvent) }],
        };
    }

    private shiftEnd(parent: any, newStart: string): string {
        const duration =
            new Date(parent.time_end).getTime() - new Date(parent.time_start).getTime();
        return new Date(new Date(newStart).getTime() + duration).toISOString();
    }

    @Tool({
        name: "modify-this-and-following",
        description: "Split a recurring series at a given date and apply updates to all occurrences from that point forward. Only call this after 'resolve_schedule_approval' returned status='approved'.",
        parameters: z.object({
            approval_status: z.literal("approved").describe("Set to 'approved' only after 'resolve_schedule_approval' returned status='approved'. Follow the request_schedule_approval → resolve_schedule_approval flow first."),
            approval_id: z.string().optional().describe("The approval_id from 'request_schedule_approval', passed through 'resolve_schedule_approval'"),
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
    async modifyThisAndFollowing({ approval_status, eventId, recurrence_id, ...updates }: any, context: any, req: any) {
        const userId = req.user?.id ?? req.headers["x-user-id"];
        const approvalError = this.requireMutationApproval(approval_status);
        if (approvalError) {
            return {
                content: [{ type: 'text', text: approvalError }],
            };
        }
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
        description: "Get free time slots per day within a daily local-time window (e.g. 09:00-18:00) for the next 3 months since today. Optional filters: weekday and minimum duration.",
        parameters: z.object({
            today: z.string(),
            timeStart: z.string().describe("Daily window start in HH:mm format, e.g. '09:00'"),
            timeEnd: z.string().describe("Daily window end in HH:mm format, e.g. '18:00'"),
            timeZone: z.string().default("Asia/Ho_Chi_Minh"),
            weekday: z
                .enum(["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"])
                .optional()
                .describe("Optional weekday filter in lowercase, e.g. 'thursday'"),
            minDurationMinutes: z
                .number()
                .int()
                .positive()
                .optional()
                .describe("Optional minimum free-slot duration in minutes, e.g. 120 for a 2-hour slot")
        })
    })
    async get_free_time(
        {
            today,
            timeStart,
            timeEnd,
            timeZone,
            weekday,
            minDurationMinutes,
        }: {
            today: string;
            timeStart: string;
            timeEnd: string;
            timeZone: string;
            weekday?: "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday";
            minDurationMinutes?: number;
        },
        context: any,
        req: any
    ) {
        const userId = req.user?.id ?? req.headers["x-user-id"];
        const startDateStr = normalizeDateInput(today, timeZone);
        const rangeStart = localDateTimeToUtc(startDateStr, "00:00", timeZone);
        const rangeEnd = localDateTimeToUtc(addDaysToDateString(startDateStr, 90), "00:00", timeZone);

        const events = await this.scheduleService.getMySchedule(userId);

        // Expand all recurrences within the 3-month window (respects RRULE + EXDATEs)
        const allOccurrences = events.flatMap(event => expandOccurrences(event, rangeStart, rangeEnd));

        const freeSlots: { date: string; free: { from: string; to: string }[] }[] = [];

        for (let i = 0; i < 90; i++) {
            const dateStr = addDaysToDateString(startDateStr, i);

            if (weekday && weekdayNameFromDateString(dateStr) !== weekday) {
                continue;
            }

            const dayStart = localDateTimeToUtc(dateStr, timeStart, timeZone);
            let dayEnd = localDateTimeToUtc(dateStr, timeEnd, timeZone);
            if (dayEnd <= dayStart) {
                dayEnd = new Date(dayEnd.getTime() + MS_PER_DAY);
            }

            // Clamp each overlapping occurrence to the day window and sort by start
            const busy = allOccurrences
                .filter(occ => occ.start < dayEnd && occ.end > dayStart)
                .map(occ => ({
                    start: Math.max(occ.start.getTime(), dayStart.getTime()),
                    end: Math.min(occ.end.getTime(), dayEnd.getTime())
                }))
                .sort((a, b) => a.start - b.start);

            // Walk through busy blocks and collect gaps
            const free: { from: string; to: string }[] = [];
            let cursor = dayStart.getTime();

            for (const block of busy) {
                if (block.start > cursor) {
                    const from = new Date(cursor);
                    const to = new Date(block.start);
                    const durationMinutes = Math.floor((to.getTime() - from.getTime()) / 60000);
                    if (!minDurationMinutes || durationMinutes >= minDurationMinutes) {
                        free.push({ from: from.toISOString(), to: to.toISOString() });
                    }
                }
                cursor = Math.max(cursor, block.end);
            }

            if (cursor < dayEnd.getTime()) {
                const from = new Date(cursor);
                const to = dayEnd;
                const durationMinutes = Math.floor((to.getTime() - from.getTime()) / 60000);
                if (!minDurationMinutes || durationMinutes >= minDurationMinutes) {
                    free.push({ from: from.toISOString(), to: to.toISOString() });
                }
            }

            if (free.length > 0) {
                freeSlots.push({ date: dateStr, free });
            }
        }

        return {
            content: [{ type: 'text', text: stringify(freeSlots) }]
        };
    }
    @Tool({
        name: "build-event-by-block-planner",
        description: "Commit a course schedule in full-replace mode. Supports either (A) direct sessions list, or (B) lesson blocks + time slots for automatic packing.",
        parameters: z.object({
            approval_status: z.literal("approved").describe("Set to 'approved' only after the schedule approval flow is completed."),
            approval_id: z.string().optional().describe("The approval_id returned by the approval flow."),
            courseTitle: z.string().min(1).describe("Course title used for matching/deleting previous course events."),
            course_id: z.string().trim().regex(/^\d+$/, "course_id must be a numeric string").optional().describe("Optional course id stored on created events and used for precise replacement matching."),
            replace_mode: z.boolean().optional().default(false).describe("If true, delete existing related events before creating new ones. Default false (append-only)."),
            sessions: z.array(
                z.object({
                    title: z.string().min(1),
                    description: z.string().optional().default(""),
                    time_start: z.iso.datetime({ offset: true }),
                    time_end: z.iso.datetime({ offset: true }),
                    timezone: z.string().optional().default("Asia/Ho_Chi_Minh"),
                })
            ).optional().describe("Preferred mode: direct list of sessions to create."),
            blocks: z.array(
                z.object({
                    title: z.string(),
                    durationMinutes: z.number().int().positive(),
                    chapter_index: z.number().int().positive(),
                    lesson_index: z.number().int().positive(),
                })
            ).optional().describe("Optional mode B input. If sessions is omitted, blocks are packed into provided time slots."),
            timeSlot: z.array(
                z.object({
                    from: z.iso.datetime({ offset: true }),
                    to: z.iso.datetime({ offset: true })
                })
            ).optional().describe("Optional mode B input. Ordered free time slots for packing blocks."),
        }).refine(
            (v) => (Array.isArray(v.sessions) && v.sessions.length > 0) || ((Array.isArray(v.blocks) && v.blocks.length > 0) && (Array.isArray(v.timeSlot) && v.timeSlot.length > 0)),
            "Provide either sessions, or both blocks and timeSlot"
        )
    })
    async buildEventByBlockPlanner(
        {
            approval_status,
            courseTitle,
            course_id,
            replace_mode = false,
            sessions,
            blocks,
            timeSlot,
        }: {
            approval_status: "approved";
            approval_id?: string;
            courseTitle: string;
            course_id?: string;
            replace_mode?: boolean;
            sessions?: { title: string; description?: string; time_start: string; time_end: string; timezone?: string }[];
            blocks?: { title: string; durationMinutes: number; chapter_index: number; lesson_index: number }[];
            timeSlot?: { from: string; to: string }[];
        },
        context: any,
        req: any
    ) {
        const userId = req.user?.id ?? req.headers["x-user-id"];
        const approvalError = this.requireMutationApproval(approval_status);
        if (approvalError) {
            return {
                content: [{ type: 'text', text: approvalError }],
            };
        }

        let unscheduledBlocks: { title: string; durationMinutes: number; chapter_index: number; lesson_index: number }[] = [];
        const planned: Array<{
            key: string;
            title: string;
            description: string;
            time_start: string;
            time_end: string;
            timezone: string;
        }> = [];

        if (sessions && sessions.length > 0) {
            sessions.forEach((s, idx) => {
                planned.push({
                    key: `session:${idx + 1}`,
                    title: s.title,
                    description: s.description ?? "",
                    time_start: new Date(s.time_start).toISOString(),
                    time_end: new Date(s.time_end).toISOString(),
                    timezone: s.timezone ?? "Asia/Ho_Chi_Minh",
                });
            });
        } else {
            const safeBlocks = blocks ?? [];
            const safeTimeSlots = timeSlot ?? [];
            let blockIndex = 0;
            for (const slot of safeTimeSlots) {
                let cursor = new Date(slot.from).getTime();
                const slotEnd = new Date(slot.to).getTime();
                if (!Number.isFinite(cursor) || !Number.isFinite(slotEnd) || slotEnd <= cursor) continue;

                while (blockIndex < safeBlocks.length) {
                    const block = safeBlocks[blockIndex];
                    const durationMs = block.durationMinutes * 60 * 1000;
                    if (cursor + durationMs > slotEnd) break;
                    const start = new Date(cursor);
                    const end = new Date(cursor + durationMs);
                    planned.push({
                        key: `${block.chapter_index}:${block.lesson_index}`,
                        title: `${courseTitle} - Study Session`,
                        description: block.title,
                        time_start: start.toISOString(),
                        time_end: end.toISOString(),
                        timezone: "Asia/Ho_Chi_Minh",
                    });
                    cursor = end.getTime();
                    blockIndex += 1;
                }
                if (blockIndex >= safeBlocks.length) break;
            }
            unscheduledBlocks = safeBlocks.slice(blockIndex);
        }

        const courseIdBigInt = course_id ? BigInt(course_id) : null;
        const creates = planned;

        const results = {
            created: [] as any[],
            deleted: [] as any[],
            failed: [] as any[],
            unscheduled_blocks: unscheduledBlocks,
        };

        if (replace_mode) {
            const existingEvents = await this.scheduleService.getMySchedule(userId);
            const courseTitleLower = courseTitle.toLowerCase();
            const deletes = existingEvents
                .filter(e => {
                    if (e?.id == null) return false;
                    if (courseIdBigInt != null) {
                        return (e as any).course_id != null && BigInt((e as any).course_id) === courseIdBigInt;
                    }
                    return String(e.title ?? "").toLowerCase().includes(courseTitleLower);
                })
                .map(e => String(e.id));

            for (const id of deletes) {
                try {
                    const out = await this.scheduleService.deleteEvent(BigInt(id), userId);
                    results.deleted.push({ id, result: out });
                } catch (error: any) {
                    results.failed.push({ action: "delete", id, error: error?.message ?? "unknown error" });
                }
            }
        }

        for (const c of creates) {
            try {
                const out = await this.scheduleService.createEvent(
                    {
                        title: c.title,
                        description: c.description,
                        time_start: c.time_start,
                        time_end: c.time_end,
                        timezone: c.timezone,
                        status: "CONFIRMED",
                        ...(courseIdBigInt != null && { course_id: courseIdBigInt }),
                    } as any,
                    userId
                );
                results.created.push(out);
            } catch (error: any) {
                results.failed.push({ action: "create", title: c.title, time_start: c.time_start, error: error?.message ?? "unknown error" });
            }
        }

        return {
            content: [{
                type: 'text',
                text: stringify({
                    summary: {
                        planned: planned.length,
                        created: results.created.length,
                        deleted: results.deleted.length,
                        failed: results.failed.length,
                        unscheduled: results.unscheduled_blocks.length,
                    },
                    results
                })
            }],
        };
    }
}
