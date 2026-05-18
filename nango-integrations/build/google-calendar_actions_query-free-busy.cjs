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

// google-calendar/actions/query-free-busy.ts
var query_free_busy_exports = {};
__export(query_free_busy_exports, {
  default: () => query_free_busy_default
});
module.exports = __toCommonJS(query_free_busy_exports);
var import_zod = require("zod");
var CalendarItemSchema = import_zod.z.object({
  id: import_zod.z.string().describe("The identifier of a calendar or a group")
});
var InputSchema = import_zod.z.object({
  timeMin: import_zod.z.string().describe('The start of the interval for the query formatted as per RFC3339. Example: "2024-01-01T00:00:00Z"'),
  timeMax: import_zod.z.string().describe('The end of the interval for the query formatted as per RFC3339. Example: "2024-01-02T00:00:00Z"'),
  timeZone: import_zod.z.string().optional().describe('Time zone used in the response. The default is UTC. Example: "UTC"'),
  groupExpansionMax: import_zod.z.number().optional().describe("Maximal number of calendar identifiers to be provided for a single group. Maximum value is 100."),
  calendarExpansionMax: import_zod.z.number().optional().describe("Maximal number of calendars for which FreeBusy information is to be provided. Maximum value is 50."),
  items: import_zod.z.array(CalendarItemSchema).describe("List of calendars and/or groups to query")
});
var ErrorSchema = import_zod.z.object({
  domain: import_zod.z.string(),
  reason: import_zod.z.string()
});
var BusyPeriodSchema = import_zod.z.object({
  start: import_zod.z.string(),
  end: import_zod.z.string()
});
var CalendarFreeBusySchema = import_zod.z.object({
  errors: import_zod.z.array(ErrorSchema).optional(),
  busy: import_zod.z.array(BusyPeriodSchema)
});
var GroupSchema = import_zod.z.object({
  errors: import_zod.z.array(ErrorSchema).optional(),
  calendars: import_zod.z.array(import_zod.z.string())
});
var OutputSchema = import_zod.z.object({
  kind: import_zod.z.string(),
  timeMin: import_zod.z.string(),
  timeMax: import_zod.z.string(),
  groups: import_zod.z.record(import_zod.z.string(), GroupSchema).optional(),
  calendars: import_zod.z.record(import_zod.z.string(), CalendarFreeBusySchema)
});
var action = {
  type: "action",
  description: "Return free/busy blocks for one or more calendars in a time range",
  version: "1.0.0",
  endpoint: {
    method: "POST",
    path: "/actions/query-free-busy",
    group: "Calendars"
  },
  input: InputSchema,
  output: OutputSchema,
  scopes: ["https://www.googleapis.com/auth/calendar.readonly"],
  exec: async (nango, input) => {
    const requestBody = {
      timeMin: input.timeMin,
      timeMax: input.timeMax,
      items: input.items
    };
    if (input.timeZone) {
      requestBody.timeZone = input.timeZone;
    }
    if (input.groupExpansionMax !== void 0) {
      requestBody.groupExpansionMax = input.groupExpansionMax;
    }
    if (input.calendarExpansionMax !== void 0) {
      requestBody.calendarExpansionMax = input.calendarExpansionMax;
    }
    const response = await nango.post({
      // https://developers.google.com/workspace/calendar/api/v3/reference/freebusy/query
      endpoint: "/calendar/v3/freeBusy",
      data: requestBody,
      retries: 3
    });
    return {
      kind: response.data.kind,
      timeMin: response.data.timeMin,
      timeMax: response.data.timeMax,
      groups: response.data.groups,
      calendars: response.data.calendars
    };
  }
};
var query_free_busy_default = action;
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiZ29vZ2xlLWNhbGVuZGFyL2FjdGlvbnMvcXVlcnktZnJlZS1idXN5LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyJpbXBvcnQgeyB6IH0gZnJvbSAnem9kJztcbmltcG9ydCB7IGNyZWF0ZUFjdGlvbiB9IGZyb20gJ25hbmdvJztcbmNvbnN0IENhbGVuZGFySXRlbVNjaGVtYSA9IHoub2JqZWN0KHtcbiAgaWQ6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ1RoZSBpZGVudGlmaWVyIG9mIGEgY2FsZW5kYXIgb3IgYSBncm91cCcpXG59KTtcbmNvbnN0IElucHV0U2NoZW1hID0gei5vYmplY3Qoe1xuICB0aW1lTWluOiB6LnN0cmluZygpLmRlc2NyaWJlKCdUaGUgc3RhcnQgb2YgdGhlIGludGVydmFsIGZvciB0aGUgcXVlcnkgZm9ybWF0dGVkIGFzIHBlciBSRkMzMzM5LiBFeGFtcGxlOiBcIjIwMjQtMDEtMDFUMDA6MDA6MDBaXCInKSxcbiAgdGltZU1heDogei5zdHJpbmcoKS5kZXNjcmliZSgnVGhlIGVuZCBvZiB0aGUgaW50ZXJ2YWwgZm9yIHRoZSBxdWVyeSBmb3JtYXR0ZWQgYXMgcGVyIFJGQzMzMzkuIEV4YW1wbGU6IFwiMjAyNC0wMS0wMlQwMDowMDowMFpcIicpLFxuICB0aW1lWm9uZTogei5zdHJpbmcoKS5vcHRpb25hbCgpLmRlc2NyaWJlKCdUaW1lIHpvbmUgdXNlZCBpbiB0aGUgcmVzcG9uc2UuIFRoZSBkZWZhdWx0IGlzIFVUQy4gRXhhbXBsZTogXCJVVENcIicpLFxuICBncm91cEV4cGFuc2lvbk1heDogei5udW1iZXIoKS5vcHRpb25hbCgpLmRlc2NyaWJlKCdNYXhpbWFsIG51bWJlciBvZiBjYWxlbmRhciBpZGVudGlmaWVycyB0byBiZSBwcm92aWRlZCBmb3IgYSBzaW5nbGUgZ3JvdXAuIE1heGltdW0gdmFsdWUgaXMgMTAwLicpLFxuICBjYWxlbmRhckV4cGFuc2lvbk1heDogei5udW1iZXIoKS5vcHRpb25hbCgpLmRlc2NyaWJlKCdNYXhpbWFsIG51bWJlciBvZiBjYWxlbmRhcnMgZm9yIHdoaWNoIEZyZWVCdXN5IGluZm9ybWF0aW9uIGlzIHRvIGJlIHByb3ZpZGVkLiBNYXhpbXVtIHZhbHVlIGlzIDUwLicpLFxuICBpdGVtczogei5hcnJheShDYWxlbmRhckl0ZW1TY2hlbWEpLmRlc2NyaWJlKCdMaXN0IG9mIGNhbGVuZGFycyBhbmQvb3IgZ3JvdXBzIHRvIHF1ZXJ5Jylcbn0pO1xuY29uc3QgRXJyb3JTY2hlbWEgPSB6Lm9iamVjdCh7XG4gIGRvbWFpbjogei5zdHJpbmcoKSxcbiAgcmVhc29uOiB6LnN0cmluZygpXG59KTtcbmNvbnN0IEJ1c3lQZXJpb2RTY2hlbWEgPSB6Lm9iamVjdCh7XG4gIHN0YXJ0OiB6LnN0cmluZygpLFxuICBlbmQ6IHouc3RyaW5nKClcbn0pO1xuY29uc3QgQ2FsZW5kYXJGcmVlQnVzeVNjaGVtYSA9IHoub2JqZWN0KHtcbiAgZXJyb3JzOiB6LmFycmF5KEVycm9yU2NoZW1hKS5vcHRpb25hbCgpLFxuICBidXN5OiB6LmFycmF5KEJ1c3lQZXJpb2RTY2hlbWEpXG59KTtcbmNvbnN0IEdyb3VwU2NoZW1hID0gei5vYmplY3Qoe1xuICBlcnJvcnM6IHouYXJyYXkoRXJyb3JTY2hlbWEpLm9wdGlvbmFsKCksXG4gIGNhbGVuZGFyczogei5hcnJheSh6LnN0cmluZygpKVxufSk7XG5jb25zdCBPdXRwdXRTY2hlbWEgPSB6Lm9iamVjdCh7XG4gIGtpbmQ6IHouc3RyaW5nKCksXG4gIHRpbWVNaW46IHouc3RyaW5nKCksXG4gIHRpbWVNYXg6IHouc3RyaW5nKCksXG4gIGdyb3Vwczogei5yZWNvcmQoei5zdHJpbmcoKSwgR3JvdXBTY2hlbWEpLm9wdGlvbmFsKCksXG4gIGNhbGVuZGFyczogei5yZWNvcmQoei5zdHJpbmcoKSwgQ2FsZW5kYXJGcmVlQnVzeVNjaGVtYSlcbn0pO1xuY29uc3QgYWN0aW9uID0ge1xuICB0eXBlOiBcImFjdGlvblwiLFxuICBkZXNjcmlwdGlvbjogJ1JldHVybiBmcmVlL2J1c3kgYmxvY2tzIGZvciBvbmUgb3IgbW9yZSBjYWxlbmRhcnMgaW4gYSB0aW1lIHJhbmdlJyxcbiAgdmVyc2lvbjogJzEuMC4wJyxcbiAgZW5kcG9pbnQ6IHtcbiAgICBtZXRob2Q6ICdQT1NUJyxcbiAgICBwYXRoOiAnL2FjdGlvbnMvcXVlcnktZnJlZS1idXN5JyxcbiAgICBncm91cDogJ0NhbGVuZGFycydcbiAgfSxcbiAgaW5wdXQ6IElucHV0U2NoZW1hLFxuICBvdXRwdXQ6IE91dHB1dFNjaGVtYSxcbiAgc2NvcGVzOiBbJ2h0dHBzOi8vd3d3Lmdvb2dsZWFwaXMuY29tL2F1dGgvY2FsZW5kYXIucmVhZG9ubHknXSxcbiAgZXhlYzogYXN5bmMgKG5hbmdvLCBpbnB1dCk6IFByb21pc2U8ei5pbmZlcjx0eXBlb2YgT3V0cHV0U2NoZW1hPj4gPT4ge1xuICAgIGNvbnN0IHJlcXVlc3RCb2R5OiB7XG4gICAgICB0aW1lTWluOiBzdHJpbmc7XG4gICAgICB0aW1lTWF4OiBzdHJpbmc7XG4gICAgICB0aW1lWm9uZT86IHN0cmluZztcbiAgICAgIGdyb3VwRXhwYW5zaW9uTWF4PzogbnVtYmVyO1xuICAgICAgY2FsZW5kYXJFeHBhbnNpb25NYXg/OiBudW1iZXI7XG4gICAgICBpdGVtczoge1xuICAgICAgICBpZDogc3RyaW5nO1xuICAgICAgfVtdO1xuICAgIH0gPSB7XG4gICAgICB0aW1lTWluOiBpbnB1dC50aW1lTWluLFxuICAgICAgdGltZU1heDogaW5wdXQudGltZU1heCxcbiAgICAgIGl0ZW1zOiBpbnB1dC5pdGVtc1xuICAgIH07XG4gICAgaWYgKGlucHV0LnRpbWVab25lKSB7XG4gICAgICByZXF1ZXN0Qm9keS50aW1lWm9uZSA9IGlucHV0LnRpbWVab25lO1xuICAgIH1cbiAgICBpZiAoaW5wdXQuZ3JvdXBFeHBhbnNpb25NYXggIT09IHVuZGVmaW5lZCkge1xuICAgICAgcmVxdWVzdEJvZHkuZ3JvdXBFeHBhbnNpb25NYXggPSBpbnB1dC5ncm91cEV4cGFuc2lvbk1heDtcbiAgICB9XG4gICAgaWYgKGlucHV0LmNhbGVuZGFyRXhwYW5zaW9uTWF4ICE9PSB1bmRlZmluZWQpIHtcbiAgICAgIHJlcXVlc3RCb2R5LmNhbGVuZGFyRXhwYW5zaW9uTWF4ID0gaW5wdXQuY2FsZW5kYXJFeHBhbnNpb25NYXg7XG4gICAgfVxuICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgbmFuZ28ucG9zdCh7XG4gICAgICAvLyBodHRwczovL2RldmVsb3BlcnMuZ29vZ2xlLmNvbS93b3Jrc3BhY2UvY2FsZW5kYXIvYXBpL3YzL3JlZmVyZW5jZS9mcmVlYnVzeS9xdWVyeVxuICAgICAgZW5kcG9pbnQ6ICcvY2FsZW5kYXIvdjMvZnJlZUJ1c3knLFxuICAgICAgZGF0YTogcmVxdWVzdEJvZHksXG4gICAgICByZXRyaWVzOiAzXG4gICAgfSk7XG4gICAgcmV0dXJuIHtcbiAgICAgIGtpbmQ6IHJlc3BvbnNlLmRhdGEua2luZCxcbiAgICAgIHRpbWVNaW46IHJlc3BvbnNlLmRhdGEudGltZU1pbixcbiAgICAgIHRpbWVNYXg6IHJlc3BvbnNlLmRhdGEudGltZU1heCxcbiAgICAgIGdyb3VwczogcmVzcG9uc2UuZGF0YS5ncm91cHMsXG4gICAgICBjYWxlbmRhcnM6IHJlc3BvbnNlLmRhdGEuY2FsZW5kYXJzXG4gICAgfTtcbiAgfVxufTtcbmV4cG9ydCB0eXBlIE5hbmdvQWN0aW9uTG9jYWwgPSBQYXJhbWV0ZXJzPCh0eXBlb2YgYWN0aW9uKVsnZXhlYyddPlswXTtcbmV4cG9ydCBkZWZhdWx0IGFjdGlvbjsiXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxpQkFBa0I7QUFFbEIsSUFBTSxxQkFBcUIsYUFBRSxPQUFPO0FBQUEsRUFDbEMsSUFBSSxhQUFFLE9BQU8sRUFBRSxTQUFTLHlDQUF5QztBQUNuRSxDQUFDO0FBQ0QsSUFBTSxjQUFjLGFBQUUsT0FBTztBQUFBLEVBQzNCLFNBQVMsYUFBRSxPQUFPLEVBQUUsU0FBUyxtR0FB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
