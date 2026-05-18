"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// google/actions/create-event.ts
var create_event_exports = {};
__export(create_event_exports, {
  default: () => create_event_default
});
module.exports = __toCommonJS(create_event_exports);
var import_zod = require("zod");
var AttendeeSchema = import_zod.z.object({
  email: import_zod.z.string().email().describe('Email address of the attendee. Example: "attendee@example.com"'),
  displayName: import_zod.z.string().optional().describe("Display name of the attendee"),
  responseStatus: import_zod.z.enum(["needsAction", "declined", "tentative", "accepted"]).optional().describe("Response status")
});
var ReminderOverrideSchema = import_zod.z.object({
  method: import_zod.z.enum(["email", "popup"]).describe("Method of reminder"),
  minutes: import_zod.z.number().describe("Minutes before the event to trigger the reminder")
});
var InputSchema = import_zod.z.object({
  calendarId: import_zod.z.string().optional().default("primary").describe('Calendar ID to create the event in. Defaults to "primary". Example: "primary" or a calendar ID string'),
  summary: import_zod.z.string().describe('Event title/summary. Example: "Team Meeting"'),
  description: import_zod.z.string().optional().describe("Event description"),
  location: import_zod.z.string().optional().describe("Event location"),
  start: import_zod.z.object({
    dateTime: import_zod.z.string().describe('Start time in ISO 8601 format. Example: "2024-03-15T09:00:00-07:00"'),
    timeZone: import_zod.z.string().optional().describe('Time zone for the start time. Example: "America/Los_Angeles"')
  }),
  end: import_zod.z.object({
    dateTime: import_zod.z.string().describe('End time in ISO 8601 format. Example: "2024-03-15T10:00:00-07:00"'),
    timeZone: import_zod.z.string().optional().describe('Time zone for the end time. Example: "America/Los_Angeles"')
  }),
  attendees: import_zod.z.array(AttendeeSchema).optional().describe("List of attendees"),
  reminders: import_zod.z.object({
    useDefault: import_zod.z.boolean().optional().describe("Whether to use default reminders"),
    overrides: import_zod.z.array(ReminderOverrideSchema).optional().describe("Custom reminder overrides")
  }).optional().describe("Event reminders"),
  recurrence: import_zod.z.array(import_zod.z.string()).optional().describe('Recurrence rules (RRULE, EXRULE, RDATE, EXDATE). Example: ["RRULE:FREQ=WEEKLY;BYDAY=MO"]')
});
var OutputSchema = import_zod.z.object({
  id: import_zod.z.string().describe("Event ID"),
  htmlLink: import_zod.z.string().describe("Link to the event in Google Calendar"),
  summary: import_zod.z.string().describe("Event title/summary"),
  description: import_zod.z.string().optional().describe("Event description"),
  location: import_zod.z.string().optional().describe("Event location"),
  start: import_zod.z.object({
    dateTime: import_zod.z.string(),
    timeZone: import_zod.z.string().optional()
  }),
  end: import_zod.z.object({
    dateTime: import_zod.z.string(),
    timeZone: import_zod.z.string().optional()
  }),
  attendees: import_zod.z.array(import_zod.z.object({
    email: import_zod.z.string(),
    displayName: import_zod.z.string().optional(),
    responseStatus: import_zod.z.string()
  })).optional(),
  created: import_zod.z.string().describe("Creation timestamp"),
  updated: import_zod.z.string().describe("Last update timestamp")
});
var action = {
  type: "action",
  description: "Create a calendar event",
  version: "1.0.0",
  endpoint: {
    method: "POST",
    path: "/actions/create-event",
    group: "Events"
  },
  input: InputSchema,
  output: OutputSchema,
  scopes: ["https://www.googleapis.com/auth/calendar", "https://www.googleapis.com/auth/calendar.events"],
  exec: async (nango, input) => {
    const calendarId = input.calendarId || "primary";
    const response = await nango.post({
      endpoint: `/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
      data: {
        summary: input.summary,
        description: input.description,
        location: input.location,
        start: input.start,
        end: input.end,
        attendees: input.attendees,
        reminders: input.reminders,
        recurrence: input.recurrence
      },
      retries: 3
    });
    if (!response.data) {
      throw new nango.ActionError({
        type: "api_error",
        message: "Failed to create calendar event",
        calendarId: input.calendarId
      });
    }
    const event = response.data;
    return {
      id: event.id,
      htmlLink: event.htmlLink,
      summary: event.summary,
      description: event.description ?? void 0,
      location: event.location ?? void 0,
      start: {
        dateTime: event.start?.dateTime,
        timeZone: event.start?.timeZone ?? void 0
      },
      end: {
        dateTime: event.end?.dateTime,
        timeZone: event.end?.timeZone ?? void 0
      },
      attendees: event.attendees?.map((attendee) => ({
        email: attendee.email,
        displayName: attendee.displayName ?? void 0,
        responseStatus: attendee.responseStatus
      })),
      created: event.created,
      updated: event.updated
    };
  }
};
var create_event_default = action;
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiZ29vZ2xlL2FjdGlvbnMvY3JlYXRlLWV2ZW50LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyJpbXBvcnQgeyB6IH0gZnJvbSAnem9kJztcbmltcG9ydCB7IGNyZWF0ZUFjdGlvbiB9IGZyb20gJ25hbmdvJztcblxuLy8gQXR0ZW5kZWUgc2NoZW1hIGZvciBHb29nbGUgQ2FsZW5kYXJcbmNvbnN0IEF0dGVuZGVlU2NoZW1hID0gei5vYmplY3Qoe1xuICBlbWFpbDogei5zdHJpbmcoKS5lbWFpbCgpLmRlc2NyaWJlKCdFbWFpbCBhZGRyZXNzIG9mIHRoZSBhdHRlbmRlZS4gRXhhbXBsZTogXCJhdHRlbmRlZUBleGFtcGxlLmNvbVwiJyksXG4gIGRpc3BsYXlOYW1lOiB6LnN0cmluZygpLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ0Rpc3BsYXkgbmFtZSBvZiB0aGUgYXR0ZW5kZWUnKSxcbiAgcmVzcG9uc2VTdGF0dXM6IHouZW51bShbJ25lZWRzQWN0aW9uJywgJ2RlY2xpbmVkJywgJ3RlbnRhdGl2ZScsICdhY2NlcHRlZCddKS5vcHRpb25hbCgpLmRlc2NyaWJlKCdSZXNwb25zZSBzdGF0dXMnKVxufSk7XG5cbi8vIFJlbWluZGVyIG92ZXJyaWRlIHNjaGVtYVxuY29uc3QgUmVtaW5kZXJPdmVycmlkZVNjaGVtYSA9IHoub2JqZWN0KHtcbiAgbWV0aG9kOiB6LmVudW0oWydlbWFpbCcsICdwb3B1cCddKS5kZXNjcmliZSgnTWV0aG9kIG9mIHJlbWluZGVyJyksXG4gIG1pbnV0ZXM6IHoubnVtYmVyKCkuZGVzY3JpYmUoJ01pbnV0ZXMgYmVmb3JlIHRoZSBldmVudCB0byB0cmlnZ2VyIHRoZSByZW1pbmRlcicpXG59KTtcblxuLy8gSW5wdXQgc2NoZW1hIGZvciBjcmVhdGluZyBhIGNhbGVuZGFyIGV2ZW50XG5jb25zdCBJbnB1dFNjaGVtYSA9IHoub2JqZWN0KHtcbiAgY2FsZW5kYXJJZDogei5zdHJpbmcoKS5kZXNjcmliZSgnQ2FsZW5kYXIgSUQgdG8gY3JlYXRlIHRoZSBldmVudCBpbi4gRXhhbXBsZTogXCJwcmltYXJ5XCIgb3IgYSBjYWxlbmRhciBJRCBzdHJpbmcnKSxcbiAgc3VtbWFyeTogei5zdHJpbmcoKS5kZXNjcmliZSgnRXZlbnQgdGl0bGUvc3VtbWFyeS4gRXhhbXBsZTogXCJUZWFtIE1lZXRpbmdcIicpLFxuICBkZXNjcmlwdGlvbjogei5zdHJpbmcoKS5vcHRpb25hbCgpLmRlc2NyaWJlKCdFdmVudCBkZXNjcmlwdGlvbicpLFxuICBsb2NhdGlvbjogei5zdHJpbmcoKS5vcHRpb25hbCgpLmRlc2NyaWJlKCdFdmVudCBsb2NhdGlvbicpLFxuICBzdGFydDogei5vYmplY3Qoe1xuICAgIGRhdGVUaW1lOiB6LnN0cmluZygpLmRlc2NyaWJlKCdTdGFydCB0aW1lIGluIElTTyA4NjAxIGZvcm1hdC4gRXhhbXBsZTogXCIyMDI0LTAzLTE1VDA5OjAwOjAwLTA3OjAwXCInKSxcbiAgICB0aW1lWm9uZTogei5zdHJpbmcoKS5vcHRpb25hbCgpLmRlc2NyaWJlKCdUaW1lIHpvbmUgZm9yIHRoZSBzdGFydCB0aW1lLiBFeGFtcGxlOiBcIkFtZXJpY2EvTG9zX0FuZ2VsZXNcIicpXG4gIH0pLFxuICBlbmQ6IHoub2JqZWN0KHtcbiAgICBkYXRlVGltZTogei5zdHJpbmcoKS5kZXNjcmliZSgnRW5kIHRpbWUgaW4gSVNPIDg2MDEgZm9ybWF0LiBFeGFtcGxlOiBcIjIwMjQtMDMtMTVUMTA6MDA6MDAtMDc6MDBcIicpLFxuICAgIHRpbWVab25lOiB6LnN0cmluZygpLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ1RpbWUgem9uZSBmb3IgdGhlIGVuZCB0aW1lLiBFeGFtcGxlOiBcIkFtZXJpY2EvTG9zX0FuZ2VsZXNcIicpXG4gIH0pLFxuICBhdHRlbmRlZXM6IHouYXJyYXkoQXR0ZW5kZWVTY2hlbWEpLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ0xpc3Qgb2YgYXR0ZW5kZWVzJyksXG4gIHJlbWluZGVyczogei5vYmplY3Qoe1xuICAgIHVzZURlZmF1bHQ6IHouYm9vbGVhbigpLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ1doZXRoZXIgdG8gdXNlIGRlZmF1bHQgcmVtaW5kZXJzJyksXG4gICAgb3ZlcnJpZGVzOiB6LmFycmF5KFJlbWluZGVyT3ZlcnJpZGVTY2hlbWEpLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ0N1c3RvbSByZW1pbmRlciBvdmVycmlkZXMnKVxuICB9KS5vcHRpb25hbCgpLmRlc2NyaWJlKCdFdmVudCByZW1pbmRlcnMnKSxcbiAgcmVjdXJyZW5jZTogei5hcnJheSh6LnN0cmluZygpKS5vcHRpb25hbCgpLmRlc2NyaWJlKCdSZWN1cnJlbmNlIHJ1bGVzIChSUlVMRSwgRVhSVUxFLCBSREFURSwgRVhEQVRFKS4gRXhhbXBsZTogW1wiUlJVTEU6RlJFUT1XRUVLTFk7QllEQVk9TU9cIl0nKVxufSk7XG5cbi8vIE91dHB1dCBzY2hlbWEgZm9yIGNyZWF0ZWQgZXZlbnRcbmNvbnN0IE91dHB1dFNjaGVtYSA9IHoub2JqZWN0KHtcbiAgaWQ6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ0V2ZW50IElEJyksXG4gIGh0bWxMaW5rOiB6LnN0cmluZygpLmRlc2NyaWJlKCdMaW5rIHRvIHRoZSBldmVudCBpbiBHb29nbGUgQ2FsZW5kYXInKSxcbiAgc3VtbWFyeTogei5zdHJpbmcoKS5kZXNjcmliZSgnRXZlbnQgdGl0bGUvc3VtbWFyeScpLFxuICBkZXNjcmlwdGlvbjogei5zdHJpbmcoKS5vcHRpb25hbCgpLmRlc2NyaWJlKCdFdmVudCBkZXNjcmlwdGlvbicpLFxuICBsb2NhdGlvbjogei5zdHJpbmcoKS5vcHRpb25hbCgpLmRlc2NyaWJlKCdFdmVudCBsb2NhdGlvbicpLFxuICBzdGFydDogei5vYmplY3Qoe1xuICAgIGRhdGVUaW1lOiB6LnN0cmluZygpLFxuICAgIHRpbWVab25lOiB6LnN0cmluZygpLm9wdGlvbmFsKClcbiAgfSksXG4gIGVuZDogei5vYmplY3Qoe1xuICAgIGRhdGVUaW1lOiB6LnN0cmluZygpLFxuICAgIHRpbWVab25lOiB6LnN0cmluZygpLm9wdGlvbmFsKClcbiAgfSksXG4gIGF0dGVuZGVlczogei5hcnJheSh6Lm9iamVjdCh7XG4gICAgZW1haWw6IHouc3RyaW5nKCksXG4gICAgZGlzcGxheU5hbWU6IHouc3RyaW5nKCkub3B0aW9uYWwoKSxcbiAgICByZXNwb25zZVN0YXR1czogei5zdHJpbmcoKVxuICB9KSkub3B0aW9uYWwoKSxcbiAgY3JlYXRlZDogei5zdHJpbmcoKS5kZXNjcmliZSgnQ3JlYXRpb24gdGltZXN0YW1wJyksXG4gIHVwZGF0ZWQ6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ0xhc3QgdXBkYXRlIHRpbWVzdGFtcCcpXG59KTtcbmNvbnN0IGFjdGlvbiA9IHtcbiAgdHlwZTogXCJhY3Rpb25cIixcbiAgZGVzY3JpcHRpb246ICdDcmVhdGUgYSBjYWxlbmRhciBldmVudCcsXG4gIHZlcnNpb246ICcxLjAuMCcsXG4gIGVuZHBvaW50OiB7XG4gICAgbWV0aG9kOiAnUE9TVCcsXG4gICAgcGF0aDogJy9hY3Rpb25zL2NyZWF0ZS1ldmVudCcsXG4gICAgZ3JvdXA6ICdFdmVudHMnXG4gIH0sXG4gIGlucHV0OiBJbnB1dFNjaGVtYSxcbiAgb3V0cHV0OiBPdXRwdXRTY2hlbWEsXG4gIHNjb3BlczogWydodHRwczovL3d3dy5nb29nbGVhcGlzLmNvbS9hdXRoL2NhbGVuZGFyJywgJ2h0dHBzOi8vd3d3Lmdvb2dsZWFwaXMuY29tL2F1dGgvY2FsZW5kYXIuZXZlbnRzJ10sXG4gIGV4ZWM6IGFzeW5jIChuYW5nbywgaW5wdXQpOiBQcm9taXNlPHouaW5mZXI8dHlwZW9mIE91dHB1dFNjaGVtYT4+ID0+IHtcbiAgICAvLyBodHRwczovL2RldmVsb3BlcnMuZ29vZ2xlLmNvbS9jYWxlbmRhci9hcGkvdjMvcmVmZXJlbmNlL2V2ZW50cy9pbnNlcnRcbiAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IG5hbmdvLnBvc3Qoe1xuICAgICAgZW5kcG9pbnQ6IGAvY2FsZW5kYXIvdjMvY2FsZW5kYXJzLyR7ZW5jb2RlVVJJQ29tcG9uZW50KGlucHV0LmNhbGVuZGFySWQpfS9ldmVudHNgLFxuICAgICAgZGF0YToge1xuICAgICAgICBzdW1tYXJ5OiBpbnB1dC5zdW1tYXJ5LFxuICAgICAgICBkZXNjcmlwdGlvbjogaW5wdXQuZGVzY3JpcHRpb24sXG4gICAgICAgIGxvY2F0aW9uOiBpbnB1dC5sb2NhdGlvbixcbiAgICAgICAgc3RhcnQ6IGlucHV0LnN0YXJ0LFxuICAgICAgICBlbmQ6IGlucHV0LmVuZCxcbiAgICAgICAgYXR0ZW5kZWVzOiBpbnB1dC5hdHRlbmRlZXMsXG4gICAgICAgIHJlbWluZGVyczogaW5wdXQucmVtaW5kZXJzLFxuICAgICAgICByZWN1cnJlbmNlOiBpbnB1dC5yZWN1cnJlbmNlXG4gICAgICB9LFxuICAgICAgcmV0cmllczogM1xuICAgIH0pO1xuICAgIGlmICghcmVzcG9uc2UuZGF0YSkge1xuICAgICAgdGhyb3cgbmV3IG5hbmdvLkFjdGlvbkVycm9yKHtcbiAgICAgICAgdHlwZTogJ2FwaV9lcnJvcicsXG4gICAgICAgIG1lc3NhZ2U6ICdGYWlsZWQgdG8gY3JlYXRlIGNhbGVuZGFyIGV2ZW50JyxcbiAgICAgICAgY2FsZW5kYXJJZDogaW5wdXQuY2FsZW5kYXJJZFxuICAgICAgfSk7XG4gICAgfVxuICAgIGNvbnN0IGV2ZW50ID0gcmVzcG9uc2UuZGF0YTtcbiAgICByZXR1cm4ge1xuICAgICAgaWQ6IGV2ZW50LmlkLFxuICAgICAgaHRtbExpbms6IGV2ZW50Lmh0bWxMaW5rLFxuICAgICAgc3VtbWFyeTogZXZlbnQuc3VtbWFyeSxcbiAgICAgIGRlc2NyaXB0aW9uOiBldmVudC5kZXNjcmlwdGlvbiA/PyB1bmRlZmluZWQsXG4gICAgICBsb2NhdGlvbjogZXZlbnQubG9jYXRpb24gPz8gdW5kZWZpbmVkLFxuICAgICAgc3RhcnQ6IHtcbiAgICAgICAgZGF0ZVRpbWU6IGV2ZW50LnN0YXJ0Py5kYXRlVGltZSxcbiAgICAgICAgdGltZVpvbmU6IGV2ZW50LnN0YXJ0Py50aW1lWm9uZSA/PyB1bmRlZmluZWRcbiAgICAgIH0sXG4gICAgICBlbmQ6IHtcbiAgICAgICAgZGF0ZVRpbWU6IGV2ZW50LmVuZD8uZGF0ZVRpbWUsXG4gICAgICAgIHRpbWVab25lOiBldmVudC5lbmQ/LnRpbWVab25lID8/IHVuZGVmaW5lZFxuICAgICAgfSxcbiAgICAgIGF0dGVuZGVlczogZXZlbnQuYXR0ZW5kZWVzPy5tYXAoKGF0dGVuZGVlOiBhbnkpID0+ICh7XG4gICAgICAgIGVtYWlsOiBhdHRlbmRlZS5lbWFpbCxcbiAgICAgICAgZGlzcGxheU5hbWU6IGF0dGVuZGVlLmRpc3BsYXlOYW1lID8/IHVuZGVmaW5lZCxcbiAgICAgICAgcmVzcG9uc2VTdGF0dXM6IGF0dGVuZGVlLnJlc3BvbnNlU3RhdHVzXG4gICAgICB9KSksXG4gICAgICBjcmVhdGVkOiBldmVudC5jcmVhdGVkLFxuICAgICAgdXBkYXRlZDogZXZlbnQudXBkYXRlZFxuICAgIH07XG4gIH1cbn07XG5leHBvcnQgdHlwZSBOYW5nb0FjdGlvbkxvY2FsID0gUGFyYW1ldGVyczwodHlwZW9mIGFjdGlvbilbJ2V4ZWMnXT5bMF07XG5leHBvcnQgZGVmYXVsdCBhY3Rpb247Il0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsaUJBQWtCO0FBSWxCLElBQU0saUJBQWlCLGFBQUUsT0FBTztBQUFBLEVBQzlCLE9BQU8sYUFBRSxPQUFPLEVBQUUsTUFBTSxFQUFFLFNBQVMsZ0VBQWdFO0FBQUEsRUFDbkcsYUFBYSxhQUFFLE9BQU8sRUFBRSxTQUFTLEVBQUUsU0FBUyw4QkFBOEI7QUFBQSxFQUMxRSxnQkFBZ0IsYUFBRSxLQUFLLENBQUMsZUFBZSxZQUFZLGFBQWEsVUFBVSxDQUFDLEVBQUUsU0FBUyxFQUFFLFNBQVMsaUJBQWlCO0FBQ3BILENBQUM7QUFHRCxJQUFNLHlCQUF5QixhQUFFLE9BQU87QUFBQSxFQUN0QyxRQUFRLGFBQUUsS0FBSyxDQUFDLFNBQVMsT0FBTyxDQUFDLEVBQUUsU0FB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
