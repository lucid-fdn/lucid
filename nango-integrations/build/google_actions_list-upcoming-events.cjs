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

// google/actions/list-upcoming-events.ts
var list_upcoming_events_exports = {};
__export(list_upcoming_events_exports, {
  default: () => list_upcoming_events_default
});
module.exports = __toCommonJS(list_upcoming_events_exports);
var import_zod = require("zod");
var InputSchema = import_zod.z.object({
  calendarId: import_zod.z.string().optional().describe('Calendar ID. Use "primary" for the main calendar or a specific calendar ID. Example: "primary"'),
  cursor: import_zod.z.string().optional().describe("Pagination token from previous response. Omit for first page."),
  limit: import_zod.z.number().min(1).max(2500).optional().describe("Maximum number of events to return per page (1-2500). Default: 250"),
  timeMin: import_zod.z.string().optional().describe('RFC3339 timestamp to fetch events from (e.g., "2026-03-12T00:00:00Z"). Defaults to current time if not provided.')
});
var EventSchema = import_zod.z.object({
  id: import_zod.z.string(),
  summary: import_zod.z.string().optional().describe("Event title"),
  description: import_zod.z.string().optional().describe("Event description"),
  location: import_zod.z.string().optional().describe("Event location"),
  start: import_zod.z.object({
    dateTime: import_zod.z.string().optional(),
    date: import_zod.z.string().optional(),
    timeZone: import_zod.z.string().optional()
  }).describe("Start time"),
  end: import_zod.z.object({
    dateTime: import_zod.z.string().optional(),
    date: import_zod.z.string().optional(),
    timeZone: import_zod.z.string().optional()
  }).describe("End time"),
  status: import_zod.z.string().describe("Event status (confirmed, tentative, cancelled)"),
  htmlLink: import_zod.z.string().optional().describe("Link to event in Google Calendar"),
  created: import_zod.z.string().optional().describe("When the event was created"),
  updated: import_zod.z.string().optional().describe("When the event was last updated"),
  creator: import_zod.z.object({
    email: import_zod.z.string().optional(),
    displayName: import_zod.z.string().optional()
  }).optional(),
  organizer: import_zod.z.object({
    email: import_zod.z.string().optional(),
    displayName: import_zod.z.string().optional()
  }).optional(),
  attendees: import_zod.z.array(import_zod.z.object({
    email: import_zod.z.string().optional(),
    displayName: import_zod.z.string().optional(),
    responseStatus: import_zod.z.string().optional()
  })).optional()
});
var OutputSchema = import_zod.z.object({
  events: import_zod.z.array(EventSchema).describe("List of upcoming events"),
  nextPageToken: import_zod.z.string().optional().describe("Token for fetching the next page. Omitted if no more pages.")
});
var action = {
  type: "action",
  description: "List upcoming events from now, ordered by start time",
  version: "1.0.0",
  endpoint: {
    method: "GET",
    path: "/actions/list-upcoming-events",
    group: "Events"
  },
  input: InputSchema,
  output: OutputSchema,
  scopes: ["https://www.googleapis.com/auth/calendar.readonly"],
  exec: async (nango, input) => {
    const calendarId = input.calendarId || "primary";
    const timeMin = input.timeMin || (/* @__PURE__ */ new Date()).toISOString();
    const response = await nango.get({
      endpoint: `/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
      params: {
        timeMin,
        orderBy: "startTime",
        singleEvents: "true",
        maxResults: input.limit?.toString() || "250",
        ...input.cursor && {
          pageToken: input.cursor
        }
      },
      retries: 3
    });
    const events = response.data.items || [];
    return {
      events: events.map((event) => ({
        id: event.id,
        summary: event.summary ?? void 0,
        description: event.description ?? void 0,
        location: event.location ?? void 0,
        start: {
          dateTime: event.start?.dateTime ?? void 0,
          date: event.start?.date ?? void 0,
          timeZone: event.start?.timeZone ?? void 0
        },
        end: {
          dateTime: event.end?.dateTime ?? void 0,
          date: event.end?.date ?? void 0,
          timeZone: event.end?.timeZone ?? void 0
        },
        status: event.status,
        htmlLink: event.htmlLink ?? void 0,
        created: event.created ?? void 0,
        updated: event.updated ?? void 0,
        creator: event.creator ? {
          email: event.creator.email ?? void 0,
          displayName: event.creator.displayName ?? void 0
        } : void 0,
        organizer: event.organizer ? {
          email: event.organizer.email ?? void 0,
          displayName: event.organizer.displayName ?? void 0
        } : void 0,
        attendees: event.attendees?.map((attendee) => ({
          email: attendee.email ?? void 0,
          displayName: attendee.displayName ?? void 0,
          responseStatus: attendee.responseStatus ?? void 0
        }))
      })),
      nextPageToken: response.data.nextPageToken || void 0
    };
  }
};
var list_upcoming_events_default = action;
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiZ29vZ2xlL2FjdGlvbnMvbGlzdC11cGNvbWluZy1ldmVudHMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImltcG9ydCB7IHogfSBmcm9tICd6b2QnO1xuaW1wb3J0IHsgY3JlYXRlQWN0aW9uIH0gZnJvbSAnbmFuZ28nO1xuY29uc3QgSW5wdXRTY2hlbWEgPSB6Lm9iamVjdCh7XG4gIGNhbGVuZGFySWQ6IHouc3RyaW5nKCkub3B0aW9uYWwoKS5kZXNjcmliZSgnQ2FsZW5kYXIgSUQuIFVzZSBcInByaW1hcnlcIiBmb3IgdGhlIG1haW4gY2FsZW5kYXIgb3IgYSBzcGVjaWZpYyBjYWxlbmRhciBJRC4gRXhhbXBsZTogXCJwcmltYXJ5XCInKSxcbiAgY3Vyc29yOiB6LnN0cmluZygpLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ1BhZ2luYXRpb24gdG9rZW4gZnJvbSBwcmV2aW91cyByZXNwb25zZS4gT21pdCBmb3IgZmlyc3QgcGFnZS4nKSxcbiAgbGltaXQ6IHoubnVtYmVyKCkubWluKDEpLm1heCgyNTAwKS5vcHRpb25hbCgpLmRlc2NyaWJlKCdNYXhpbXVtIG51bWJlciBvZiBldmVudHMgdG8gcmV0dXJuIHBlciBwYWdlICgxLTI1MDApLiBEZWZhdWx0OiAyNTAnKSxcbiAgdGltZU1pbjogei5zdHJpbmcoKS5vcHRpb25hbCgpLmRlc2NyaWJlKCdSRkMzMzM5IHRpbWVzdGFtcCB0byBmZXRjaCBldmVudHMgZnJvbSAoZS5nLiwgXCIyMDI2LTAzLTEyVDAwOjAwOjAwWlwiKS4gRGVmYXVsdHMgdG8gY3VycmVudCB0aW1lIGlmIG5vdCBwcm92aWRlZC4nKVxufSk7XG5jb25zdCBFdmVudFNjaGVtYSA9IHoub2JqZWN0KHtcbiAgaWQ6IHouc3RyaW5nKCksXG4gIHN1bW1hcnk6IHouc3RyaW5nKCkub3B0aW9uYWwoKS5kZXNjcmliZSgnRXZlbnQgdGl0bGUnKSxcbiAgZGVzY3JpcHRpb246IHouc3RyaW5nKCkub3B0aW9uYWwoKS5kZXNjcmliZSgnRXZlbnQgZGVzY3JpcHRpb24nKSxcbiAgbG9jYXRpb246IHouc3RyaW5nKCkub3B0aW9uYWwoKS5kZXNjcmliZSgnRXZlbnQgbG9jYXRpb24nKSxcbiAgc3RhcnQ6IHoub2JqZWN0KHtcbiAgICBkYXRlVGltZTogei5zdHJpbmcoKS5vcHRpb25hbCgpLFxuICAgIGRhdGU6IHouc3RyaW5nKCkub3B0aW9uYWwoKSxcbiAgICB0aW1lWm9uZTogei5zdHJpbmcoKS5vcHRpb25hbCgpXG4gIH0pLmRlc2NyaWJlKCdTdGFydCB0aW1lJyksXG4gIGVuZDogei5vYmplY3Qoe1xuICAgIGRhdGVUaW1lOiB6LnN0cmluZygpLm9wdGlvbmFsKCksXG4gICAgZGF0ZTogei5zdHJpbmcoKS5vcHRpb25hbCgpLFxuICAgIHRpbWVab25lOiB6LnN0cmluZygpLm9wdGlvbmFsKClcbiAgfSkuZGVzY3JpYmUoJ0VuZCB0aW1lJyksXG4gIHN0YXR1czogei5zdHJpbmcoKS5kZXNjcmliZSgnRXZlbnQgc3RhdHVzIChjb25maXJtZWQsIHRlbnRhdGl2ZSwgY2FuY2VsbGVkKScpLFxuICBodG1sTGluazogei5zdHJpbmcoKS5vcHRpb25hbCgpLmRlc2NyaWJlKCdMaW5rIHRvIGV2ZW50IGluIEdvb2dsZSBDYWxlbmRhcicpLFxuICBjcmVhdGVkOiB6LnN0cmluZygpLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ1doZW4gdGhlIGV2ZW50IHdhcyBjcmVhdGVkJyksXG4gIHVwZGF0ZWQ6IHouc3RyaW5nKCkub3B0aW9uYWwoKS5kZXNjcmliZSgnV2hlbiB0aGUgZXZlbnQgd2FzIGxhc3QgdXBkYXRlZCcpLFxuICBjcmVhdG9yOiB6Lm9iamVjdCh7XG4gICAgZW1haWw6IHouc3RyaW5nKCkub3B0aW9uYWwoKSxcbiAgICBkaXNwbGF5TmFtZTogei5zdHJpbmcoKS5vcHRpb25hbCgpXG4gIH0pLm9wdGlvbmFsKCksXG4gIG9yZ2FuaXplcjogei5vYmplY3Qoe1xuICAgIGVtYWlsOiB6LnN0cmluZygpLm9wdGlvbmFsKCksXG4gICAgZGlzcGxheU5hbWU6IHouc3RyaW5nKCkub3B0aW9uYWwoKVxuICB9KS5vcHRpb25hbCgpLFxuICBhdHRlbmRlZXM6IHouYXJyYXkoei5vYmplY3Qoe1xuICAgIGVtYWlsOiB6LnN0cmluZygpLm9wdGlvbmFsKCksXG4gICAgZGlzcGxheU5hbWU6IHouc3RyaW5nKCkub3B0aW9uYWwoKSxcbiAgICByZXNwb25zZVN0YXR1czogei5zdHJpbmcoKS5vcHRpb25hbCgpXG4gIH0pKS5vcHRpb25hbCgpXG59KTtcbmNvbnN0IE91dHB1dFNjaGVtYSA9IHoub2JqZWN0KHtcbiAgZXZlbnRzOiB6LmFycmF5KEV2ZW50U2NoZW1hKS5kZXNjcmliZSgnTGlzdCBvZiB1cGNvbWluZyBldmVudHMnKSxcbiAgbmV4dFBhZ2VUb2tlbjogei5zdHJpbmcoKS5vcHRpb25hbCgpLmRlc2NyaWJlKCdUb2tlbiBmb3IgZmV0Y2hpbmcgdGhlIG5leHQgcGFnZS4gT21pdHRlZCBpZiBubyBtb3JlIHBhZ2VzLicpXG59KTtcbmNvbnN0IGFjdGlvbiA9IHtcbiAgdHlwZTogXCJhY3Rpb25cIixcbiAgZGVzY3JpcHRpb246ICdMaXN0IHVwY29taW5nIGV2ZW50cyBmcm9tIG5vdywgb3JkZXJlZCBieSBzdGFydCB0aW1lJyxcbiAgdmVyc2lvbjogJzEuMC4wJyxcbiAgZW5kcG9pbnQ6IHtcbiAgICBtZXRob2Q6ICdHRVQnLFxuICAgIHBhdGg6ICcvYWN0aW9ucy9saXN0LXVwY29taW5nLWV2ZW50cycsXG4gICAgZ3JvdXA6ICdFdmVudHMnXG4gIH0sXG4gIGlucHV0OiBJbnB1dFNjaGVtYSxcbiAgb3V0cHV0OiBPdXRwdXRTY2hlbWEsXG4gIHNjb3BlczogWydodHRwczovL3d3dy5nb29nbGVhcGlzLmNvbS9hdXRoL2NhbGVuZGFyLnJlYWRvbmx5J10sXG4gIGV4ZWM6IGFzeW5jIChuYW5nbywgaW5wdXQpOiBQcm9taXNlPHouaW5mZXI8dHlwZW9mIE91dHB1dFNjaGVtYT4+ID0+IHtcbiAgICBjb25zdCBjYWxlbmRhcklkID0gaW5wdXQuY2FsZW5kYXJJZCB8fCAncHJpbWFyeSc7XG4gICAgY29uc3QgdGltZU1pbiA9IGlucHV0LnRpbWVNaW4gfHwgbmV3IERhdGUoKS50b0lTT1N0cmluZygpO1xuXG4gICAgLy8gaHR0cHM6Ly9kZXZlbG9wZXJzLmdvb2dsZS5jb20vY2FsZW5kYXIvYXBpL3YzL3JlZmVyZW5jZS9ldmVudHMvbGlzdFxuICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgbmFuZ28uZ2V0KHtcbiAgICAgIGVuZHBvaW50OiBgL2NhbGVuZGFyL3YzL2NhbGVuZGFycy8ke2VuY29kZVVSSUNvbXBvbmVudChjYWxlbmRhcklkKX0vZXZlbnRzYCxcbiAgICAgIHBhcmFtczoge1xuICAgICAgICB0aW1lTWluOiB0aW1lTWluLFxuICAgICAgICBvcmRlckJ5OiAnc3RhcnRUaW1lJyxcbiAgICAgICAgc2luZ2xlRXZlbnRzOiAndHJ1ZScsXG4gICAgICAgIG1heFJlc3VsdHM6IGlucHV0LmxpbWl0Py50b1N0cmluZygpIHx8ICcyNTAnLFxuICAgICAgICAuLi4oaW5wdXQuY3Vyc29yICYmIHtcbiAgICAgICAgICBwYWdlVG9rZW46IGlucHV0LmN1cnNvclxuICAgICAgICB9KVxuICAgICAgfSxcbiAgICAgIHJldHJpZXM6IDNcbiAgICB9KTtcbiAgICBjb25zdCBldmVudHMgPSByZXNwb25zZS5kYXRhLml0ZW1zIHx8IFtdO1xuICAgIHJldHVybiB7XG4gICAgICBldmVudHM6IGV2ZW50cy5tYXAoKGV2ZW50OiBhbnkpID0+ICh7XG4gICAgICAgIGlkOiBldmVudC5pZCxcbiAgICAgICAgc3VtbWFyeTogZXZlbnQuc3VtbWFyeSA/PyB1bmRlZmluZWQsXG4gICAgICAgIGRlc2NyaXB0aW9uOiBldmVudC5kZXNjcmlwdGlvbiA/PyB1bmRlZmluZWQsXG4gICAgICAgIGxvY2F0aW9uOiBldmVudC5sb2NhdGlvbiA/PyB1bmRlZmluZWQsXG4gICAgICAgIHN0YXJ0OiB7XG4gICAgICAgICAgZGF0ZVRpbWU6IGV2ZW50LnN0YXJ0Py5kYXRlVGltZSA/PyB1bmRlZmluZWQsXG4gICAgICAgICAgZGF0ZTogZXZlbnQuc3RhcnQ/LmRhdGUgPz8gdW5kZWZpbmVkLFxuICAgICAgICAgIHRpbWVab25lOiBldmVudC5zdGFydD8udGltZVpvbmUgPz8gdW5kZWZpbmVkXG4gICAgICAgIH0sXG4gICAgICAgIGVuZDoge1xuICAgICAgICAgIGRhdGVUaW1lOiBldmVudC5lbmQ/LmRhdGVUaW1lID8/IHVuZGVmaW5lZCxcbiAgICAgICAgICBkYXRlOiBldmVudC5lbmQ/LmRhdGUgPz8gdW5kZWZpbmVkLFxuICAgICAgICAgIHRpbWVab25lOiBldmVudC5lbmQ/LnRpbWVab25lID8/IHVuZGVmaW5lZFxuICAgICAgICB9LFxuICAgICAgICBzdGF0dXM6IGV2ZW50LnN0YXR1cyxcbiAgICAgICAgaHRtbExpbms6IGV2ZW50Lmh0bWxMaW5rID8/IHVuZGVmaW5lZCxcbiAgICAgICAgY3JlYXRlZDogZXZlbnQuY3JlYXRlZCA/PyB1bmRlZmluZWQsXG4gICAgICAgIHVwZGF0ZWQ6IGV2ZW50LnVwZGF0ZWQgPz8gdW5kZWZpbmVkLFxuICAgICAgICBjcmVhdG9yOiBldmVudC5jcmVhdG9yID8ge1xuICAgICAgICAgIGVtYWlsOiBldmVudC5jcmVhdG9yLmVtYWlsID8/IHVuZGVmaW5lZCxcbiAgICAgICAgICBkaXNwbGF5TmFtZTogZXZlbnQuY3JlYXRvci5kaXNwbGF5TmFtZSA/PyB1bmRlZmluZWRcbiAgICAgICAgfSA6IHVuZGVmaW5lZCxcbiAgICAgICAgb3JnYW5pemVyOiBldmVudC5vcmdhbml6ZXIgPyB7XG4gICAgICAgICAgZW1haWw6IGV2ZW50Lm9yZ2FuaXplci5lbWFpbCA/PyB1bmRlZmluZWQsXG4gICAgICAgICAgZGlzcGxheU5hbWU6IGV2ZW50Lm9yZ2FuaXplci5kaXNwbGF5TmFtZSA/PyB1bmRlZmluZWRcbiAgICAgICAgfSA6IHVuZGVmaW5lZCxcbiAgICAgICAgYXR0ZW5kZWVzOiBldmVudC5hdHRlbmRlZXM/Lm1hcCgoYXR0ZW5kZWU6IGFueSkgPT4gKHtcbiAgICAgICAgICBlbWFpbDogYXR0ZW5kZWUuZW1haWwgPz8gdW5kZWZpbmVkLFxuICAgICAgICAgIGRpc3BsYXlOYW1lOiBhdHRlbmRlZS5kaXNwbGF5TmFtZSA/PyB1bmRlZmluZWQsXG4gICAgICAgICAgcmVzcG9uc2VTdGF0dXM6IGF0dGVuZGVlLnJlc3BvbnNlU3RhdHVzID8/IHVuZGVmaW5lZFxuICAgICAgICB9KSlcbiAgICAgIH0pKSxcbiAgICAgIG5leHRQYWdlVG9rZW46IHJlc3BvbnNlLmRhdGEubmV4dFBhZ2VUb2tlbiB8fCB1bmRlZmluZWRcbiAgICB9O1xuICB9XG59O1xuZXhwb3J0IHR5cGUgTmFuZ29BY3Rpb25Mb2NhbCA9IFBhcmFtZXRlcnM8KHR5cGVvZiBhY3Rpb24pWydleGVjJ10+WzBdO1xuZXhwb3J0IGRlZmF1bHQgYWN0aW9uOyJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLGlCQUFrQjtBQUVsQixJQUFNLGNBQWMsYUFBRSxPQUFPO0FBQUEsRUFDM0IsWUFBWSxhQUFFLE9BQU8sRUFBRSxTQUFTLEVBQUUsU0FBUyxnR0FBZ0c7QUFBQSxFQUMzSSxRQUFRLGFBQUUsT0FBTyxFQUFFLFNBQVMsRUFBRSxTQUFTLCtEQUErRDtBQUFBLEVBQ3RHLE9BQU8sYUFBRSxPQUFPLEVBQUUsSUFBSSxDQUFDLEVBQUUsSUFBSSxJQUFJLEVBQUUsU0FBUyxFQUFFLFNBQVMsb0VBQW9FO0FBQUEsRUFDM0gsU0FBUyxhQUFFLE9BQU8sRUFBRSxTQUFTLEVBQUUsU0FBUyxrSEFBa0g7QUFDNUosQ0FBQztBQUNELElBQU0sY0FBYyxhQUFFLE9BQU87QUFBQSxFQUMzQixJQUFJLGFBQUUsT0FBTztBQUFBLEVBQ2IsU0FBUyxhQUFFLE9BQU8sRUFBRSxTQUFTLEVBQUUsU0FBUyxhQUFhO0FBQUEsRUFDckQsYUFBYSxhQUFFLE9BQU8sRUFBRSxTQUFTLEVBQUUsU0FBUyxtQkFBbUI7QUFBQSxF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
