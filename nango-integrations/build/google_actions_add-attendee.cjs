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

// google/actions/add-attendee.ts
var add_attendee_exports = {};
__export(add_attendee_exports, {
  default: () => add_attendee_default
});
module.exports = __toCommonJS(add_attendee_exports);
var import_zod = require("zod");
var InputSchema = import_zod.z.object({
  calendarId: import_zod.z.string().optional().default("primary").describe('Calendar ID. Defaults to "primary". Example: "primary"'),
  eventId: import_zod.z.string().describe('Event ID to add attendee to. Example: "abc123xyz"'),
  attendeeEmail: import_zod.z.string().email().describe('Email address of the attendee to add. Example: "attendee@example.com"'),
  attendeeName: import_zod.z.string().optional().describe('Display name of the attendee (optional). Example: "John Doe"'),
  optional: import_zod.z.boolean().optional().describe("Whether the attendee is optional (optional). Default: false"),
  responseStatus: import_zod.z.enum(["needsAction", "declined", "tentative", "accepted"]).optional().describe('Response status of the attendee (optional). Default: "needsAction"')
});
var AttendeeSchema = import_zod.z.object({
  email: import_zod.z.string(),
  displayName: import_zod.z.string().optional(),
  optional: import_zod.z.boolean().optional(),
  responseStatus: import_zod.z.string().optional()
});
var OutputSchema = import_zod.z.object({
  id: import_zod.z.string(),
  summary: import_zod.z.string().optional(),
  attendees: import_zod.z.array(AttendeeSchema)
});
var action = {
  type: "action",
  description: "Add an attendee to an existing calendar event",
  version: "1.0.0",
  endpoint: {
    method: "POST",
    path: "/actions/add-attendee",
    group: "Events"
  },
  input: InputSchema,
  output: OutputSchema,
  scopes: ["https://www.googleapis.com/auth/calendar"],
  exec: async (nango, input) => {
    const getResponse = await nango.get({
      endpoint: `/calendar/v3/calendars/${encodeURIComponent(input.calendarId)}/events/${encodeURIComponent(input.eventId)}`,
      retries: 3
    });
    if (!getResponse.data) {
      throw new nango.ActionError({
        type: "not_found",
        message: "Event not found",
        eventId: input.eventId,
        calendarId: input.calendarId
      });
    }
    const existingEvent = getResponse.data;
    const existingAttendees = existingEvent.attendees || [];
    const attendeeExists = existingAttendees.some((attendee) => attendee.email.toLowerCase() === input.attendeeEmail.toLowerCase());
    if (attendeeExists) {
      throw new nango.ActionError({
        type: "duplicate_attendee",
        message: "Attendee already exists in this event",
        attendeeEmail: input.attendeeEmail
      });
    }
    const newAttendee = {
      email: input.attendeeEmail,
      ...input.attendeeName && {
        displayName: input.attendeeName
      },
      ...input.optional !== void 0 && {
        optional: input.optional
      },
      ...input.responseStatus && {
        responseStatus: input.responseStatus
      }
    };
    const updatedAttendees = [...existingAttendees, newAttendee];
    const patchResponse = await nango.patch({
      endpoint: `/calendar/v3/calendars/${encodeURIComponent(input.calendarId)}/events/${encodeURIComponent(input.eventId)}`,
      data: {
        attendees: updatedAttendees
      },
      retries: 3
    });
    const updatedEvent = patchResponse.data;
    return {
      id: updatedEvent.id,
      summary: updatedEvent.summary ?? void 0,
      attendees: (updatedEvent.attendees || []).map((attendee) => ({
        email: attendee.email,
        displayName: attendee.displayName ?? void 0,
        optional: attendee.optional,
        responseStatus: attendee.responseStatus
      }))
    };
  }
};
var add_attendee_default = action;
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiZ29vZ2xlL2FjdGlvbnMvYWRkLWF0dGVuZGVlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyJpbXBvcnQgeyB6IH0gZnJvbSAnem9kJztcbmltcG9ydCB7IGNyZWF0ZUFjdGlvbiB9IGZyb20gJ25hbmdvJztcbmNvbnN0IElucHV0U2NoZW1hID0gei5vYmplY3Qoe1xuICBjYWxlbmRhcklkOiB6LnN0cmluZygpLmRlc2NyaWJlKCdDYWxlbmRhciBJRC4gVXNlIFwicHJpbWFyeVwiIGZvciB0aGUgZGVmYXVsdCBjYWxlbmRhci4gRXhhbXBsZTogXCJwcmltYXJ5XCInKSxcbiAgZXZlbnRJZDogei5zdHJpbmcoKS5kZXNjcmliZSgnRXZlbnQgSUQgdG8gYWRkIGF0dGVuZGVlIHRvLiBFeGFtcGxlOiBcImFiYzEyM3h5elwiJyksXG4gIGF0dGVuZGVlRW1haWw6IHouc3RyaW5nKCkuZW1haWwoKS5kZXNjcmliZSgnRW1haWwgYWRkcmVzcyBvZiB0aGUgYXR0ZW5kZWUgdG8gYWRkLiBFeGFtcGxlOiBcImF0dGVuZGVlQGV4YW1wbGUuY29tXCInKSxcbiAgYXR0ZW5kZWVOYW1lOiB6LnN0cmluZygpLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ0Rpc3BsYXkgbmFtZSBvZiB0aGUgYXR0ZW5kZWUgKG9wdGlvbmFsKS4gRXhhbXBsZTogXCJKb2huIERvZVwiJyksXG4gIG9wdGlvbmFsOiB6LmJvb2xlYW4oKS5vcHRpb25hbCgpLmRlc2NyaWJlKCdXaGV0aGVyIHRoZSBhdHRlbmRlZSBpcyBvcHRpb25hbCAob3B0aW9uYWwpLiBEZWZhdWx0OiBmYWxzZScpLFxuICByZXNwb25zZVN0YXR1czogei5lbnVtKFsnbmVlZHNBY3Rpb24nLCAnZGVjbGluZWQnLCAndGVudGF0aXZlJywgJ2FjY2VwdGVkJ10pLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ1Jlc3BvbnNlIHN0YXR1cyBvZiB0aGUgYXR0ZW5kZWUgKG9wdGlvbmFsKS4gRGVmYXVsdDogXCJuZWVkc0FjdGlvblwiJylcbn0pO1xuY29uc3QgQXR0ZW5kZWVTY2hlbWEgPSB6Lm9iamVjdCh7XG4gIGVtYWlsOiB6LnN0cmluZygpLFxuICBkaXNwbGF5TmFtZTogei5zdHJpbmcoKS5vcHRpb25hbCgpLFxuICBvcHRpb25hbDogei5ib29sZWFuKCkub3B0aW9uYWwoKSxcbiAgcmVzcG9uc2VTdGF0dXM6IHouc3RyaW5nKCkub3B0aW9uYWwoKVxufSk7XG5jb25zdCBPdXRwdXRTY2hlbWEgPSB6Lm9iamVjdCh7XG4gIGlkOiB6LnN0cmluZygpLFxuICBzdW1tYXJ5OiB6LnN0cmluZygpLm9wdGlvbmFsKCksXG4gIGF0dGVuZGVlczogei5hcnJheShBdHRlbmRlZVNjaGVtYSlcbn0pO1xuY29uc3QgYWN0aW9uID0ge1xuICB0eXBlOiBcImFjdGlvblwiLFxuICBkZXNjcmlwdGlvbjogJ0FkZCBhbiBhdHRlbmRlZSB0byBhbiBleGlzdGluZyBjYWxlbmRhciBldmVudCcsXG4gIHZlcnNpb246ICcxLjAuMCcsXG4gIGVuZHBvaW50OiB7XG4gICAgbWV0aG9kOiAnUE9TVCcsXG4gICAgcGF0aDogJy9hY3Rpb25zL2FkZC1hdHRlbmRlZScsXG4gICAgZ3JvdXA6ICdFdmVudHMnXG4gIH0sXG4gIGlucHV0OiBJbnB1dFNjaGVtYSxcbiAgb3V0cHV0OiBPdXRwdXRTY2hlbWEsXG4gIHNjb3BlczogWydodHRwczovL3d3dy5nb29nbGVhcGlzLmNvbS9hdXRoL2NhbGVuZGFyJ10sXG4gIGV4ZWM6IGFzeW5jIChuYW5nbywgaW5wdXQpOiBQcm9taXNlPHouaW5mZXI8dHlwZW9mIE91dHB1dFNjaGVtYT4+ID0+IHtcbiAgICAvLyBTdGVwIDE6IEZldGNoIHRoZSBleGlzdGluZyBldmVudFxuICAgIC8vIGh0dHBzOi8vZGV2ZWxvcGVycy5nb29nbGUuY29tL2NhbGVuZGFyL2FwaS92My9yZWZlcmVuY2UvZXZlbnRzL2dldFxuICAgIGNvbnN0IGdldFJlc3BvbnNlID0gYXdhaXQgbmFuZ28uZ2V0KHtcbiAgICAgIGVuZHBvaW50OiBgL2NhbGVuZGFyL3YzL2NhbGVuZGFycy8ke2VuY29kZVVSSUNvbXBvbmVudChpbnB1dC5jYWxlbmRhcklkKX0vZXZlbnRzLyR7ZW5jb2RlVVJJQ29tcG9uZW50KGlucHV0LmV2ZW50SWQpfWAsXG4gICAgICByZXRyaWVzOiAzXG4gICAgfSk7XG4gICAgaWYgKCFnZXRSZXNwb25zZS5kYXRhKSB7XG4gICAgICB0aHJvdyBuZXcgbmFuZ28uQWN0aW9uRXJyb3Ioe1xuICAgICAgICB0eXBlOiAnbm90X2ZvdW5kJyxcbiAgICAgICAgbWVzc2FnZTogJ0V2ZW50IG5vdCBmb3VuZCcsXG4gICAgICAgIGV2ZW50SWQ6IGlucHV0LmV2ZW50SWQsXG4gICAgICAgIGNhbGVuZGFySWQ6IGlucHV0LmNhbGVuZGFySWRcbiAgICAgIH0pO1xuICAgIH1cbiAgICBjb25zdCBleGlzdGluZ0V2ZW50ID0gZ2V0UmVzcG9uc2UuZGF0YTtcbiAgICBjb25zdCBleGlzdGluZ0F0dGVuZGVlcyA9IGV4aXN0aW5nRXZlbnQuYXR0ZW5kZWVzIHx8IFtdO1xuXG4gICAgLy8gU3RlcCAyOiBDaGVjayBpZiBhdHRlbmRlZSBhbHJlYWR5IGV4aXN0c1xuICAgIGNvbnN0IGF0dGVuZGVlRXhpc3RzID0gZXhpc3RpbmdBdHRlbmRlZXMuc29tZSgoYXR0ZW5kZWU6IHtcbiAgICAgIGVtYWlsOiBzdHJpbmc7XG4gICAgfSkgPT4gYXR0ZW5kZWUuZW1haWwudG9Mb3dlckNhc2UoKSA9PT0gaW5wdXQuYXR0ZW5kZWVFbWFpbC50b0xvd2VyQ2FzZSgpKTtcbiAgICBpZiAoYXR0ZW5kZWVFeGlzdHMpIHtcbiAgICAgIHRocm93IG5ldyBuYW5nby5BY3Rpb25FcnJvcih7XG4gICAgICAgIHR5cGU6ICdkdXBsaWNhdGVfYXR0ZW5kZWUnLFxuICAgICAgICBtZXNzYWdlOiAnQXR0ZW5kZWUgYWxyZWFkeSBleGlzdHMgaW4gdGhpcyBldmVudCcsXG4gICAgICAgIGF0dGVuZGVlRW1haWw6IGlucHV0LmF0dGVuZGVlRW1haWxcbiAgICAgIH0pO1xuICAgIH1cblxuICAgIC8vIFN0ZXAgMzogQ3JlYXRlIG5ldyBhdHRlbmRlZSBvYmplY3RcbiAgICBjb25zdCBuZXdBdHRlbmRlZToge1xuICAgICAgZW1haWw6IHN0cmluZztcbiAgICAgIGRpc3BsYXlOYW1lPzogc3RyaW5nO1xuICAgICAgb3B0aW9uYWw/OiBib29sZWFuO1xuICAgICAgcmVzcG9uc2VTdGF0dXM/OiBzdHJpbmc7XG4gICAgfSA9IHtcbiAgICAgIGVtYWlsOiBpbnB1dC5hdHRlbmRlZUVtYWlsLFxuICAgICAgLi4uKGlucHV0LmF0dGVuZGVlTmFtZSAmJiB7XG4gICAgICAgIGRpc3BsYXlOYW1lOiBpbnB1dC5hdHRlbmRlZU5hbWVcbiAgICAgIH0pLFxuICAgICAgLi4uKGlucHV0Lm9wdGlvbmFsICE9PSB1bmRlZmluZWQgJiYge1xuICAgICAgICBvcHRpb25hbDogaW5wdXQub3B0aW9uYWxcbiAgICAgIH0pLFxuICAgICAgLi4uKGlucHV0LnJlc3BvbnNlU3RhdHVzICYmIHtcbiAgICAgICAgcmVzcG9uc2VTdGF0dXM6IGlucHV0LnJlc3BvbnNlU3RhdHVzXG4gICAgICB9KVxuICAgIH07XG5cbiAgICAvLyBTdGVwIDQ6IEFwcGVuZCB0aGUgbmV3IGF0dGVuZGVlIHRvIHRoZSBsaXN0XG4gICAgY29uc3QgdXBkYXRlZEF0dGVuZGVlcyA9IFsuLi5leGlzdGluZ0F0dGVuZGVlcywgbmV3QXR0ZW5kZWVdO1xuXG4gICAgLy8gU3RlcCA1OiBQYXRjaCB0aGUgZXZlbnQgd2l0aCB0aGUgdXBkYXRlZCBhdHRlbmRlZSBsaXN0XG4gICAgLy8gaHR0cHM6Ly9kZXZlbG9wZXJzLmdvb2dsZS5jb20vY2FsZW5kYXIvYXBpL3YzL3JlZmVyZW5jZS9ldmVudHMvcGF0Y2hcbiAgICBjb25zdCBwYXRjaFJlc3BvbnNlID0gYXdhaXQgbmFuZ28ucGF0Y2goe1xuICAgICAgZW5kcG9pbnQ6IGAvY2FsZW5kYXIvdjMvY2FsZW5kYXJzLyR7ZW5jb2RlVVJJQ29tcG9uZW50KGlucHV0LmNhbGVuZGFySWQpfS9ldmVudHMvJHtlbmNvZGVVUklDb21wb25lbnQoaW5wdXQuZXZlbnRJZCl9YCxcbiAgICAgIGRhdGE6IHtcbiAgICAgICAgYXR0ZW5kZWVzOiB1cGRhdGVkQXR0ZW5kZWVzXG4gICAgICB9LFxuICAgICAgcmV0cmllczogM1xuICAgIH0pO1xuICAgIGNvbnN0IHVwZGF0ZWRFdmVudCA9IHBhdGNoUmVzcG9uc2UuZGF0YTtcbiAgICByZXR1cm4ge1xuICAgICAgaWQ6IHVwZGF0ZWRFdmVudC5pZCxcbiAgICAgIHN1bW1hcnk6IHVwZGF0ZWRFdmVudC5zdW1tYXJ5ID8/IHVuZGVmaW5lZCxcbiAgICAgIGF0dGVuZGVlczogKHVwZGF0ZWRFdmVudC5hdHRlbmRlZXMgfHwgW10pLm1hcCgoYXR0ZW5kZWU6IHtcbiAgICAgICAgZW1haWw6IHN0cmluZztcbiAgICAgICAgZGlzcGxheU5hbWU/OiBzdHJpbmc7XG4gICAgICAgIG9wdGlvbmFsPzogYm9vbGVhbjtcbiAgICAgICAgcmVzcG9uc2VTdGF0dXM/OiBzdHJpbmc7XG4gICAgICB9KSA9PiAoe1xuICAgICAgICBlbWFpbDogYXR0ZW5kZWUuZW1haWwsXG4gICAgICAgIGRpc3BsYXlOYW1lOiBhdHRlbmRlZS5kaXNwbGF5TmFtZSA/PyB1bmRlZmluZWQsXG4gICAgICAgIG9wdGlvbmFsOiBhdHRlbmRlZS5vcHRpb25hbCxcbiAgICAgICAgcmVzcG9uc2VTdGF0dXM6IGF0dGVuZGVlLnJlc3BvbnNlU3RhdHVzXG4gICAgICB9KSlcbiAgICB9O1xuICB9XG59O1xuZXhwb3J0IHR5cGUgTmFuZ29BY3Rpb25Mb2NhbCA9IFBhcmFtZXRlcnM8KHR5cGVvZiBhY3Rpb24pWydleGVjJ10+WzBdO1xuZXhwb3J0IGRlZmF1bHQgYWN0aW9uOyJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLGlCQUFrQjtBQUVsQixJQUFNLGNBQWMsYUFBRSxPQUFPO0FBQUEsRUFDM0IsWUFBWSxhQUFFLE9BQU8s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
