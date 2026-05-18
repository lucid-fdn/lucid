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

// google/actions/create-recurring-event.ts
var create_recurring_event_exports = {};
__export(create_recurring_event_exports, {
  default: () => create_recurring_event_default
});
module.exports = __toCommonJS(create_recurring_event_exports);
var import_zod = require("zod");
var InputSchema = import_zod.z.object({
  calendarId: import_zod.z.string().optional().describe('Calendar ID. Defaults to "primary". Example: "primary"'),
  summary: import_zod.z.string().describe('Event title/summary. Example: "Weekly Team Meeting"'),
  description: import_zod.z.string().optional().describe('Event description. Example: "Discuss project progress"'),
  location: import_zod.z.string().optional().describe('Event location. Example: "Conference Room A"'),
  start: import_zod.z.string().describe('Event start time in RFC3339 format. Example: "2024-03-15T09:00:00-07:00"'),
  end: import_zod.z.string().describe('Event end time in RFC3339 format. Example: "2024-03-15T10:00:00-07:00"'),
  rrule: import_zod.z.string().describe('iCalendar RRULE for recurrence. Example: "FREQ=WEEKLY;BYDAY=MO,WE,FR"'),
  timezone: import_zod.z.string().optional().describe('Timezone for the event. Defaults to "UTC". Example: "America/Los_Angeles"')
});
var OutputSchema = import_zod.z.object({
  id: import_zod.z.string(),
  htmlLink: import_zod.z.string(),
  summary: import_zod.z.string(),
  start: import_zod.z.string(),
  end: import_zod.z.string(),
  recurrence: import_zod.z.array(import_zod.z.string()).optional(),
  status: import_zod.z.string()
});
var action = {
  type: "action",
  description: "Create a recurring event with supplied start, end, and RRULE values",
  version: "1.0.0",
  endpoint: {
    method: "POST",
    path: "/actions/create-recurring-event",
    group: "Events"
  },
  input: InputSchema,
  output: OutputSchema,
  scopes: ["https://www.googleapis.com/auth/calendar.events"],
  exec: async (nango, input) => {
    const calendarId = input.calendarId || "primary";
    const timezone = input.timezone || "UTC";
    const response = await nango.post({
      endpoint: `/calendar/v3/calendars/${calendarId}/events`,
      data: {
        summary: input.summary,
        description: input.description,
        location: input.location,
        start: {
          dateTime: input.start,
          timeZone: timezone
        },
        end: {
          dateTime: input.end,
          timeZone: timezone
        },
        recurrence: [`RRULE:${input.rrule}`]
      },
      retries: 3
    });
    if (!response.data || !response.data.id) {
      throw new nango.ActionError({
        type: "create_failed",
        message: "Failed to create recurring event"
      });
    }
    const event = response.data;
    return {
      id: event.id,
      htmlLink: event.htmlLink,
      summary: event.summary,
      start: event.start?.dateTime || event.start?.date,
      end: event.end?.dateTime || event.end?.date,
      recurrence: event.recurrence,
      status: event.status
    };
  }
};
var create_recurring_event_default = action;
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiZ29vZ2xlL2FjdGlvbnMvY3JlYXRlLXJlY3VycmluZy1ldmVudC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiaW1wb3J0IHsgeiB9IGZyb20gJ3pvZCc7XG5pbXBvcnQgeyBjcmVhdGVBY3Rpb24gfSBmcm9tICduYW5nbyc7XG5jb25zdCBJbnB1dFNjaGVtYSA9IHoub2JqZWN0KHtcbiAgY2FsZW5kYXJJZDogei5zdHJpbmcoKS5vcHRpb25hbCgpLmRlc2NyaWJlKCdDYWxlbmRhciBJRC4gRGVmYXVsdHMgdG8gXCJwcmltYXJ5XCIuIEV4YW1wbGU6IFwicHJpbWFyeVwiJyksXG4gIHN1bW1hcnk6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ0V2ZW50IHRpdGxlL3N1bW1hcnkuIEV4YW1wbGU6IFwiV2Vla2x5IFRlYW0gTWVldGluZ1wiJyksXG4gIGRlc2NyaXB0aW9uOiB6LnN0cmluZygpLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ0V2ZW50IGRlc2NyaXB0aW9uLiBFeGFtcGxlOiBcIkRpc2N1c3MgcHJvamVjdCBwcm9ncmVzc1wiJyksXG4gIGxvY2F0aW9uOiB6LnN0cmluZygpLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ0V2ZW50IGxvY2F0aW9uLiBFeGFtcGxlOiBcIkNvbmZlcmVuY2UgUm9vbSBBXCInKSxcbiAgc3RhcnQ6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ0V2ZW50IHN0YXJ0IHRpbWUgaW4gUkZDMzMzOSBmb3JtYXQuIEV4YW1wbGU6IFwiMjAyNC0wMy0xNVQwOTowMDowMC0wNzowMFwiJyksXG4gIGVuZDogei5zdHJpbmcoKS5kZXNjcmliZSgnRXZlbnQgZW5kIHRpbWUgaW4gUkZDMzMzOSBmb3JtYXQuIEV4YW1wbGU6IFwiMjAyNC0wMy0xNVQxMDowMDowMC0wNzowMFwiJyksXG4gIHJydWxlOiB6LnN0cmluZygpLmRlc2NyaWJlKCdpQ2FsZW5kYXIgUlJVTEUgZm9yIHJlY3VycmVuY2UuIEV4YW1wbGU6IFwiRlJFUT1XRUVLTFk7QllEQVk9TU8sV0UsRlJcIicpLFxuICB0aW1lem9uZTogei5zdHJpbmcoKS5vcHRpb25hbCgpLmRlc2NyaWJlKCdUaW1lem9uZSBmb3IgdGhlIGV2ZW50LiBEZWZhdWx0cyB0byBcIlVUQ1wiLiBFeGFtcGxlOiBcIkFtZXJpY2EvTG9zX0FuZ2VsZXNcIicpXG59KTtcbmNvbnN0IE91dHB1dFNjaGVtYSA9IHoub2JqZWN0KHtcbiAgaWQ6IHouc3RyaW5nKCksXG4gIGh0bWxMaW5rOiB6LnN0cmluZygpLFxuICBzdW1tYXJ5OiB6LnN0cmluZygpLFxuICBzdGFydDogei5zdHJpbmcoKSxcbiAgZW5kOiB6LnN0cmluZygpLFxuICByZWN1cnJlbmNlOiB6LmFycmF5KHouc3RyaW5nKCkpLm9wdGlvbmFsKCksXG4gIHN0YXR1czogei5zdHJpbmcoKVxufSk7XG5jb25zdCBhY3Rpb24gPSB7XG4gIHR5cGU6IFwiYWN0aW9uXCIsXG4gIGRlc2NyaXB0aW9uOiAnQ3JlYXRlIGEgcmVjdXJyaW5nIGV2ZW50IHdpdGggc3VwcGxpZWQgc3RhcnQsIGVuZCwgYW5kIFJSVUxFIHZhbHVlcycsXG4gIHZlcnNpb246ICcxLjAuMCcsXG4gIGVuZHBvaW50OiB7XG4gICAgbWV0aG9kOiAnUE9TVCcsXG4gICAgcGF0aDogJy9hY3Rpb25zL2NyZWF0ZS1yZWN1cnJpbmctZXZlbnQnLFxuICAgIGdyb3VwOiAnRXZlbnRzJ1xuICB9LFxuICBpbnB1dDogSW5wdXRTY2hlbWEsXG4gIG91dHB1dDogT3V0cHV0U2NoZW1hLFxuICBzY29wZXM6IFsnaHR0cHM6Ly93d3cuZ29vZ2xlYXBpcy5jb20vYXV0aC9jYWxlbmRhci5ldmVudHMnXSxcbiAgZXhlYzogYXN5bmMgKG5hbmdvLCBpbnB1dCk6IFByb21pc2U8ei5pbmZlcjx0eXBlb2YgT3V0cHV0U2NoZW1hPj4gPT4ge1xuICAgIGNvbnN0IGNhbGVuZGFySWQgPSBpbnB1dC5jYWxlbmRhcklkIHx8ICdwcmltYXJ5JztcbiAgICBjb25zdCB0aW1lem9uZSA9IGlucHV0LnRpbWV6b25lIHx8ICdVVEMnO1xuXG4gICAgLy8gaHR0cHM6Ly9kZXZlbG9wZXJzLmdvb2dsZS5jb20vY2FsZW5kYXIvYXBpL3YzL3JlZmVyZW5jZS9ldmVudHMvaW5zZXJ0XG4gICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBuYW5nby5wb3N0KHtcbiAgICAgIGVuZHBvaW50OiBgL2NhbGVuZGFyL3YzL2NhbGVuZGFycy8ke2NhbGVuZGFySWR9L2V2ZW50c2AsXG4gICAgICBkYXRhOiB7XG4gICAgICAgIHN1bW1hcnk6IGlucHV0LnN1bW1hcnksXG4gICAgICAgIGRlc2NyaXB0aW9uOiBpbnB1dC5kZXNjcmlwdGlvbixcbiAgICAgICAgbG9jYXRpb246IGlucHV0LmxvY2F0aW9uLFxuICAgICAgICBzdGFydDoge1xuICAgICAgICAgIGRhdGVUaW1lOiBpbnB1dC5zdGFydCxcbiAgICAgICAgICB0aW1lWm9uZTogdGltZXpvbmVcbiAgICAgICAgfSxcbiAgICAgICAgZW5kOiB7XG4gICAgICAgICAgZGF0ZVRpbWU6IGlucHV0LmVuZCxcbiAgICAgICAgICB0aW1lWm9uZTogdGltZXpvbmVcbiAgICAgICAgfSxcbiAgICAgICAgcmVjdXJyZW5jZTogW2BSUlVMRToke2lucHV0LnJydWxlfWBdXG4gICAgICB9LFxuICAgICAgcmV0cmllczogM1xuICAgIH0pO1xuICAgIGNvbnN0IGV2ZW50ID0gcmVzcG9uc2UuZGF0YTtcbiAgICByZXR1cm4ge1xuICAgICAgaWQ6IGV2ZW50LmlkLFxuICAgICAgaHRtbExpbms6IGV2ZW50Lmh0bWxMaW5rLFxuICAgICAgc3VtbWFyeTogZXZlbnQuc3VtbWFyeSxcbiAgICAgIHN0YXJ0OiBldmVudC5zdGFydD8uZGF0ZVRpbWUgfHwgZXZlbnQuc3RhcnQ/LmRhdGUsXG4gICAgICBlbmQ6IGV2ZW50LmVuZD8uZGF0ZVRpbWUgfHwgZXZlbnQuZW5kPy5kYXRlLFxuICAgICAgcmVjdXJyZW5jZTogZXZlbnQucmVjdXJyZW5jZSxcbiAgICAgIHN0YXR1czogZXZlbnQuc3RhdHVzXG4gICAgfTtcbiAgfVxufTtcbmV4cG9ydCB0eXBlIE5hbmdvQWN0aW9uTG9jYWwgPSBQYXJhbWV0ZXJzPCh0eXBlb2YgYWN0aW9uKVsnZXhlYyddPlswXTtcbmV4cG9ydCBkZWZhdWx0IGFjdGlvbjsiXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxpQkFBa0I7QUFFbEIsSUFBTSxjQUFjLGFBQUUsT0FBTztBQUFBLEVBQzNCLFlBQVksYUFBRSxPQUFPLEVBQUUsU0FBUyxFQUFFLFNBQVMsd0RBQXdEO0FBQUEsRUFDbkcsU0FBUyxhQUFFLE9BQU8sRUFBRSxTQUFTLHFEQUFxRDtBQUFBLEVBQ2xGLGFBQWEsYUFBRSxPQUFPLEVBQUUsU0FBUyxFQUFFLFNBQVMsd0RBQXdEO0FBQUEsRUFDcEcsVUFBVSxhQUFFLE9BQU8sRUFBRSxTQUFTLEVBQUUsU0FBUyw4Q0FBOEM7QUFBQSxFQUN2RixPQUFPLGFBQUUsT0FBTyxFQUFFLFNBQVMsMEVBQTBFO0FBQUEsRUFDckcsS0FBSyxhQUFFLE9BQU8sRUFBRSxTQUFTLHdFQUF3RTtBQUFBLEVBQ2pHLE9BQU8sYUFBRSxPQUFPLEVBQUUsU0FBUyx1RUFBdUU7QUFBQSxFQUNsRyxVQUFVLGFBQUUsT0FBTyxFQUFFLFNBQVMsRUFBRSxTQUFTLDJFQUEyRTtBQUN0SCxDQUFDO0FBQ0QsSUFBTSxlQUFlLGFBQUUsT0FBTztBQUFBLEVBQzVCLElBQUksYUFBRSxPQUFPO0FBQUEsRUFDYixVQUFVLGFBQUUsT0FBTztBQUFBLEVBQ25CLFNBQVMsYUFBRSxPQUFPO0FBQUEsRUFDbEIsT0FBTyxhQUFFLE9BQU87QUFBQSxFQUNoQixLQUFLLGFBQUUsT0FBTztBQUFBLEVBQ2QsWUFBWSxhQUFFLE1BQU0sYUFBRSxPQUFPLENBQUMsRUFBRSxTQUFTO0FBQUEsRUFDekMsUUFBUSxhQUFFLE9BQU87QUFDbkIsQ0FBQztBQUNELElBQU0sU0FBUztBQUFBLEVBQ2IsTUFBTTtBQUFBLEVBQ04sYUFBYTtBQUFBLEVBQ2IsU0FBUztBQUFBLEVBQ1QsVUFBVTtBQUFBLElBQ1IsUUFBUTtBQUFBLElBQ1IsTUFBTTtBQUFBLElBQ04sT0FBTztBQUFBLEVBQ1Q7QUFBQSxFQUNBLE9BQU87QUFBQSxFQUNQLFFBQVE7QUFBQSxFQUNSLFFBQVEsQ0FBQyxpREFBaUQ7QUFBQSxFQUMxRCxNQUFNLE9BQU8sT0FBTyxVQUFpRDtBQUNuRSxVQUFNLGFBQWEsTUFBTSxjQUFjO0FBQ3ZDLFVBQU0sV0FBVyxNQUFNLFlBQVk7QUFHbkMsVUFBTSxXQUFXLE1BQU0sTUFBTSxLQUFLO0FBQUEsTUFDaEMsVUFBVSwwQkFBMEIsVUFBVTtBQUFBLE1BQzlDLE1BQU07QUFBQSxRQUNKLFNBQVMsTUFBTTtBQUFBLFFBQ2YsYUFBYSxNQUFNO0FBQUEsUUFDbkIsVUFBVSxNQUFNO0FBQUEsUUFDaEIsT0FBTztBQUFBLFVBQ0wsVUFBVSxNQUFNO0FBQUEsVUFDaEIsVUFBVTtBQUFBLFFBQ1o7QUFBQSxRQUNBLEtBQUs7QUFBQSxVQUNILFVBQVUsTUFBTTtBQUFBLFVBQ2hCLFVBQVU7QUFBQSxRQUNaO0FBQUEsUUFDQSxZQUFZLENBQUMsU0FBUyxNQUFNLEtBQUssRUFBRTtBQUFBLE1BQ3JDO0FBQUEsTUFDQSxTQUFTO0FBQUEsSUFDWCxDQUFDO0FBQ0QsVUFBTSxRQUFRLFNBQVM7QUFDdkIsV0FBTztBQUFBLE1BQ0wsSUFBSSxNQUFNO0FBQUEsTUFDVixVQUFVLE1BQU07QUFBQSxNQUNoQixTQUFTLE1BQU07QUFBQSxNQUNmLE9BQU8sTUFBTSxPQUFPLFlBQVksTUFBTSxPQUFPO0FBQUEsTUFDN0MsS0FBSyxNQUFNLEtBQUssWUFBWSxNQUFNLEtBQUs7QUFBQSxNQUN2QyxZQUFZLE1BQU07QUFBQSxNQUNsQixRQUFRLE1BQU07QUFBQSxJQUNoQjtBQUFBLEVBQ0Y7QUFDRjtBQUVBLElBQU8saUNBQVE7IiwKICAibmFtZXMiOiBbXQp9Cg==
