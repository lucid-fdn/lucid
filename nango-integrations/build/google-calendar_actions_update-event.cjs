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

// google/actions/update-event.ts
var update_event_exports = {};
__export(update_event_exports, {
  default: () => update_event_default
});
module.exports = __toCommonJS(update_event_exports);
var import_zod = require("zod");
var DateTimeSchema = import_zod.z.object({
  date: import_zod.z.string().optional().describe("Date in yyyy-mm-dd format for all-day events"),
  dateTime: import_zod.z.string().optional().describe("DateTime in RFC3339 format for timed events"),
  timeZone: import_zod.z.string().optional().describe('Time zone (IANA format, e.g., "Europe/Zurich")')
});
var AttendeeSchema = import_zod.z.object({
  id: import_zod.z.string().optional(),
  email: import_zod.z.string().optional(),
  displayName: import_zod.z.string().optional(),
  organizer: import_zod.z.boolean().optional(),
  self: import_zod.z.boolean().optional(),
  resource: import_zod.z.boolean().optional(),
  optional: import_zod.z.boolean().optional(),
  responseStatus: import_zod.z.enum(["needsAction", "declined", "tentative", "accepted"]).optional(),
  comment: import_zod.z.string().optional(),
  additionalGuests: import_zod.z.number().optional()
});
var InputSchema = import_zod.z.object({
  calendarId: import_zod.z.string().optional().default("primary").describe('Calendar identifier. Defaults to "primary". Use "primary" for the main calendar'),
  eventId: import_zod.z.string().describe("Event identifier"),
  summary: import_zod.z.string().optional().describe("Title of the event"),
  description: import_zod.z.string().optional().describe("Description of the event"),
  location: import_zod.z.string().optional().describe("Geographic location of the event"),
  start: DateTimeSchema.optional().describe("Start time of the event"),
  end: DateTimeSchema.optional().describe("End time of the event"),
  attendees: import_zod.z.array(AttendeeSchema).optional().describe("Attendees of the event"),
  status: import_zod.z.enum(["confirmed", "tentative", "cancelled"]).optional().describe("Status of the event"),
  visibility: import_zod.z.enum(["default", "public", "private", "confidential"]).optional().describe("Visibility of the event"),
  colorId: import_zod.z.string().optional().describe("Color ID of the event"),
  reminders: import_zod.z.object({
    useDefault: import_zod.z.boolean().optional(),
    overrides: import_zod.z.array(import_zod.z.object({
      method: import_zod.z.enum(["email", "popup"]),
      minutes: import_zod.z.number()
    })).optional()
  }).optional().describe("Reminders for the event"),
  sendUpdates: import_zod.z.enum(["all", "externalOnly", "none"]).optional().describe("Who should receive notifications about the event update")
});
var OutputSchema = import_zod.z.object({
  id: import_zod.z.string(),
  summary: import_zod.z.string().optional(),
  description: import_zod.z.string().optional(),
  location: import_zod.z.string().optional(),
  start: DateTimeSchema.optional(),
  end: DateTimeSchema.optional(),
  status: import_zod.z.string().optional(),
  visibility: import_zod.z.string().optional(),
  htmlLink: import_zod.z.string().optional(),
  created: import_zod.z.string().optional(),
  updated: import_zod.z.string().optional(),
  organizer: import_zod.z.object({
    id: import_zod.z.string().optional(),
    email: import_zod.z.string().optional(),
    displayName: import_zod.z.string().optional(),
    self: import_zod.z.boolean().optional()
  }).optional(),
  attendees: import_zod.z.array(AttendeeSchema).optional()
});
var action = {
  type: "action",
  description: "Update a calendar event",
  version: "1.0.0",
  endpoint: {
    method: "POST",
    path: "/actions/update-event",
    group: "Events"
  },
  input: InputSchema,
  output: OutputSchema,
  scopes: ["https://www.googleapis.com/auth/calendar", "https://www.googleapis.com/auth/calendar.events"],
  exec: async (nango, input) => {
    const calendarId = input.calendarId || "primary";
    const response = await nango.patch({
      endpoint: `/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(input.eventId)}`,
      data: {
        ...input.summary && {
          summary: input.summary
        },
        ...input.description && {
          description: input.description
        },
        ...input.location && {
          location: input.location
        },
        ...input.start && {
          start: input.start
        },
        ...input.end && {
          end: input.end
        },
        ...input.attendees && {
          attendees: input.attendees
        },
        ...input.status && {
          status: input.status
        },
        ...input.visibility && {
          visibility: input.visibility
        },
        ...input.colorId && {
          colorId: input.colorId
        },
        ...input.reminders && {
          reminders: input.reminders
        }
      },
      params: {
        ...input.sendUpdates && {
          sendUpdates: input.sendUpdates
        }
      },
      retries: 3
    });
    if (!response.data || !response.data.id) {
      throw new nango.ActionError({
        type: "update_failed",
        message: `Failed to update event ${input.eventId} in calendar ${calendarId}`
      });
    }
    const event = response.data;
    return {
      id: event.id,
      summary: event.summary ?? void 0,
      description: event.description ?? void 0,
      location: event.location ?? void 0,
      start: event.start ?? void 0,
      end: event.end ?? void 0,
      status: event.status ?? void 0,
      visibility: event.visibility ?? void 0,
      htmlLink: event.htmlLink ?? void 0,
      created: event.created ?? void 0,
      updated: event.updated ?? void 0,
      organizer: event.organizer ?? void 0,
      attendees: event.attendees ?? void 0
    };
  }
};
var update_event_default = action;
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiZ29vZ2xlL2FjdGlvbnMvdXBkYXRlLWV2ZW50LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyJpbXBvcnQgeyB6IH0gZnJvbSAnem9kJztcbmltcG9ydCB7IGNyZWF0ZUFjdGlvbiB9IGZyb20gJ25hbmdvJztcbmNvbnN0IERhdGVUaW1lU2NoZW1hID0gei5vYmplY3Qoe1xuICBkYXRlOiB6LnN0cmluZygpLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ0RhdGUgaW4geXl5eS1tbS1kZCBmb3JtYXQgZm9yIGFsbC1kYXkgZXZlbnRzJyksXG4gIGRhdGVUaW1lOiB6LnN0cmluZygpLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ0RhdGVUaW1lIGluIFJGQzMzMzkgZm9ybWF0IGZvciB0aW1lZCBldmVudHMnKSxcbiAgdGltZVpvbmU6IHouc3RyaW5nKCkub3B0aW9uYWwoKS5kZXNjcmliZSgnVGltZSB6b25lIChJQU5BIGZvcm1hdCwgZS5nLiwgXCJFdXJvcGUvWnVyaWNoXCIpJylcbn0pO1xuY29uc3QgQXR0ZW5kZWVTY2hlbWEgPSB6Lm9iamVjdCh7XG4gIGlkOiB6LnN0cmluZygpLm9wdGlvbmFsKCksXG4gIGVtYWlsOiB6LnN0cmluZygpLm9wdGlvbmFsKCksXG4gIGRpc3BsYXlOYW1lOiB6LnN0cmluZygpLm9wdGlvbmFsKCksXG4gIG9yZ2FuaXplcjogei5ib29sZWFuKCkub3B0aW9uYWwoKSxcbiAgc2VsZjogei5ib29sZWFuKCkub3B0aW9uYWwoKSxcbiAgcmVzb3VyY2U6IHouYm9vbGVhbigpLm9wdGlvbmFsKCksXG4gIG9wdGlvbmFsOiB6LmJvb2xlYW4oKS5vcHRpb25hbCgpLFxuICByZXNwb25zZVN0YXR1czogei5lbnVtKFsnbmVlZHNBY3Rpb24nLCAnZGVjbGluZWQnLCAndGVudGF0aXZlJywgJ2FjY2VwdGVkJ10pLm9wdGlvbmFsKCksXG4gIGNvbW1lbnQ6IHouc3RyaW5nKCkub3B0aW9uYWwoKSxcbiAgYWRkaXRpb25hbEd1ZXN0czogei5udW1iZXIoKS5vcHRpb25hbCgpXG59KTtcbmNvbnN0IElucHV0U2NoZW1hID0gei5vYmplY3Qoe1xuICBjYWxlbmRhcklkOiB6LnN0cmluZygpLmRlc2NyaWJlKCdDYWxlbmRhciBpZGVudGlmaWVyLiBVc2UgXCJwcmltYXJ5XCIgZm9yIHRoZSBtYWluIGNhbGVuZGFyJyksXG4gIGV2ZW50SWQ6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ0V2ZW50IGlkZW50aWZpZXInKSxcbiAgc3VtbWFyeTogei5zdHJpbmcoKS5vcHRpb25hbCgpLmRlc2NyaWJlKCdUaXRsZSBvZiB0aGUgZXZlbnQnKSxcbiAgZGVzY3JpcHRpb246IHouc3RyaW5nKCkub3B0aW9uYWwoKS5kZXNjcmliZSgnRGVzY3JpcHRpb24gb2YgdGhlIGV2ZW50JyksXG4gIGxvY2F0aW9uOiB6LnN0cmluZygpLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ0dlb2dyYXBoaWMgbG9jYXRpb24gb2YgdGhlIGV2ZW50JyksXG4gIHN0YXJ0OiBEYXRlVGltZVNjaGVtYS5vcHRpb25hbCgpLmRlc2NyaWJlKCdTdGFydCB0aW1lIG9mIHRoZSBldmVudCcpLFxuICBlbmQ6IERhdGVUaW1lU2NoZW1hLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ0VuZCB0aW1lIG9mIHRoZSBldmVudCcpLFxuICBhdHRlbmRlZXM6IHouYXJyYXkoQXR0ZW5kZWVTY2hlbWEpLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ0F0dGVuZGVlcyBvZiB0aGUgZXZlbnQnKSxcbiAgc3RhdHVzOiB6LmVudW0oWydjb25maXJtZWQnLCAndGVudGF0aXZlJywgJ2NhbmNlbGxlZCddKS5vcHRpb25hbCgpLmRlc2NyaWJlKCdTdGF0dXMgb2YgdGhlIGV2ZW50JyksXG4gIHZpc2liaWxpdHk6IHouZW51bShbJ2RlZmF1bHQnLCAncHVibGljJywgJ3ByaXZhdGUnLCAnY29uZmlkZW50aWFsJ10pLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ1Zpc2liaWxpdHkgb2YgdGhlIGV2ZW50JyksXG4gIGNvbG9ySWQ6IHouc3RyaW5nKCkub3B0aW9uYWwoKS5kZXNjcmliZSgnQ29sb3IgSUQgb2YgdGhlIGV2ZW50JyksXG4gIHJlbWluZGVyczogei5vYmplY3Qoe1xuICAgIHVzZURlZmF1bHQ6IHouYm9vbGVhbigpLm9wdGlvbmFsKCksXG4gICAgb3ZlcnJpZGVzOiB6LmFycmF5KHoub2JqZWN0KHtcbiAgICAgIG1ldGhvZDogei5lbnVtKFsnZW1haWwnLCAncG9wdXAnXSksXG4gICAgICBtaW51dGVzOiB6Lm51bWJlcigpXG4gICAgfSkpLm9wdGlvbmFsKClcbiAgfSkub3B0aW9uYWwoKS5kZXNjcmliZSgnUmVtaW5kZXJzIGZvciB0aGUgZXZlbnQnKSxcbiAgc2VuZFVwZGF0ZXM6IHouZW51bShbJ2FsbCcsICdleHRlcm5hbE9ubHknLCAnbm9uZSddKS5vcHRpb25hbCgpLmRlc2NyaWJlKCdXaG8gc2hvdWxkIHJlY2VpdmUgbm90aWZpY2F0aW9ucyBhYm91dCB0aGUgZXZlbnQgdXBkYXRlJylcbn0pO1xuY29uc3QgT3V0cHV0U2NoZW1hID0gei5vYmplY3Qoe1xuICBpZDogei5zdHJpbmcoKSxcbiAgc3VtbWFyeTogei5zdHJpbmcoKS5vcHRpb25hbCgpLFxuICBkZXNjcmlwdGlvbjogei5zdHJpbmcoKS5vcHRpb25hbCgpLFxuICBsb2NhdGlvbjogei5zdHJpbmcoKS5vcHRpb25hbCgpLFxuICBzdGFydDogRGF0ZVRpbWVTY2hlbWEub3B0aW9uYWwoKSxcbiAgZW5kOiBEYXRlVGltZVNjaGVtYS5vcHRpb25hbCgpLFxuICBzdGF0dXM6IHouc3RyaW5nKCkub3B0aW9uYWwoKSxcbiAgdmlzaWJpbGl0eTogei5zdHJpbmcoKS5vcHRpb25hbCgpLFxuICBodG1sTGluazogei5zdHJpbmcoKS5vcHRpb25hbCgpLFxuICBjcmVhdGVkOiB6LnN0cmluZygpLm9wdGlvbmFsKCksXG4gIHVwZGF0ZWQ6IHouc3RyaW5nKCkub3B0aW9uYWwoKSxcbiAgb3JnYW5pemVyOiB6Lm9iamVjdCh7XG4gICAgaWQ6IHouc3RyaW5nKCkub3B0aW9uYWwoKSxcbiAgICBlbWFpbDogei5zdHJpbmcoKS5vcHRpb25hbCgpLFxuICAgIGRpc3BsYXlOYW1lOiB6LnN0cmluZygpLm9wdGlvbmFsKCksXG4gICAgc2VsZjogei5ib29sZWFuKCkub3B0aW9uYWwoKVxuICB9KS5vcHRpb25hbCgpLFxuICBhdHRlbmRlZXM6IHouYXJyYXkoQXR0ZW5kZWVTY2hlbWEpLm9wdGlvbmFsKClcbn0pO1xuY29uc3QgYWN0aW9uID0ge1xuICB0eXBlOiBcImFjdGlvblwiLFxuICBkZXNjcmlwdGlvbjogJ1VwZGF0ZSBhIGNhbGVuZGFyIGV2ZW50JyxcbiAgdmVyc2lvbjogJzEuMC4wJyxcbiAgZW5kcG9pbnQ6IHtcbiAgICBtZXRob2Q6ICdQT1NUJyxcbiAgICBwYXRoOiAnL2FjdGlvbnMvdXBkYXRlLWV2ZW50JyxcbiAgICBncm91cDogJ0V2ZW50cydcbiAgfSxcbiAgaW5wdXQ6IElucHV0U2NoZW1hLFxuICBvdXRwdXQ6IE91dHB1dFNjaGVtYSxcbiAgc2NvcGVzOiBbJ2h0dHBzOi8vd3d3Lmdvb2dsZWFwaXMuY29tL2F1dGgvY2FsZW5kYXInLCAnaHR0cHM6Ly93d3cuZ29vZ2xlYXBpcy5jb20vYXV0aC9jYWxlbmRhci5ldmVudHMnXSxcbiAgZXhlYzogYXN5bmMgKG5hbmdvLCBpbnB1dCk6IFByb21pc2U8ei5pbmZlcjx0eXBlb2YgT3V0cHV0U2NoZW1hPj4gPT4ge1xuICAgIC8vIGh0dHBzOi8vZGV2ZWxvcGVycy5nb29nbGUuY29tL3dvcmtzcGFjZS9jYWxlbmRhci9hcGkvdjMvcmVmZXJlbmNlL2V2ZW50cy9wYXRjaFxuICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgbmFuZ28ucGF0Y2goe1xuICAgICAgZW5kcG9pbnQ6IGAvY2FsZW5kYXIvdjMvY2FsZW5kYXJzLyR7aW5wdXQuY2FsZW5kYXJJZH0vZXZlbnRzLyR7aW5wdXQuZXZlbnRJZH1gLFxuICAgICAgZGF0YToge1xuICAgICAgICAuLi4oaW5wdXQuc3VtbWFyeSAmJiB7XG4gICAgICAgICAgc3VtbWFyeTogaW5wdXQuc3VtbWFyeVxuICAgICAgICB9KSxcbiAgICAgICAgLi4uKGlucHV0LmRlc2NyaXB0aW9uICYmIHtcbiAgICAgICAgICBkZXNjcmlwdGlvbjogaW5wdXQuZGVzY3JpcHRpb25cbiAgICAgICAgfSksXG4gICAgICAgIC4uLihpbnB1dC5sb2NhdGlvbiAmJiB7XG4gICAgICAgICAgbG9jYXRpb246IGlucHV0LmxvY2F0aW9uXG4gICAgICAgIH0pLFxuICAgICAgICAuLi4oaW5wdXQuc3RhcnQgJiYge1xuICAgICAgICAgIHN0YXJ0OiBpbnB1dC5zdGFydFxuICAgICAgICB9KSxcbiAgICAgICAgLi4uKGlucHV0LmVuZCAmJiB7XG4gICAgICAgICAgZW5kOiBpbnB1dC5lbmRcbiAgICAgICAgfSksXG4gICAgICAgIC4uLihpbnB1dC5hdHRlbmRlZXMgJiYge1xuICAgICAgICAgIGF0dGVuZGVlczogaW5wdXQuYXR0ZW5kZWVzXG4gICAgICAgIH0pLFxuICAgICAgICAuLi4oaW5wdXQuc3RhdHVzICYmIHtcbiAgICAgICAgICBzdGF0dXM6IGlucHV0LnN0YXR1c1xuICAgICAgICB9KSxcbiAgICAgICAgLi4uKGlucHV0LnZpc2liaWxpdHkgJiYge1xuICAgICAgICAgIHZpc2liaWxpdHk6IGlucHV0LnZpc2liaWxpdHlcbiAgICAgICAgfSksXG4gICAgICAgIC4uLihpbnB1dC5jb2xvcklkICYmIHtcbiAgICAgICAgICBjb2xvcklkOiBpbnB1dC5jb2xvcklkXG4gICAgICAgIH0pLFxuICAgICAgICAuLi4oaW5wdXQucmVtaW5kZXJzICYmIHtcbiAgICAgICAgICByZW1pbmRlcnM6IGlucHV0LnJlbWluZGVyc1xuICAgICAgICB9KVxuICAgICAgfSxcbiAgICAgIHBhcmFtczoge1xuICAgICAgICAuLi4oaW5wdXQuc2VuZFVwZGF0ZXMgJiYge1xuICAgICAgICAgIHNlbmRVcGRhdGVzOiBpbnB1dC5zZW5kVXBkYXRlc1xuICAgICAgICB9KVxuICAgICAgfSxcbiAgICAgIHJldHJpZXM6IDNcbiAgICB9KTtcbiAgICBjb25zdCBldmVudCA9IHJlc3BvbnNlLmRhdGE7XG4gICAgcmV0dXJuIHtcbiAgICAgIGlkOiBldmVudC5pZCxcbiAgICAgIHN1bW1hcnk6IGV2ZW50LnN1bW1hcnkgPz8gdW5kZWZpbmVkLFxuICAgICAgZGVzY3JpcHRpb246IGV2ZW50LmRlc2NyaXB0aW9uID8/IHVuZGVmaW5lZCxcbiAgICAgIGxvY2F0aW9uOiBldmVudC5sb2NhdGlvbiA/PyB1bmRlZmluZWQsXG4gICAgICBzdGFydDogZXZlbnQuc3RhcnQgPz8gdW5kZWZpbmVkLFxuICAgICAgZW5kOiBldmVudC5lbmQgPz8gdW5kZWZpbmVkLFxuICAgICAgc3RhdHVzOiBldmVudC5zdGF0dXMgPz8gdW5kZWZpbmVkLFxuICAgICAgdmlzaWJpbGl0eTogZXZlbnQudmlzaWJpbGl0eSA/PyB1bmRlZmluZWQsXG4gICAgICBodG1sTGluazogZXZlbnQuaHRtbExpbmsgPz8gdW5kZWZpbmVkLFxuICAgICAgY3JlYXRlZDogZXZlbnQuY3JlYXRlZCA/PyB1bmRlZmluZWQsXG4gICAgICB1cGRhdGVkOiBldmVudC51cGRhdGVkID8/IHVuZGVmaW5lZCxcbiAgICAgIG9yZ2FuaXplcjogZXZlbnQub3JnYW5pemVyID8/IHVuZGVmaW5lZCxcbiAgICAgIGF0dGVuZGVlczogZXZlbnQuYXR0ZW5kZWVzID8/IHVuZGVmaW5lZFxuICAgIH07XG4gIH1cbn07XG5leHBvcnQgdHlwZSBOYW5nb0FjdGlvbkxvY2FsID0gUGFyYW1ldGVyczwodHlwZW9mIGFjdGlvbilbJ2V4ZWMnXT5bMF07XG5leHBvcnQgZGVmYXVsdCBhY3Rpb247Il0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsaUJBQWtCO0FBRWxCLElBQU0saUJBQWlCLGFBQUUsT0FBTztBQUFBLEVBQzlCLE1BQU0sYUFBRSxPQUFPLEVBQUUsU0FBUyxFQUFFLFNBQVMsOENBQThDO0FBQUEsRUFDbkYsVUFB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
