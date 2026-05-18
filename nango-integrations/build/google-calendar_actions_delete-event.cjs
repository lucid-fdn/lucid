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

// google-calendar/actions/delete-event.ts
var delete_event_exports = {};
__export(delete_event_exports, {
  default: () => delete_event_default
});
module.exports = __toCommonJS(delete_event_exports);
var import_zod = require("zod");
var InputSchema = import_zod.z.object({
  calendarId: import_zod.z.string().describe('Calendar ID. Example: "primary" or "abc123@group.calendar.google.com"'),
  eventId: import_zod.z.string().describe('Event ID to delete. Example: "tpv6jfth9cbnqhi1f570l45878"')
});
var OutputSchema = import_zod.z.object({
  success: import_zod.z.boolean(),
  message: import_zod.z.string()
});
var action = {
  type: "action",
  description: "Delete a calendar event",
  version: "1.0.0",
  endpoint: {
    method: "POST",
    path: "/actions/delete-event",
    group: "Events"
  },
  input: InputSchema,
  output: OutputSchema,
  scopes: ["https://www.googleapis.com/auth/calendar.events"],
  exec: async (nango, input) => {
    await nango.delete({
      endpoint: `/calendar/v3/calendars/${encodeURIComponent(input.calendarId)}/events/${encodeURIComponent(input.eventId)}`,
      retries: 3
    });
    return {
      success: true,
      message: `Event ${input.eventId} successfully deleted from calendar ${input.calendarId}`
    };
  }
};
var delete_event_default = action;
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiZ29vZ2xlLWNhbGVuZGFyL2FjdGlvbnMvZGVsZXRlLWV2ZW50LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyJpbXBvcnQgeyB6IH0gZnJvbSAnem9kJztcbmltcG9ydCB7IGNyZWF0ZUFjdGlvbiB9IGZyb20gJ25hbmdvJztcbmNvbnN0IElucHV0U2NoZW1hID0gei5vYmplY3Qoe1xuICBjYWxlbmRhcklkOiB6LnN0cmluZygpLmRlc2NyaWJlKCdDYWxlbmRhciBJRC4gRXhhbXBsZTogXCJwcmltYXJ5XCIgb3IgXCJhYmMxMjNAZ3JvdXAuY2FsZW5kYXIuZ29vZ2xlLmNvbVwiJyksXG4gIGV2ZW50SWQ6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ0V2ZW50IElEIHRvIGRlbGV0ZS4gRXhhbXBsZTogXCJ0cHY2amZ0aDljYm5xaGkxZjU3MGw0NTg3OFwiJylcbn0pO1xuY29uc3QgT3V0cHV0U2NoZW1hID0gei5vYmplY3Qoe1xuICBzdWNjZXNzOiB6LmJvb2xlYW4oKSxcbiAgbWVzc2FnZTogei5zdHJpbmcoKVxufSk7XG5jb25zdCBhY3Rpb24gPSB7XG4gIHR5cGU6IFwiYWN0aW9uXCIsXG4gIGRlc2NyaXB0aW9uOiAnRGVsZXRlIGEgY2FsZW5kYXIgZXZlbnQnLFxuICB2ZXJzaW9uOiAnMS4wLjAnLFxuICBlbmRwb2ludDoge1xuICAgIG1ldGhvZDogJ1BPU1QnLFxuICAgIHBhdGg6ICcvYWN0aW9ucy9kZWxldGUtZXZlbnQnLFxuICAgIGdyb3VwOiAnRXZlbnRzJ1xuICB9LFxuICBpbnB1dDogSW5wdXRTY2hlbWEsXG4gIG91dHB1dDogT3V0cHV0U2NoZW1hLFxuICBzY29wZXM6IFsnaHR0cHM6Ly93d3cuZ29vZ2xlYXBpcy5jb20vYXV0aC9jYWxlbmRhci5ldmVudHMnXSxcbiAgZXhlYzogYXN5bmMgKG5hbmdvLCBpbnB1dCk6IFByb21pc2U8ei5pbmZlcjx0eXBlb2YgT3V0cHV0U2NoZW1hPj4gPT4ge1xuICAgIC8vIGh0dHBzOi8vZGV2ZWxvcGVycy5nb29nbGUuY29tL3dvcmtzcGFjZS9jYWxlbmRhci9hcGkvdjMvcmVmZXJlbmNlL2V2ZW50cy9kZWxldGVcbiAgICBhd2FpdCBuYW5nby5kZWxldGUoe1xuICAgICAgZW5kcG9pbnQ6IGAvY2FsZW5kYXIvdjMvY2FsZW5kYXJzLyR7ZW5jb2RlVVJJQ29tcG9uZW50KGlucHV0LmNhbGVuZGFySWQpfS9ldmVudHMvJHtlbmNvZGVVUklDb21wb25lbnQoaW5wdXQuZXZlbnRJZCl9YCxcbiAgICAgIHJldHJpZXM6IDNcbiAgICB9KTtcbiAgICByZXR1cm4ge1xuICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgIG1lc3NhZ2U6IGBFdmVudCAke2lucHV0LmV2ZW50SWR9IHN1Y2Nlc3NmdWxseSBkZWxldGVkIGZyb20gY2FsZW5kYXIgJHtpbnB1dC5jYWxlbmRhcklkfWBcbiAgICB9O1xuICB9XG59O1xuZXhwb3J0IHR5cGUgTmFuZ29BY3Rpb25Mb2NhbCA9IFBhcmFtZXRlcnM8KHR5cGVvZiBhY3Rpb24pWydleGVjJ10+WzBdO1xuZXhwb3J0IGRlZmF1bHQgYWN0aW9uOyJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLGlCQUFrQjtBQUVsQixJQUFNLGNBQWMsYUFBRSxPQUFPO0FBQUEsRUFDM0IsWUFBWSxhQUFFLE9BQU8sRUFBRSxTQUFTLHVFQUF1RTtBQUFBLEVBQ3ZHLFNBQVMsYUFBRSxPQUFPLEVBQUUsU0FBUywyREFBMkQ7QUFDMUYsQ0FBQztBQUNELElBQU0sZUFBZSxhQUFFLE9BQU87QUFBQSxFQUM1QixTQUFTLGFBQUUsUUFBUTtBQUFBLEVBQ25CLFNBQVMsYUFBRSxPQUFPO0FBQ3BCLENBQUM7QUFDRCxJQUFNLFNBQVM7QUFBQSxFQUNiLE1BQU07QUFBQSxFQUNOLGFBQWE7QUFBQSxFQUNiLFNBQVM7QUFBQSxFQUNULFVBQVU7QUFBQSxJQUNSLFFBQVE7QUFBQSxJQUNSLE1BQU07QUFBQSxJQUNOLE9BQU87QUFBQSxFQUNUO0FBQUEsRUFDQSxPQUFPO0FBQUEsRUFDUCxRQUFRO0FBQUEsRUFDUixRQUFRLENBQUMsaURBQWlEO0FBQUEsRUFDMUQsTUFBTSxPQUFPLE9BQU8sVUFBaUQ7QUFFbkUsVUFBTSxNQUFNLE9BQU87QUFBQSxNQUNqQixVQUFVLDBCQUEwQixtQkFBbUIsTUFBTSxVQUFVLENBQUMsV0FBVyxtQkFBbUIsTUFBTSxPQUFPLENBQUM7QUFBQSxNQUNwSCxTQUFTO0FBQUEsSUFDWCxDQUFDO0FBQ0QsV0FBTztBQUFBLE1BQ0wsU0FBUztBQUFBLE1BQ1QsU0FBUyxTQUFTLE1BQU0sT0FBTyx1Q0FBdUMsTUFBTSxVQUFVO0FBQUEsSUFDeEY7QUFBQSxFQUNGO0FBQ0Y7QUFFQSxJQUFPLHVCQUFROyIsCiAgIm5hbWVzIjogW10KfQo=
