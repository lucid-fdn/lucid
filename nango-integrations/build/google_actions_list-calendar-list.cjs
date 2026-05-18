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

// google/actions/list-calendar-list.ts
var list_calendar_list_exports = {};
__export(list_calendar_list_exports, {
  default: () => list_calendar_list_default
});
module.exports = __toCommonJS(list_calendar_list_exports);
var import_zod = require("zod");
var InputSchema = import_zod.z.object({
  cursor: import_zod.z.string().optional().describe("Page token for pagination. Omit for first page."),
  maxResults: import_zod.z.number().optional().describe("Maximum number of calendars to return. Default: 100.")
});
var CalendarSchema = import_zod.z.object({
  id: import_zod.z.string(),
  summary: import_zod.z.string(),
  description: import_zod.z.string().optional(),
  location: import_zod.z.string().optional(),
  timeZone: import_zod.z.string().optional(),
  accessRole: import_zod.z.string().optional(),
  primary: import_zod.z.boolean().optional(),
  selected: import_zod.z.boolean().optional(),
  backgroundColor: import_zod.z.string().optional(),
  foregroundColor: import_zod.z.string().optional(),
  hidden: import_zod.z.boolean().optional(),
  deleted: import_zod.z.boolean().optional()
});
var OutputSchema = import_zod.z.object({
  calendars: import_zod.z.array(CalendarSchema),
  nextPageToken: import_zod.z.string().optional()
});
var action = {
  type: "action",
  description: "List calendars in the user's calendar list",
  version: "1.0.0",
  endpoint: {
    method: "GET",
    path: "/actions/list-calendar-list",
    group: "Calendars"
  },
  input: InputSchema,
  output: OutputSchema,
  scopes: ["https://www.googleapis.com/auth/calendar.readonly"],
  exec: async (nango, input) => {
    const response = await nango.get({
      endpoint: "/calendar/v3/users/me/calendarList",
      params: {
        ...input.cursor && {
          pageToken: input.cursor
        },
        ...input.maxResults && {
          maxResults: input.maxResults.toString()
        }
      },
      retries: 3
    });
    const calendars = response.data.items || [];
    const nextPageToken = response.data.nextPageToken || void 0;
    return {
      calendars: calendars.map((cal) => ({
        id: cal.id,
        summary: cal.summary,
        description: cal.description ?? void 0,
        location: cal.location ?? void 0,
        timeZone: cal.timeZone ?? void 0,
        accessRole: cal.accessRole ?? void 0,
        primary: cal.primary ?? false,
        selected: cal.selected ?? false,
        backgroundColor: cal.backgroundColor ?? void 0,
        foregroundColor: cal.foregroundColor ?? void 0,
        hidden: cal.hidden ?? false,
        deleted: cal.deleted ?? false
      })),
      nextPageToken
    };
  }
};
var list_calendar_list_default = action;
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiZ29vZ2xlL2FjdGlvbnMvbGlzdC1jYWxlbmRhci1saXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyJpbXBvcnQgeyB6IH0gZnJvbSAnem9kJztcbmltcG9ydCB7IGNyZWF0ZUFjdGlvbiB9IGZyb20gJ25hbmdvJztcbmNvbnN0IElucHV0U2NoZW1hID0gei5vYmplY3Qoe1xuICBjdXJzb3I6IHouc3RyaW5nKCkub3B0aW9uYWwoKS5kZXNjcmliZSgnUGFnZSB0b2tlbiBmb3IgcGFnaW5hdGlvbi4gT21pdCBmb3IgZmlyc3QgcGFnZS4nKSxcbiAgbWF4UmVzdWx0czogei5udW1iZXIoKS5vcHRpb25hbCgpLmRlc2NyaWJlKCdNYXhpbXVtIG51bWJlciBvZiBjYWxlbmRhcnMgdG8gcmV0dXJuLiBEZWZhdWx0OiAxMDAuJylcbn0pO1xuY29uc3QgQ2FsZW5kYXJTY2hlbWEgPSB6Lm9iamVjdCh7XG4gIGlkOiB6LnN0cmluZygpLFxuICBzdW1tYXJ5OiB6LnN0cmluZygpLFxuICBkZXNjcmlwdGlvbjogei5zdHJpbmcoKS5vcHRpb25hbCgpLFxuICBsb2NhdGlvbjogei5zdHJpbmcoKS5vcHRpb25hbCgpLFxuICB0aW1lWm9uZTogei5zdHJpbmcoKS5vcHRpb25hbCgpLFxuICBhY2Nlc3NSb2xlOiB6LnN0cmluZygpLm9wdGlvbmFsKCksXG4gIHByaW1hcnk6IHouYm9vbGVhbigpLm9wdGlvbmFsKCksXG4gIHNlbGVjdGVkOiB6LmJvb2xlYW4oKS5vcHRpb25hbCgpLFxuICBiYWNrZ3JvdW5kQ29sb3I6IHouc3RyaW5nKCkub3B0aW9uYWwoKSxcbiAgZm9yZWdyb3VuZENvbG9yOiB6LnN0cmluZygpLm9wdGlvbmFsKCksXG4gIGhpZGRlbjogei5ib29sZWFuKCkub3B0aW9uYWwoKSxcbiAgZGVsZXRlZDogei5ib29sZWFuKCkub3B0aW9uYWwoKVxufSk7XG5jb25zdCBPdXRwdXRTY2hlbWEgPSB6Lm9iamVjdCh7XG4gIGNhbGVuZGFyczogei5hcnJheShDYWxlbmRhclNjaGVtYSksXG4gIG5leHRQYWdlVG9rZW46IHouc3RyaW5nKCkub3B0aW9uYWwoKVxufSk7XG5jb25zdCBhY3Rpb24gPSB7XG4gIHR5cGU6IFwiYWN0aW9uXCIsXG4gIGRlc2NyaXB0aW9uOiBcIkxpc3QgY2FsZW5kYXJzIGluIHRoZSB1c2VyJ3MgY2FsZW5kYXIgbGlzdFwiLFxuICB2ZXJzaW9uOiAnMS4wLjAnLFxuICBlbmRwb2ludDoge1xuICAgIG1ldGhvZDogJ0dFVCcsXG4gICAgcGF0aDogJy9hY3Rpb25zL2xpc3QtY2FsZW5kYXItbGlzdCcsXG4gICAgZ3JvdXA6ICdDYWxlbmRhcnMnXG4gIH0sXG4gIGlucHV0OiBJbnB1dFNjaGVtYSxcbiAgb3V0cHV0OiBPdXRwdXRTY2hlbWEsXG4gIHNjb3BlczogWydodHRwczovL3d3dy5nb29nbGVhcGlzLmNvbS9hdXRoL2NhbGVuZGFyLnJlYWRvbmx5J10sXG4gIGV4ZWM6IGFzeW5jIChuYW5nbywgaW5wdXQpOiBQcm9taXNlPHouaW5mZXI8dHlwZW9mIE91dHB1dFNjaGVtYT4+ID0+IHtcbiAgICAvLyBodHRwczovL2RldmVsb3BlcnMuZ29vZ2xlLmNvbS93b3Jrc3BhY2UvY2FsZW5kYXIvYXBpL3YzL3JlZmVyZW5jZS9jYWxlbmRhckxpc3QvbGlzdFxuICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgbmFuZ28uZ2V0KHtcbiAgICAgIGVuZHBvaW50OiAnL2NhbGVuZGFyL3YzL3VzZXJzL21lL2NhbGVuZGFyTGlzdCcsXG4gICAgICBwYXJhbXM6IHtcbiAgICAgICAgLi4uKGlucHV0LmN1cnNvciAmJiB7XG4gICAgICAgICAgcGFnZVRva2VuOiBpbnB1dC5jdXJzb3JcbiAgICAgICAgfSksXG4gICAgICAgIC4uLihpbnB1dC5tYXhSZXN1bHRzICYmIHtcbiAgICAgICAgICBtYXhSZXN1bHRzOiBpbnB1dC5tYXhSZXN1bHRzLnRvU3RyaW5nKClcbiAgICAgICAgfSlcbiAgICAgIH0sXG4gICAgICByZXRyaWVzOiAzXG4gICAgfSk7XG4gICAgY29uc3QgY2FsZW5kYXJzID0gcmVzcG9uc2UuZGF0YS5pdGVtcyB8fCBbXTtcbiAgICBjb25zdCBuZXh0UGFnZVRva2VuID0gcmVzcG9uc2UuZGF0YS5uZXh0UGFnZVRva2VuIHx8IHVuZGVmaW5lZDtcbiAgICByZXR1cm4ge1xuICAgICAgY2FsZW5kYXJzOiBjYWxlbmRhcnMubWFwKChjYWw6IGFueSkgPT4gKHtcbiAgICAgICAgaWQ6IGNhbC5pZCxcbiAgICAgICAgc3VtbWFyeTogY2FsLnN1bW1hcnksXG4gICAgICAgIGRlc2NyaXB0aW9uOiBjYWwuZGVzY3JpcHRpb24gPz8gdW5kZWZpbmVkLFxuICAgICAgICBsb2NhdGlvbjogY2FsLmxvY2F0aW9uID8/IHVuZGVmaW5lZCxcbiAgICAgICAgdGltZVpvbmU6IGNhbC50aW1lWm9uZSA/PyB1bmRlZmluZWQsXG4gICAgICAgIGFjY2Vzc1JvbGU6IGNhbC5hY2Nlc3NSb2xlID8/IHVuZGVmaW5lZCxcbiAgICAgICAgcHJpbWFyeTogY2FsLnByaW1hcnkgPz8gZmFsc2UsXG4gICAgICAgIHNlbGVjdGVkOiBjYWwuc2VsZWN0ZWQgPz8gZmFsc2UsXG4gICAgICAgIGJhY2tncm91bmRDb2xvcjogY2FsLmJhY2tncm91bmRDb2xvciA/PyB1bmRlZmluZWQsXG4gICAgICAgIGZvcmVncm91bmRDb2xvcjogY2FsLmZvcmVncm91bmRDb2xvciA/PyB1bmRlZmluZWQsXG4gICAgICAgIGhpZGRlbjogY2FsLmhpZGRlbiA/PyBmYWxzZSxcbiAgICAgICAgZGVsZXRlZDogY2FsLmRlbGV0ZWQgPz8gZmFsc2VcbiAgICAgIH0pKSxcbiAgICAgIG5leHRQYWdlVG9rZW46IG5leHRQYWdlVG9rZW5cbiAgICB9O1xuICB9XG59O1xuZXhwb3J0IHR5cGUgTmFuZ29BY3Rpb25Mb2NhbCA9IFBhcmFtZXRlcnM8KHR5cGVvZiBhY3Rpb24pWydleGVjJ10+WzBdO1xuZXhwb3J0IGRlZmF1bHQgYWN0aW9uOyJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7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
