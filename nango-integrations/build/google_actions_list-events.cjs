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

// google/actions/list-events.ts
var list_events_exports = {};
__export(list_events_exports, {
  default: () => list_events_default
});
module.exports = __toCommonJS(list_events_exports);
var import_zod = require("zod");
var InputSchema = import_zod.z.object({
  calendarId: import_zod.z.string().optional().describe('Calendar identifier. Use "primary" for the primary calendar or a calendar ID from calendarList.list.'),
  cursor: import_zod.z.string().optional().describe("Pagination cursor (nextPageToken from previous response). Omit for first page."),
  maxResults: import_zod.z.number().optional().describe("Maximum number of events to return per page (1-2500, default 250)."),
  timeMin: import_zod.z.string().optional().describe("Lower bound (exclusive) for an event's end time filter (RFC3339 timestamp)."),
  timeMax: import_zod.z.string().optional().describe("Upper bound (exclusive) for an event's start time filter (RFC3339 timestamp)."),
  q: import_zod.z.string().optional().describe("Free text search terms to find matching events."),
  singleEvents: import_zod.z.boolean().optional().describe("Whether to expand recurring events into single instances."),
  showDeleted: import_zod.z.boolean().optional().describe("Whether to include cancelled/deleted events.")
});
var EventSchema = import_zod.z.object({
  id: import_zod.z.string(),
  summary: import_zod.z.string().optional(),
  description: import_zod.z.string().optional(),
  location: import_zod.z.string().optional(),
  start: import_zod.z.union([import_zod.z.object({
    date: import_zod.z.string()
  }), import_zod.z.object({
    dateTime: import_zod.z.string(),
    timeZone: import_zod.z.string().optional()
  })]).optional(),
  end: import_zod.z.union([import_zod.z.object({
    date: import_zod.z.string()
  }), import_zod.z.object({
    dateTime: import_zod.z.string(),
    timeZone: import_zod.z.string().optional()
  })]).optional(),
  status: import_zod.z.string().optional(),
  created: import_zod.z.string().optional(),
  updated: import_zod.z.string().optional(),
  organizer: import_zod.z.object({
    email: import_zod.z.string().optional(),
    displayName: import_zod.z.string().optional()
  }).optional(),
  attendees: import_zod.z.array(import_zod.z.object({
    email: import_zod.z.string().optional(),
    displayName: import_zod.z.string().optional(),
    responseStatus: import_zod.z.string().optional()
  })).optional(),
  recurringEventId: import_zod.z.string().optional(),
  transparency: import_zod.z.string().optional(),
  visibility: import_zod.z.string().optional()
});
var OutputSchema = import_zod.z.object({
  events: import_zod.z.array(EventSchema),
  nextPageToken: import_zod.z.string().optional().describe("Pagination cursor for next page. Omitted if no more pages.")
});
var action = {
  type: "action",
  description: "List events on a calendar",
  version: "1.0.0",
  endpoint: {
    method: "POST",
    path: "/actions/list-events",
    group: "Events"
  },
  input: InputSchema,
  output: OutputSchema,
  scopes: ["https://www.googleapis.com/auth/calendar.readonly"],
  exec: async (nango, input) => {
    const calendarId = input.calendarId || "primary";
    const params = {};
    if (input.cursor) {
      params["pageToken"] = input.cursor;
    }
    if (input.maxResults !== void 0) {
      params["maxResults"] = input.maxResults;
    }
    if (input.timeMin) {
      params["timeMin"] = input.timeMin;
    }
    if (input.timeMax) {
      params["timeMax"] = input.timeMax;
    }
    if (input.q) {
      params["q"] = input.q;
    }
    if (input.singleEvents !== void 0) {
      params["singleEvents"] = input.singleEvents;
    }
    if (input.showDeleted !== void 0) {
      params["showDeleted"] = input.showDeleted;
    }
    const response = await nango.get({
      endpoint: `/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
      params,
      retries: 3
    });
    const events = (response.data.items || []).map((event) => ({
      id: event.id,
      summary: event.summary ?? void 0,
      description: event.description ?? void 0,
      location: event.location ?? void 0,
      start: event.start || void 0,
      end: event.end || void 0,
      status: event.status ?? void 0,
      created: event.created ?? void 0,
      updated: event.updated ?? void 0,
      organizer: event.organizer || void 0,
      attendees: event.attendees,
      recurringEventId: event.recurringEventId ?? void 0,
      transparency: event.transparency ?? void 0,
      visibility: event.visibility ?? void 0
    }));
    return {
      events,
      nextPageToken: response.data.nextPageToken || void 0
    };
  }
};
var list_events_default = action;
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiZ29vZ2xlL2FjdGlvbnMvbGlzdC1ldmVudHMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImltcG9ydCB7IHogfSBmcm9tICd6b2QnO1xuaW1wb3J0IHsgY3JlYXRlQWN0aW9uIH0gZnJvbSAnbmFuZ28nO1xuY29uc3QgSW5wdXRTY2hlbWEgPSB6Lm9iamVjdCh7XG4gIGNhbGVuZGFySWQ6IHouc3RyaW5nKCkub3B0aW9uYWwoKS5kZXNjcmliZSgnQ2FsZW5kYXIgaWRlbnRpZmllci4gVXNlIFwicHJpbWFyeVwiIGZvciB0aGUgcHJpbWFyeSBjYWxlbmRhciBvciBhIGNhbGVuZGFyIElEIGZyb20gY2FsZW5kYXJMaXN0Lmxpc3QuJyksXG4gIGN1cnNvcjogei5zdHJpbmcoKS5vcHRpb25hbCgpLmRlc2NyaWJlKCdQYWdpbmF0aW9uIGN1cnNvciAobmV4dFBhZ2VUb2tlbiBmcm9tIHByZXZpb3VzIHJlc3BvbnNlKS4gT21pdCBmb3IgZmlyc3QgcGFnZS4nKSxcbiAgbWF4UmVzdWx0czogei5udW1iZXIoKS5vcHRpb25hbCgpLmRlc2NyaWJlKCdNYXhpbXVtIG51bWJlciBvZiBldmVudHMgdG8gcmV0dXJuIHBlciBwYWdlICgxLTI1MDAsIGRlZmF1bHQgMjUwKS4nKSxcbiAgdGltZU1pbjogei5zdHJpbmcoKS5vcHRpb25hbCgpLmRlc2NyaWJlKFwiTG93ZXIgYm91bmQgKGV4Y2x1c2l2ZSkgZm9yIGFuIGV2ZW50J3MgZW5kIHRpbWUgZmlsdGVyIChSRkMzMzM5IHRpbWVzdGFtcCkuXCIpLFxuICB0aW1lTWF4OiB6LnN0cmluZygpLm9wdGlvbmFsKCkuZGVzY3JpYmUoXCJVcHBlciBib3VuZCAoZXhjbHVzaXZlKSBmb3IgYW4gZXZlbnQncyBzdGFydCB0aW1lIGZpbHRlciAoUkZDMzMzOSB0aW1lc3RhbXApLlwiKSxcbiAgcTogei5zdHJpbmcoKS5vcHRpb25hbCgpLmRlc2NyaWJlKCdGcmVlIHRleHQgc2VhcmNoIHRlcm1zIHRvIGZpbmQgbWF0Y2hpbmcgZXZlbnRzLicpLFxuICBzaW5nbGVFdmVudHM6IHouYm9vbGVhbigpLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ1doZXRoZXIgdG8gZXhwYW5kIHJlY3VycmluZyBldmVudHMgaW50byBzaW5nbGUgaW5zdGFuY2VzLicpLFxuICBzaG93RGVsZXRlZDogei5ib29sZWFuKCkub3B0aW9uYWwoKS5kZXNjcmliZSgnV2hldGhlciB0byBpbmNsdWRlIGNhbmNlbGxlZC9kZWxldGVkIGV2ZW50cy4nKVxufSk7XG5jb25zdCBFdmVudFNjaGVtYSA9IHoub2JqZWN0KHtcbiAgaWQ6IHouc3RyaW5nKCksXG4gIHN1bW1hcnk6IHouc3RyaW5nKCkub3B0aW9uYWwoKSxcbiAgZGVzY3JpcHRpb246IHouc3RyaW5nKCkub3B0aW9uYWwoKSxcbiAgbG9jYXRpb246IHouc3RyaW5nKCkub3B0aW9uYWwoKSxcbiAgc3RhcnQ6IHoudW5pb24oW3oub2JqZWN0KHtcbiAgICBkYXRlOiB6LnN0cmluZygpXG4gIH0pLCB6Lm9iamVjdCh7XG4gICAgZGF0ZVRpbWU6IHouc3RyaW5nKCksXG4gICAgdGltZVpvbmU6IHouc3RyaW5nKCkub3B0aW9uYWwoKVxuICB9KV0pLm9wdGlvbmFsKCksXG4gIGVuZDogei51bmlvbihbei5vYmplY3Qoe1xuICAgIGRhdGU6IHouc3RyaW5nKClcbiAgfSksIHoub2JqZWN0KHtcbiAgICBkYXRlVGltZTogei5zdHJpbmcoKSxcbiAgICB0aW1lWm9uZTogei5zdHJpbmcoKS5vcHRpb25hbCgpXG4gIH0pXSkub3B0aW9uYWwoKSxcbiAgc3RhdHVzOiB6LnN0cmluZygpLm9wdGlvbmFsKCksXG4gIGNyZWF0ZWQ6IHouc3RyaW5nKCkub3B0aW9uYWwoKSxcbiAgdXBkYXRlZDogei5zdHJpbmcoKS5vcHRpb25hbCgpLFxuICBvcmdhbml6ZXI6IHoub2JqZWN0KHtcbiAgICBlbWFpbDogei5zdHJpbmcoKS5vcHRpb25hbCgpLFxuICAgIGRpc3BsYXlOYW1lOiB6LnN0cmluZygpLm9wdGlvbmFsKClcbiAgfSkub3B0aW9uYWwoKSxcbiAgYXR0ZW5kZWVzOiB6LmFycmF5KHoub2JqZWN0KHtcbiAgICBlbWFpbDogei5zdHJpbmcoKS5vcHRpb25hbCgpLFxuICAgIGRpc3BsYXlOYW1lOiB6LnN0cmluZygpLm9wdGlvbmFsKCksXG4gICAgcmVzcG9uc2VTdGF0dXM6IHouc3RyaW5nKCkub3B0aW9uYWwoKVxuICB9KSkub3B0aW9uYWwoKSxcbiAgcmVjdXJyaW5nRXZlbnRJZDogei5zdHJpbmcoKS5vcHRpb25hbCgpLFxuICB0cmFuc3BhcmVuY3k6IHouc3RyaW5nKCkub3B0aW9uYWwoKSxcbiAgdmlzaWJpbGl0eTogei5zdHJpbmcoKS5vcHRpb25hbCgpXG59KTtcbmNvbnN0IE91dHB1dFNjaGVtYSA9IHoub2JqZWN0KHtcbiAgZXZlbnRzOiB6LmFycmF5KEV2ZW50U2NoZW1hKSxcbiAgbmV4dFBhZ2VUb2tlbjogei5zdHJpbmcoKS5vcHRpb25hbCgpLmRlc2NyaWJlKCdQYWdpbmF0aW9uIGN1cnNvciBmb3IgbmV4dCBwYWdlLiBPbWl0dGVkIGlmIG5vIG1vcmUgcGFnZXMuJylcbn0pO1xuY29uc3QgYWN0aW9uID0ge1xuICB0eXBlOiBcImFjdGlvblwiLFxuICBkZXNjcmlwdGlvbjogJ0xpc3QgZXZlbnRzIG9uIGEgY2FsZW5kYXInLFxuICB2ZXJzaW9uOiAnMS4wLjAnLFxuICBlbmRwb2ludDoge1xuICAgIG1ldGhvZDogJ1BPU1QnLFxuICAgIHBhdGg6ICcvYWN0aW9ucy9saXN0LWV2ZW50cycsXG4gICAgZ3JvdXA6ICdFdmVudHMnXG4gIH0sXG4gIGlucHV0OiBJbnB1dFNjaGVtYSxcbiAgb3V0cHV0OiBPdXRwdXRTY2hlbWEsXG4gIHNjb3BlczogWydodHRwczovL3d3dy5nb29nbGVhcGlzLmNvbS9hdXRoL2NhbGVuZGFyLnJlYWRvbmx5J10sXG4gIGV4ZWM6IGFzeW5jIChuYW5nbywgaW5wdXQpOiBQcm9taXNlPHouaW5mZXI8dHlwZW9mIE91dHB1dFNjaGVtYT4+ID0+IHtcbiAgICBjb25zdCBjYWxlbmRhcklkID0gaW5wdXQuY2FsZW5kYXJJZCB8fCAncHJpbWFyeSc7XG4gICAgY29uc3QgcGFyYW1zOiBSZWNvcmQ8c3RyaW5nLCBhbnk+ID0ge307XG4gICAgaWYgKGlucHV0LmN1cnNvcikge1xuICAgICAgcGFyYW1zWydwYWdlVG9rZW4nXSA9IGlucHV0LmN1cnNvcjtcbiAgICB9XG4gICAgaWYgKGlucHV0Lm1heFJlc3VsdHMgIT09IHVuZGVmaW5lZCkge1xuICAgICAgcGFyYW1zWydtYXhSZXN1bHRzJ10gPSBpbnB1dC5tYXhSZXN1bHRzO1xuICAgIH1cbiAgICBpZiAoaW5wdXQudGltZU1pbikge1xuICAgICAgcGFyYW1zWyd0aW1lTWluJ10gPSBpbnB1dC50aW1lTWluO1xuICAgIH1cbiAgICBpZiAoaW5wdXQudGltZU1heCkge1xuICAgICAgcGFyYW1zWyd0aW1lTWF4J10gPSBpbnB1dC50aW1lTWF4O1xuICAgIH1cbiAgICBpZiAoaW5wdXQucSkge1xuICAgICAgcGFyYW1zWydxJ10gPSBpbnB1dC5xO1xuICAgIH1cbiAgICBpZiAoaW5wdXQuc2luZ2xlRXZlbnRzICE9PSB1bmRlZmluZWQpIHtcbiAgICAgIHBhcmFtc1snc2luZ2xlRXZlbnRzJ10gPSBpbnB1dC5zaW5nbGVFdmVudHM7XG4gICAgfVxuICAgIGlmIChpbnB1dC5zaG93RGVsZXRlZCAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICBwYXJhbXNbJ3Nob3dEZWxldGVkJ10gPSBpbnB1dC5zaG93RGVsZXRlZDtcbiAgICB9XG5cbiAgICAvLyBodHRwczovL2RldmVsb3BlcnMuZ29vZ2xlLmNvbS93b3Jrc3BhY2UvY2FsZW5kYXIvYXBpL3YzL3JlZmVyZW5jZS9ldmVudHMvbGlzdFxuICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgbmFuZ28uZ2V0KHtcbiAgICAgIGVuZHBvaW50OiBgL2NhbGVuZGFyL3YzL2NhbGVuZGFycy8ke2VuY29kZVVSSUNvbXBvbmVudChjYWxlbmRhcklkKX0vZXZlbnRzYCxcbiAgICAgIHBhcmFtcyxcbiAgICAgIHJldHJpZXM6IDNcbiAgICB9KTtcbiAgICBjb25zdCBldmVudHMgPSAocmVzcG9uc2UuZGF0YS5pdGVtcyB8fCBbXSkubWFwKChldmVudDogYW55KSA9PiAoe1xuICAgICAgaWQ6IGV2ZW50LmlkLFxuICAgICAgc3VtbWFyeTogZXZlbnQuc3VtbWFyeSA/PyB1bmRlZmluZWQsXG4gICAgICBkZXNjcmlwdGlvbjogZXZlbnQuZGVzY3JpcHRpb24gPz8gdW5kZWZpbmVkLFxuICAgICAgbG9jYXRpb246IGV2ZW50LmxvY2F0aW9uID8/IHVuZGVmaW5lZCxcbiAgICAgIHN0YXJ0OiBldmVudC5zdGFydCB8fCB1bmRlZmluZWQsXG4gICAgICBlbmQ6IGV2ZW50LmVuZCB8fCB1bmRlZmluZWQsXG4gICAgICBzdGF0dXM6IGV2ZW50LnN0YXR1cyA/PyB1bmRlZmluZWQsXG4gICAgICBjcmVhdGVkOiBldmVudC5jcmVhdGVkID8/IHVuZGVmaW5lZCxcbiAgICAgIHVwZGF0ZWQ6IGV2ZW50LnVwZGF0ZWQgPz8gdW5kZWZpbmVkLFxuICAgICAgb3JnYW5pemVyOiBldmVudC5vcmdhbml6ZXIgfHwgdW5kZWZpbmVkLFxuICAgICAgYXR0ZW5kZWVzOiBldmVudC5hdHRlbmRlZXMsXG4gICAgICByZWN1cnJpbmdFdmVudElkOiBldmVudC5yZWN1cnJpbmdFdmVudElkID8/IHVuZGVmaW5lZCxcbiAgICAgIHRyYW5zcGFyZW5jeTogZXZlbnQudHJhbnNwYXJlbmN5ID8/IHVuZGVmaW5lZCxcbiAgICAgIHZpc2liaWxpdHk6IGV2ZW50LnZpc2liaWxpdHkgPz8gdW5kZWZpbmVkXG4gICAgfSkpO1xuICAgIHJldHVybiB7XG4gICAgICBldmVudHMsXG4gICAgICBuZXh0UGFnZVRva2VuOiByZXNwb25zZS5kYXRhLm5leHRQYWdlVG9rZW4gfHwgdW5kZWZpbmVkXG4gICAgfTtcbiAgfVxufTtcbmV4cG9ydCB0eXBlIE5hbmdvQWN0aW9uTG9jYWwgPSBQYXJhbWV0ZXJzPCh0eXBlb2YgYWN0aW9uKVsnZXhl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
