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

// google/actions/remove-attendee.ts
var remove_attendee_exports = {};
__export(remove_attendee_exports, {
  default: () => remove_attendee_default
});
module.exports = __toCommonJS(remove_attendee_exports);
var import_zod = require("zod");
var InputSchema = import_zod.z.object({
  calendarId: import_zod.z.string().optional().default("primary").describe('Calendar identifier. Defaults to "primary". Use "primary" for the primary calendar of the currently logged in user.'),
  eventId: import_zod.z.string().describe("Event identifier."),
  attendeeEmail: import_zod.z.string().email().describe("Email address of the attendee to remove from the event.")
});
var AttendeeSchema = import_zod.z.object({
  email: import_zod.z.string(),
  displayName: import_zod.z.string().optional(),
  organizer: import_zod.z.boolean().optional(),
  self: import_zod.z.boolean().optional(),
  resource: import_zod.z.boolean().optional(),
  optional: import_zod.z.boolean().optional(),
  responseStatus: import_zod.z.string().optional(),
  comment: import_zod.z.string().optional(),
  additionalGuests: import_zod.z.number().optional()
});
var OutputSchema = import_zod.z.object({
  id: import_zod.z.string(),
  summary: import_zod.z.string().optional(),
  attendees: import_zod.z.array(AttendeeSchema),
  removedAttendee: AttendeeSchema.optional(),
  success: import_zod.z.boolean()
});
var EventResponseSchema = import_zod.z.object({
  id: import_zod.z.string(),
  summary: import_zod.z.string().nullish(),
  attendees: import_zod.z.array(AttendeeSchema).optional()
});
var action = {
  type: "action",
  description: "Fetch an event, remove an attendee by email, and patch attendees",
  version: "1.0.0",
  endpoint: {
    method: "POST",
    path: "/actions/remove-attendee",
    group: "Events"
  },
  input: InputSchema,
  output: OutputSchema,
  scopes: ["https://www.googleapis.com/auth/calendar.events"],
  exec: async (nango, input) => {
    const getResponse = await nango.get({
      endpoint: `/calendar/v3/calendars/${encodeURIComponent(input.calendarId)}/events/${encodeURIComponent(input.eventId)}`,
      retries: 3
    });
    if (!getResponse.data) {
      throw new nango.ActionError({
        type: "not_found",
        message: "Event not found",
        calendarId: input.calendarId,
        eventId: input.eventId
      });
    }
    const event = EventResponseSchema.parse(getResponse.data);
    const currentAttendees = event.attendees || [];
    const attendeeIndex = currentAttendees.findIndex((attendee) => attendee.email === input.attendeeEmail);
    if (attendeeIndex === -1) {
      return {
        id: event.id,
        summary: event.summary ?? void 0,
        attendees: currentAttendees,
        removedAttendee: void 0,
        success: false
      };
    }
    const removedAttendee = currentAttendees[attendeeIndex] || void 0;
    const updatedAttendees = currentAttendees.filter((_, index) => index !== attendeeIndex);
    const patchResponse = await nango.patch({
      endpoint: `/calendar/v3/calendars/${encodeURIComponent(input.calendarId)}/events/${encodeURIComponent(input.eventId)}`,
      data: {
        attendees: updatedAttendees
      },
      retries: 3
    });
    if (!patchResponse.data) {
      throw new nango.ActionError({
        type: "patch_failed",
        message: "Failed to patch event with updated attendees",
        calendarId: input.calendarId,
        eventId: input.eventId
      });
    }
    const patchedEvent = EventResponseSchema.parse(patchResponse.data);
    return {
      id: patchedEvent.id,
      summary: patchedEvent.summary ?? void 0,
      attendees: patchedEvent.attendees || [],
      removedAttendee,
      success: true
    };
  }
};
var remove_attendee_default = action;
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiZ29vZ2xlL2FjdGlvbnMvcmVtb3ZlLWF0dGVuZGVlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyJpbXBvcnQgeyB6IH0gZnJvbSAnem9kJztcbmltcG9ydCB7IGNyZWF0ZUFjdGlvbiB9IGZyb20gJ25hbmdvJztcbmNvbnN0IElucHV0U2NoZW1hID0gei5vYmplY3Qoe1xuICBjYWxlbmRhcklkOiB6LnN0cmluZygpLmRlc2NyaWJlKCdDYWxlbmRhciBpZGVudGlmaWVyLiBVc2UgXCJwcmltYXJ5XCIgZm9yIHRoZSBwcmltYXJ5IGNhbGVuZGFyIG9mIHRoZSBjdXJyZW50bHkgbG9nZ2VkIGluIHVzZXIuJyksXG4gIGV2ZW50SWQ6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ0V2ZW50IGlkZW50aWZpZXIuJyksXG4gIGF0dGVuZGVlRW1haWw6IHouc3RyaW5nKCkuZW1haWwoKS5kZXNjcmliZSgnRW1haWwgYWRkcmVzcyBvZiB0aGUgYXR0ZW5kZWUgdG8gcmVtb3ZlIGZyb20gdGhlIGV2ZW50LicpXG59KTtcbmNvbnN0IEF0dGVuZGVlU2NoZW1hID0gei5vYmplY3Qoe1xuICBlbWFpbDogei5zdHJpbmcoKSxcbiAgZGlzcGxheU5hbWU6IHouc3RyaW5nKCkub3B0aW9uYWwoKSxcbiAgb3JnYW5pemVyOiB6LmJvb2xlYW4oKS5vcHRpb25hbCgpLFxuICBzZWxmOiB6LmJvb2xlYW4oKS5vcHRpb25hbCgpLFxuICByZXNvdXJjZTogei5ib29sZWFuKCkub3B0aW9uYWwoKSxcbiAgb3B0aW9uYWw6IHouYm9vbGVhbigpLm9wdGlvbmFsKCksXG4gIHJlc3BvbnNlU3RhdHVzOiB6LnN0cmluZygpLm9wdGlvbmFsKCksXG4gIGNvbW1lbnQ6IHouc3RyaW5nKCkub3B0aW9uYWwoKSxcbiAgYWRkaXRpb25hbEd1ZXN0czogei5udW1iZXIoKS5vcHRpb25hbCgpXG59KTtcbmNvbnN0IE91dHB1dFNjaGVtYSA9IHoub2JqZWN0KHtcbiAgaWQ6IHouc3RyaW5nKCksXG4gIHN1bW1hcnk6IHouc3RyaW5nKCkub3B0aW9uYWwoKSxcbiAgYXR0ZW5kZWVzOiB6LmFycmF5KEF0dGVuZGVlU2NoZW1hKSxcbiAgcmVtb3ZlZEF0dGVuZGVlOiBBdHRlbmRlZVNjaGVtYS5vcHRpb25hbCgpLFxuICBzdWNjZXNzOiB6LmJvb2xlYW4oKVxufSk7XG5jb25zdCBFdmVudFJlc3BvbnNlU2NoZW1hID0gei5vYmplY3Qoe1xuICBpZDogei5zdHJpbmcoKSxcbiAgc3VtbWFyeTogei5zdHJpbmcoKS5udWxsaXNoKCksXG4gIGF0dGVuZGVlczogei5hcnJheShBdHRlbmRlZVNjaGVtYSkub3B0aW9uYWwoKVxufSk7XG5jb25zdCBhY3Rpb24gPSB7XG4gIHR5cGU6IFwiYWN0aW9uXCIsXG4gIGRlc2NyaXB0aW9uOiAnRmV0Y2ggYW4gZXZlbnQsIHJlbW92ZSBhbiBhdHRlbmRlZSBieSBlbWFpbCwgYW5kIHBhdGNoIGF0dGVuZGVlcycsXG4gIHZlcnNpb246ICcxLjAuMCcsXG4gIGVuZHBvaW50OiB7XG4gICAgbWV0aG9kOiAnUE9TVCcsXG4gICAgcGF0aDogJy9hY3Rpb25zL3JlbW92ZS1hdHRlbmRlZScsXG4gICAgZ3JvdXA6ICdFdmVudHMnXG4gIH0sXG4gIGlucHV0OiBJbnB1dFNjaGVtYSxcbiAgb3V0cHV0OiBPdXRwdXRTY2hlbWEsXG4gIHNjb3BlczogWydodHRwczovL3d3dy5nb29nbGVhcGlzLmNvbS9hdXRoL2NhbGVuZGFyLmV2ZW50cyddLFxuICBleGVjOiBhc3luYyAobmFuZ28sIGlucHV0KTogUHJvbWlzZTx6LmluZmVyPHR5cGVvZiBPdXRwdXRTY2hlbWE+PiA9PiB7XG4gICAgLy8gaHR0cHM6Ly9kZXZlbG9wZXJzLmdvb2dsZS5jb20vd29ya3NwYWNlL2NhbGVuZGFyL2FwaS92My9yZWZlcmVuY2UvZXZlbnRzL2dldFxuICAgIGNvbnN0IGdldFJlc3BvbnNlID0gYXdhaXQgbmFuZ28uZ2V0KHtcbiAgICAgIGVuZHBvaW50OiBgL2NhbGVuZGFyL3YzL2NhbGVuZGFycy8ke2VuY29kZVVSSUNvbXBvbmVudChpbnB1dC5jYWxlbmRhcklkKX0vZXZlbnRzLyR7ZW5jb2RlVVJJQ29tcG9uZW50KGlucHV0LmV2ZW50SWQpfWAsXG4gICAgICByZXRyaWVzOiAzXG4gICAgfSk7XG4gICAgaWYgKCFnZXRSZXNwb25zZS5kYXRhKSB7XG4gICAgICB0aHJvdyBuZXcgbmFuZ28uQWN0aW9uRXJyb3Ioe1xuICAgICAgICB0eXBlOiAnbm90X2ZvdW5kJyxcbiAgICAgICAgbWVzc2FnZTogJ0V2ZW50IG5vdCBmb3VuZCcsXG4gICAgICAgIGNhbGVuZGFySWQ6IGlucHV0LmNhbGVuZGFySWQsXG4gICAgICAgIGV2ZW50SWQ6IGlucHV0LmV2ZW50SWRcbiAgICAgIH0pO1xuICAgIH1cbiAgICBjb25zdCBldmVudCA9IEV2ZW50UmVzcG9uc2VTY2hlbWEucGFyc2UoZ2V0UmVzcG9uc2UuZGF0YSk7XG4gICAgY29uc3QgY3VycmVudEF0dGVuZGVlcyA9IGV2ZW50LmF0dGVuZGVlcyB8fCBbXTtcblxuICAgIC8vIEZpbmQgdGhlIGF0dGVuZGVlIHRvIHJlbW92ZVxuICAgIGNvbnN0IGF0dGVuZGVlSW5kZXggPSBjdXJyZW50QXR0ZW5kZWVzLmZpbmRJbmRleChhdHRlbmRlZSA9PiBhdHRlbmRlZS5lbWFpbCA9PT0gaW5wdXQuYXR0ZW5kZWVFbWFpbCk7XG4gICAgaWYgKGF0dGVuZGVlSW5kZXggPT09IC0xKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBpZDogZXZlbnQuaWQsXG4gICAgICAgIHN1bW1hcnk6IGV2ZW50LnN1bW1hcnkgPz8gdW5kZWZpbmVkLFxuICAgICAgICBhdHRlbmRlZXM6IGN1cnJlbnRBdHRlbmRlZXMsXG4gICAgICAgIHJlbW92ZWRBdHRlbmRlZTogdW5kZWZpbmVkLFxuICAgICAgICBzdWNjZXNzOiBmYWxzZVxuICAgICAgfTtcbiAgICB9XG4gICAgY29uc3QgcmVtb3ZlZEF0dGVuZGVlID0gY3VycmVudEF0dGVuZGVlc1thdHRlbmRlZUluZGV4XSB8fCB1bmRlZmluZWQ7XG5cbiAgICAvLyBSZW1vdmUgdGhlIGF0dGVuZGVlIGZyb20gdGhlIGFycmF5XG4gICAgY29uc3QgdXBkYXRlZEF0dGVuZGVlcyA9IGN1cnJlbnRBdHRlbmRlZXMuZmlsdGVyKChfLCBpbmRleCkgPT4gaW5kZXggIT09IGF0dGVuZGVlSW5kZXgpO1xuXG4gICAgLy8gaHR0cHM6Ly9kZXZlbG9wZXJzLmdvb2dsZS5jb20vd29ya3NwYWNlL2NhbGVuZGFyL2FwaS92My9yZWZlcmVuY2UvZXZlbnRzL3BhdGNoXG4gICAgY29uc3QgcGF0Y2hSZXNwb25zZSA9IGF3YWl0IG5hbmdvLnBhdGNoKHtcbiAgICAgIGVuZHBvaW50OiBgL2NhbGVuZGFyL3YzL2NhbGVuZGFycy8ke2VuY29kZVVSSUNvbXBvbmVudChpbnB1dC5jYWxlbmRhcklkKX0vZXZlbnRzLyR7ZW5jb2RlVVJJQ29tcG9uZW50KGlucHV0LmV2ZW50SWQpfWAsXG4gICAgICBkYXRhOiB7XG4gICAgICAgIGF0dGVuZGVlczogdXBkYXRlZEF0dGVuZGVlc1xuICAgICAgfSxcbiAgICAgIHJldHJpZXM6IDNcbiAgICB9KTtcbiAgICBpZiAoIXBhdGNoUmVzcG9uc2UuZGF0YSkge1xuICAgICAgdGhyb3cgbmV3IG5hbmdvLkFjdGlvbkVycm9yKHtcbiAgICAgICAgdHlwZTogJ3BhdGNoX2ZhaWxlZCcsXG4gICAgICAgIG1lc3NhZ2U6ICdGYWlsZWQgdG8gcGF0Y2ggZXZlbnQgd2l0aCB1cGRhdGVkIGF0dGVuZGVlcycsXG4gICAgICAgIGNhbGVuZGFySWQ6IGlucHV0LmNhbGVuZGFySWQsXG4gICAgICAgIGV2ZW50SWQ6IGlucHV0LmV2ZW50SWRcbiAgICAgIH0pO1xuICAgIH1cbiAgICBjb25zdCBwYXRjaGVkRXZlbnQgPSBFdmVudFJlc3BvbnNlU2NoZW1hLnBhcnNlKHBhdGNoUmVzcG9uc2UuZGF0YSk7XG4gICAgcmV0dXJuIHtcbiAgICAgIGlkOiBwYXRjaGVkRXZlbnQuaWQsXG4gICAgICBzdW1tYXJ5OiBwYXRjaGVkRXZlbnQuc3VtbWFyeSA/PyB1bmRlZmluZWQsXG4gICAgICBhdHRlbmRlZXM6IHBhdGNoZWRFdmVudC5hdHRlbmRlZXMgfHwgW10sXG4gICAgICByZW1vdmVkQXR0ZW5kZWU6IHJlbW92ZWRBdHRlbmRlZSxcbiAgICAgIHN1Y2Nlc3M6IHRydWVcbiAgICB9O1xuICB9XG59O1xuZXhwb3J0IHR5cGUgTmFuZ29BY3Rpb25Mb2NhbCA9IFBhcmFtZXRlcnM8KHR5cGVvZiBhY3Rpb24pWydleGVjJ10+WzBdO1xuZXhwb3J0IGRlZmF1bHQgYWN0aW9uOyJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLGlCQUFrQjtBQUVsQixJQUFNLGNBQWMsYUFBRSxPQUFPO0FBQUEsRUFDM0IsWUFBWSxhQUFFLE9BQU8sRUFBRSxTQUFTLDhGQUE4RjtBQUFBLEVBQzlILFNBQVMsYUFBRSxPQUFPLEVBQUUsU0FBUyxtQkFBbUI7QUFBQSxFQUNoRCxlQUFlLGFBQUUsT0FBTyxFQUFFLE1BQU0sRUFBRSxTQUFTLHlEQUF5RDtBQUN0RyxDQUFDO0FBQ0QsSUFBTSxpQkFBaUIsYUFBRSxPQUFPO0FBQUEsRUFDOUIsT0FBTyxhQUFFLE9BQU87QUFBQSxFQUNoQixhQUFhLGFBQUUsT0FBTyxFQUFFLFNBQVM7QUFBQSxFQUNqQyxXQUFXLGFBQUUsUUFBUSxFQUFFLFNBQVM7QUFBQSxFQUNoQyxNQUFNLGFBQUUsUUFBUSxFQUFFLFNBQVM7QUFBQSxFQUMzQixVQUFVLGFBQUUsUUFBUSxFQUFFLFNBQVM7QUFBQSxFQUMvQixVQUFVLGFBQUUsUUFBUSxFQUFFLFNBQVM7QUFBQSxFQUMvQixnQkFBZ0IsYUFBRSxPQUFPLEVBQUUsU0FBUztBQUFBLEVBQ3BDLFNBQVMsYUFBRSxPQUFPLEVBQUUsU0FBUztBQUFBLEVBQzdCLGtCQUFrQixhQUFFLE9BQU8sRUFBRSxTQUFTO0FBQ3hDLENBQUM7QUFDRCxJQUFNLGVBQWUsYUFBRSxPQUFPO0FBQUEsRUFDNUIsSUFBSSxhQUFFLE9BQU87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
