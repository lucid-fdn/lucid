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

// google/actions/get-event.ts
var get_event_exports = {};
__export(get_event_exports, {
  default: () => get_event_default
});
module.exports = __toCommonJS(get_event_exports);
var import_zod = require("zod");
var InputSchema = import_zod.z.object({
  calendarId: import_zod.z.string().optional().default("primary").describe('Calendar identifier. Defaults to "primary". Use "primary" for the primary calendar of the currently logged in user.'),
  eventId: import_zod.z.string().describe("Event identifier.")
});
var OutputSchema = import_zod.z.object({
  id: import_zod.z.string(),
  summary: import_zod.z.string().optional(),
  description: import_zod.z.string().optional(),
  location: import_zod.z.string().optional(),
  status: import_zod.z.string().optional(),
  htmlLink: import_zod.z.string().optional(),
  createdAt: import_zod.z.string().optional(),
  updatedAt: import_zod.z.string().optional(),
  start: import_zod.z.object({
    date: import_zod.z.string().optional(),
    dateTime: import_zod.z.string().optional(),
    timeZone: import_zod.z.string().optional()
  }).optional(),
  end: import_zod.z.object({
    date: import_zod.z.string().optional(),
    dateTime: import_zod.z.string().optional(),
    timeZone: import_zod.z.string().optional()
  }).optional(),
  creator: import_zod.z.object({
    id: import_zod.z.string().optional(),
    email: import_zod.z.string().optional(),
    displayName: import_zod.z.string().optional(),
    self: import_zod.z.boolean().optional()
  }).optional(),
  organizer: import_zod.z.object({
    id: import_zod.z.string().optional(),
    email: import_zod.z.string().optional(),
    displayName: import_zod.z.string().optional(),
    self: import_zod.z.boolean().optional()
  }).optional()
});
var action = {
  type: "action",
  description: "Get an event by ID from Google Calendar",
  version: "1.0.0",
  endpoint: {
    method: "GET",
    path: "/actions/get-event",
    group: "Events"
  },
  input: InputSchema,
  output: OutputSchema,
  scopes: ["https://www.googleapis.com/auth/calendar.readonly"],
  exec: async (nango, input) => {
    const calendarId = input.calendarId || "primary";
    const response = await nango.get({
      endpoint: `/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(input.eventId)}`,
      retries: 3
    });
    if (!response.data || !response.data.id) {
      throw new nango.ActionError({
        type: "not_found",
        message: `Event ${input.eventId} not found in calendar ${calendarId}`
      });
    }
    const event = response.data;
    return {
      id: event.id,
      summary: event.summary ?? void 0,
      description: event.description ?? void 0,
      location: event.location ?? void 0,
      status: event.status ?? void 0,
      htmlLink: event.htmlLink ?? void 0,
      createdAt: event.created ?? void 0,
      updatedAt: event.updated ?? void 0,
      start: event.start ? {
        date: event.start.date ?? void 0,
        dateTime: event.start.dateTime ?? void 0,
        timeZone: event.start.timeZone ?? void 0
      } : void 0,
      end: event.end ? {
        date: event.end.date ?? void 0,
        dateTime: event.end.dateTime ?? void 0,
        timeZone: event.end.timeZone ?? void 0
      } : void 0,
      creator: event.creator ? {
        id: event.creator.id ?? void 0,
        email: event.creator.email ?? void 0,
        displayName: event.creator.displayName ?? void 0,
        self: event.creator.self ?? false
      } : void 0,
      organizer: event.organizer ? {
        id: event.organizer.id ?? void 0,
        email: event.organizer.email ?? void 0,
        displayName: event.organizer.displayName ?? void 0,
        self: event.organizer.self ?? false
      } : void 0
    };
  }
};
var get_event_default = action;
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiZ29vZ2xlL2FjdGlvbnMvZ2V0LWV2ZW50LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyJpbXBvcnQgeyB6IH0gZnJvbSAnem9kJztcbmltcG9ydCB7IGNyZWF0ZUFjdGlvbiB9IGZyb20gJ25hbmdvJztcbmNvbnN0IElucHV0U2NoZW1hID0gei5vYmplY3Qoe1xuICBjYWxlbmRhcklkOiB6LnN0cmluZygpLmRlc2NyaWJlKCdDYWxlbmRhciBpZGVudGlmaWVyLiBVc2UgXCJwcmltYXJ5XCIgZm9yIHRoZSBwcmltYXJ5IGNhbGVuZGFyIG9mIHRoZSBjdXJyZW50bHkgbG9nZ2VkIGluIHVzZXIuJyksXG4gIGV2ZW50SWQ6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ0V2ZW50IGlkZW50aWZpZXIuJylcbn0pO1xuY29uc3QgT3V0cHV0U2NoZW1hID0gei5vYmplY3Qoe1xuICBpZDogei5zdHJpbmcoKSxcbiAgc3VtbWFyeTogei5zdHJpbmcoKS5vcHRpb25hbCgpLFxuICBkZXNjcmlwdGlvbjogei5zdHJpbmcoKS5vcHRpb25hbCgpLFxuICBsb2NhdGlvbjogei5zdHJpbmcoKS5vcHRpb25hbCgpLFxuICBzdGF0dXM6IHouc3RyaW5nKCkub3B0aW9uYWwoKSxcbiAgaHRtbExpbms6IHouc3RyaW5nKCkub3B0aW9uYWwoKSxcbiAgY3JlYXRlZEF0OiB6LnN0cmluZygpLm9wdGlvbmFsKCksXG4gIHVwZGF0ZWRBdDogei5zdHJpbmcoKS5vcHRpb25hbCgpLFxuICBzdGFydDogei5vYmplY3Qoe1xuICAgIGRhdGU6IHouc3RyaW5nKCkub3B0aW9uYWwoKSxcbiAgICBkYXRlVGltZTogei5zdHJpbmcoKS5vcHRpb25hbCgpLFxuICAgIHRpbWVab25lOiB6LnN0cmluZygpLm9wdGlvbmFsKClcbiAgfSkub3B0aW9uYWwoKSxcbiAgZW5kOiB6Lm9iamVjdCh7XG4gICAgZGF0ZTogei5zdHJpbmcoKS5vcHRpb25hbCgpLFxuICAgIGRhdGVUaW1lOiB6LnN0cmluZygpLm9wdGlvbmFsKCksXG4gICAgdGltZVpvbmU6IHouc3RyaW5nKCkub3B0aW9uYWwoKVxuICB9KS5vcHRpb25hbCgpLFxuICBjcmVhdG9yOiB6Lm9iamVjdCh7XG4gICAgaWQ6IHouc3RyaW5nKCkub3B0aW9uYWwoKSxcbiAgICBlbWFpbDogei5zdHJpbmcoKS5vcHRpb25hbCgpLFxuICAgIGRpc3BsYXlOYW1lOiB6LnN0cmluZygpLm9wdGlvbmFsKCksXG4gICAgc2VsZjogei5ib29sZWFuKCkub3B0aW9uYWwoKVxuICB9KS5vcHRpb25hbCgpLFxuICBvcmdhbml6ZXI6IHoub2JqZWN0KHtcbiAgICBpZDogei5zdHJpbmcoKS5vcHRpb25hbCgpLFxuICAgIGVtYWlsOiB6LnN0cmluZygpLm9wdGlvbmFsKCksXG4gICAgZGlzcGxheU5hbWU6IHouc3RyaW5nKCkub3B0aW9uYWwoKSxcbiAgICBzZWxmOiB6LmJvb2xlYW4oKS5vcHRpb25hbCgpXG4gIH0pLm9wdGlvbmFsKClcbn0pO1xuY29uc3QgYWN0aW9uID0ge1xuICB0eXBlOiBcImFjdGlvblwiLFxuICBkZXNjcmlwdGlvbjogJ0dldCBhbiBldmVudCBieSBJRCBmcm9tIEdvb2dsZSBDYWxlbmRhcicsXG4gIHZlcnNpb246ICcxLjAuMCcsXG4gIGVuZHBvaW50OiB7XG4gICAgbWV0aG9kOiAnR0VUJyxcbiAgICBwYXRoOiAnL2FjdGlvbnMvZ2V0LWV2ZW50JyxcbiAgICBncm91cDogJ0V2ZW50cydcbiAgfSxcbiAgaW5wdXQ6IElucHV0U2NoZW1hLFxuICBvdXRwdXQ6IE91dHB1dFNjaGVtYSxcbiAgc2NvcGVzOiBbJ2h0dHBzOi8vd3d3Lmdvb2dsZWFwaXMuY29tL2F1dGgvY2FsZW5kYXIucmVhZG9ubHknXSxcbiAgZXhlYzogYXN5bmMgKG5hbmdvLCBpbnB1dCk6IFByb21pc2U8ei5pbmZlcjx0eXBlb2YgT3V0cHV0U2NoZW1hPj4gPT4ge1xuICAgIC8vIGh0dHBzOi8vZGV2ZWxvcGVycy5nb29nbGUuY29tL2NhbGVuZGFyL2FwaS92My9yZWZlcmVuY2UvZXZlbnRzL2dldFxuICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgbmFuZ28uZ2V0KHtcbiAgICAgIGVuZHBvaW50OiBgL2NhbGVuZGFyL3YzL2NhbGVuZGFycy8ke2lucHV0LmNhbGVuZGFySWR9L2V2ZW50cy8ke2lucHV0LmV2ZW50SWR9YCxcbiAgICAgIHJldHJpZXM6IDNcbiAgICB9KTtcbiAgICBjb25zdCBldmVudCA9IHJlc3BvbnNlLmRhdGE7XG4gICAgcmV0dXJuIHtcbiAgICAgIGlkOiBldmVudC5pZCxcbiAgICAgIHN1bW1hcnk6IGV2ZW50LnN1bW1hcnkgPz8gdW5kZWZpbmVkLFxuICAgICAgZGVzY3JpcHRpb246IGV2ZW50LmRlc2NyaXB0aW9uID8/IHVuZGVmaW5lZCxcbiAgICAgIGxvY2F0aW9uOiBldmVudC5sb2NhdGlvbiA/PyB1bmRlZmluZWQsXG4gICAgICBzdGF0dXM6IGV2ZW50LnN0YXR1cyA/PyB1bmRlZmluZWQsXG4gICAgICBodG1sTGluazogZXZlbnQuaHRtbExpbmsgPz8gdW5kZWZpbmVkLFxuICAgICAgY3JlYXRlZEF0OiBldmVudC5jcmVhdGVkID8/IHVuZGVmaW5lZCxcbiAgICAgIHVwZGF0ZWRBdDogZXZlbnQudXBkYXRlZCA/PyB1bmRlZmluZWQsXG4gICAgICBzdGFydDogZXZlbnQuc3RhcnQgPyB7XG4gICAgICAgIGRhdGU6IGV2ZW50LnN0YXJ0LmRhdGUgPz8gdW5kZWZpbmVkLFxuICAgICAgICBkYXRlVGltZTogZXZlbnQuc3RhcnQuZGF0ZVRpbWUgPz8gdW5kZWZpbmVkLFxuICAgICAgICB0aW1lWm9uZTogZXZlbnQuc3RhcnQudGltZVpvbmUgPz8gdW5kZWZpbmVkXG4gICAgICB9IDogdW5kZWZpbmVkLFxuICAgICAgZW5kOiBldmVudC5lbmQgPyB7XG4gICAgICAgIGRhdGU6IGV2ZW50LmVuZC5kYXRlID8/IHVuZGVmaW5lZCxcbiAgICAgICAgZGF0ZVRpbWU6IGV2ZW50LmVuZC5kYXRlVGltZSA/PyB1bmRlZmluZWQsXG4gICAgICAgIHRpbWVab25lOiBldmVudC5lbmQudGltZVpvbmUgPz8gdW5kZWZpbmVkXG4gICAgICB9IDogdW5kZWZpbmVkLFxuICAgICAgY3JlYXRvcjogZXZlbnQuY3JlYXRvciA/IHtcbiAgICAgICAgaWQ6IGV2ZW50LmNyZWF0b3IuaWQgPz8gdW5kZWZpbmVkLFxuICAgICAgICBlbWFpbDogZXZlbnQuY3JlYXRvci5lbWFpbCA/PyB1bmRlZmluZWQsXG4gICAgICAgIGRpc3BsYXlOYW1lOiBldmVudC5jcmVhdG9yLmRpc3BsYXlOYW1lID8/IHVuZGVmaW5lZCxcbiAgICAgICAgc2VsZjogZXZlbnQuY3JlYXRvci5zZWxmID8/IGZhbHNlXG4gICAgICB9IDogdW5kZWZpbmVkLFxuICAgICAgb3JnYW5pemVyOiBldmVudC5vcmdhbml6ZXIgPyB7XG4gICAgICAgIGlkOiBldmVudC5vcmdhbml6ZXIuaWQgPz8gdW5kZWZpbmVkLFxuICAgICAgICBlbWFpbDogZXZlbnQub3JnYW5pemVyLmVtYWlsID8/IHVuZGVmaW5lZCxcbiAgICAgICAgZGlzcGxheU5hbWU6IGV2ZW50Lm9yZ2FuaXplci5kaXNwbGF5TmFtZSA/PyB1bmRlZmluZWQsXG4gICAgICAgIHNlbGY6IGV2ZW50Lm9yZ2FuaXplci5zZWxmID8/IGZhbHNlXG4gICAgICB9IDogdW5kZWZpbmVkXG4gICAgfTtcbiAgfVxufTtcbmV4cG9ydCB0eXBlIE5hbmdvQWN0aW9uTG9jYWwgPSBQYXJhbWV0ZXJzPCh0eXBlb2YgYWN0aW9uKVsnZXhlYyddPlswXTtcbmV4cG9ydCBkZWZhdWx0IGFjdGlvbjsiXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxpQkFBa0I7QUFFbEIsSUFBTSxjQUFjLGFBQUUsT0FBTztBQUFBLEVBQzNCLFlBQVksYUFBRSxPQUFPLEVBQUUsU0FBUyw4RkFBOEY7QUFBQSxFQUM5SCxTQUFTLGFBQUUsT0FBTyxFQUFFLFNBQVMsbUJBQW1CO0FBQ2xELENBQUM7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
