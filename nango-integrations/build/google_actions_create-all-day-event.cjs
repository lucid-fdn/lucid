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

// google/actions/create-all-day-event.ts
var create_all_day_event_exports = {};
__export(create_all_day_event_exports, {
  default: () => create_all_day_event_default
});
module.exports = __toCommonJS(create_all_day_event_exports);
var import_zod = require("zod");
var InputSchema = import_zod.z.object({
  calendarId: import_zod.z.string().optional().describe('Calendar identifier. Use "primary" for the primary calendar.'),
  summary: import_zod.z.string().describe("Title of the event"),
  startDate: import_zod.z.string().describe("Start date in yyyy-mm-dd format (inclusive)"),
  endDate: import_zod.z.string().describe("End date in yyyy-mm-dd format (exclusive)"),
  description: import_zod.z.string().optional().describe("Description of the event"),
  location: import_zod.z.string().optional().describe("Location of the event")
});
var OutputSchema = import_zod.z.object({
  id: import_zod.z.string(),
  summary: import_zod.z.string(),
  startDate: import_zod.z.string(),
  endDate: import_zod.z.string(),
  description: import_zod.z.string().optional(),
  location: import_zod.z.string().optional(),
  htmlLink: import_zod.z.string()
});
var action = {
  type: "action",
  description: "Create an all-day calendar event using start and end dates",
  version: "1.0.0",
  endpoint: {
    method: "POST",
    path: "/actions/create-all-day-event",
    group: "Events"
  },
  input: InputSchema,
  output: OutputSchema,
  scopes: ["https://www.googleapis.com/auth/calendar.events"],
  exec: async (nango, input) => {
    const calendarId = input.calendarId || "primary";
    const response = await nango.post({
      endpoint: `/calendar/v3/calendars/${calendarId}/events`,
      data: {
        summary: input.summary,
        start: {
          date: input.startDate
        },
        end: {
          date: input.endDate
        },
        ...input.description && {
          description: input.description
        },
        ...input.location && {
          location: input.location
        }
      },
      retries: 3
    });
    const event = response.data;
    return {
      id: event.id,
      summary: event.summary,
      startDate: event.start.date,
      endDate: event.end.date,
      description: event.description ?? void 0,
      location: event.location ?? void 0,
      htmlLink: event.htmlLink
    };
  }
};
var create_all_day_event_default = action;
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiZ29vZ2xlL2FjdGlvbnMvY3JlYXRlLWFsbC1kYXktZXZlbnQudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImltcG9ydCB7IHogfSBmcm9tICd6b2QnO1xuaW1wb3J0IHsgY3JlYXRlQWN0aW9uIH0gZnJvbSAnbmFuZ28nO1xuY29uc3QgSW5wdXRTY2hlbWEgPSB6Lm9iamVjdCh7XG4gIGNhbGVuZGFySWQ6IHouc3RyaW5nKCkub3B0aW9uYWwoKS5kZXNjcmliZSgnQ2FsZW5kYXIgaWRlbnRpZmllci4gVXNlIFwicHJpbWFyeVwiIGZvciB0aGUgcHJpbWFyeSBjYWxlbmRhci4nKSxcbiAgc3VtbWFyeTogei5zdHJpbmcoKS5kZXNjcmliZSgnVGl0bGUgb2YgdGhlIGV2ZW50JyksXG4gIHN0YXJ0RGF0ZTogei5zdHJpbmcoKS5kZXNjcmliZSgnU3RhcnQgZGF0ZSBpbiB5eXl5LW1tLWRkIGZvcm1hdCAoaW5jbHVzaXZlKScpLFxuICBlbmREYXRlOiB6LnN0cmluZygpLmRlc2NyaWJlKCdFbmQgZGF0ZSBpbiB5eXl5LW1tLWRkIGZvcm1hdCAoZXhjbHVzaXZlKScpLFxuICBkZXNjcmlwdGlvbjogei5zdHJpbmcoKS5vcHRpb25hbCgpLmRlc2NyaWJlKCdEZXNjcmlwdGlvbiBvZiB0aGUgZXZlbnQnKSxcbiAgbG9jYXRpb246IHouc3RyaW5nKCkub3B0aW9uYWwoKS5kZXNjcmliZSgnTG9jYXRpb24gb2YgdGhlIGV2ZW50Jylcbn0pO1xuY29uc3QgT3V0cHV0U2NoZW1hID0gei5vYmplY3Qoe1xuICBpZDogei5zdHJpbmcoKSxcbiAgc3VtbWFyeTogei5zdHJpbmcoKSxcbiAgc3RhcnREYXRlOiB6LnN0cmluZygpLFxuICBlbmREYXRlOiB6LnN0cmluZygpLFxuICBkZXNjcmlwdGlvbjogei5zdHJpbmcoKS5vcHRpb25hbCgpLFxuICBsb2NhdGlvbjogei5zdHJpbmcoKS5vcHRpb25hbCgpLFxuICBodG1sTGluazogei5zdHJpbmcoKVxufSk7XG5jb25zdCBhY3Rpb24gPSB7XG4gIHR5cGU6IFwiYWN0aW9uXCIsXG4gIGRlc2NyaXB0aW9uOiAnQ3JlYXRlIGFuIGFsbC1kYXkgY2FsZW5kYXIgZXZlbnQgdXNpbmcgc3RhcnQgYW5kIGVuZCBkYXRlcycsXG4gIHZlcnNpb246ICcxLjAuMCcsXG4gIGVuZHBvaW50OiB7XG4gICAgbWV0aG9kOiAnUE9TVCcsXG4gICAgcGF0aDogJy9hY3Rpb25zL2NyZWF0ZS1hbGwtZGF5LWV2ZW50JyxcbiAgICBncm91cDogJ0V2ZW50cydcbiAgfSxcbiAgaW5wdXQ6IElucHV0U2NoZW1hLFxuICBvdXRwdXQ6IE91dHB1dFNjaGVtYSxcbiAgc2NvcGVzOiBbJ2h0dHBzOi8vd3d3Lmdvb2dsZWFwaXMuY29tL2F1dGgvY2FsZW5kYXIuZXZlbnRzJ10sXG4gIGV4ZWM6IGFzeW5jIChuYW5nbywgaW5wdXQpOiBQcm9taXNlPHouaW5mZXI8dHlwZW9mIE91dHB1dFNjaGVtYT4+ID0+IHtcbiAgICBjb25zdCBjYWxlbmRhcklkID0gaW5wdXQuY2FsZW5kYXJJZCB8fCAncHJpbWFyeSc7XG5cbiAgICAvLyBodHRwczovL2RldmVsb3BlcnMuZ29vZ2xlLmNvbS9jYWxlbmRhci9hcGkvdjMvcmVmZXJlbmNlL2V2ZW50cy9pbnNlcnRcbiAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IG5hbmdvLnBvc3Qoe1xuICAgICAgZW5kcG9pbnQ6IGAvY2FsZW5kYXIvdjMvY2FsZW5kYXJzLyR7Y2FsZW5kYXJJZH0vZXZlbnRzYCxcbiAgICAgIGRhdGE6IHtcbiAgICAgICAgc3VtbWFyeTogaW5wdXQuc3VtbWFyeSxcbiAgICAgICAgc3RhcnQ6IHtcbiAgICAgICAgICBkYXRlOiBpbnB1dC5zdGFydERhdGVcbiAgICAgICAgfSxcbiAgICAgICAgZW5kOiB7XG4gICAgICAgICAgZGF0ZTogaW5wdXQuZW5kRGF0ZVxuICAgICAgICB9LFxuICAgICAgICAuLi4oaW5wdXQuZGVzY3JpcHRpb24gJiYge1xuICAgICAgICAgIGRlc2NyaXB0aW9uOiBpbnB1dC5kZXNjcmlwdGlvblxuICAgICAgICB9KSxcbiAgICAgICAgLi4uKGlucHV0LmxvY2F0aW9uICYmIHtcbiAgICAgICAgICBsb2NhdGlvbjogaW5wdXQubG9jYXRpb25cbiAgICAgICAgfSlcbiAgICAgIH0sXG4gICAgICByZXRyaWVzOiAzXG4gICAgfSk7XG4gICAgY29uc3QgZXZlbnQgPSByZXNwb25zZS5kYXRhO1xuICAgIHJldHVybiB7XG4gICAgICBpZDogZXZlbnQuaWQsXG4gICAgICBzdW1tYXJ5OiBldmVudC5zdW1tYXJ5LFxuICAgICAgc3RhcnREYXRlOiBldmVudC5zdGFydC5kYXRlLFxuICAgICAgZW5kRGF0ZTogZXZlbnQuZW5kLmRhdGUsXG4gICAgICBkZXNjcmlwdGlvbjogZXZlbnQuZGVzY3JpcHRpb24gPz8gdW5kZWZpbmVkLFxuICAgICAgbG9jYXRpb246IGV2ZW50LmxvY2F0aW9uID8/IHVuZGVmaW5lZCxcbiAgICAgIGh0bWxMaW5rOiBldmVudC5odG1sTGlua1xuICAgIH07XG4gIH1cbn07XG5leHBvcnQgdHlwZSBOYW5nb0FjdGlvbkxvY2FsID0gUGFyYW1ldGVyczwodHlwZW9mIGFjdGlvbilbJ2V4ZWMnXT5bMF07XG5leHBvcnQgZGVmYXVsdCBhY3Rpb247Il0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsaUJBQWtCO0FBRWxCLElBQU0sY0FBYyxhQUFFLE9BQU87QUFBQSxFQUMzQixZQUFZLGFBQUUsT0FBTyxFQUFFLFNBQVMsRUFBRSxTQUFTLDhEQUE4RDtBQUFBLEVBQ3pHLFNBQVMsYUFBRSxPQUFPLEVBQUUsU0FBUyxvQkFBb0I7QUFBQSxFQUNqRCxXQUFXLGFBQUUsT0FBTyxFQUFFLFNBQVMsNkNBQTZDO0FBQUEsRUFDNUUsU0FBUyxhQUFFLE9BQU8sRUFBRSxTQUFTLDJDQUEyQztBQUFBLEVBQ3hFLGFBQWEsYUFBRSxPQUFPLEVBQUUsU0FBUyxFQUFFLFNBQVMsMEJBQTBCO0FBQUEsRUFDdEUsVUFBVSxhQUFFLE9BQU8sRUFBRSxTQUFTLEVBQUUsU0FBUyx1QkFBdUI7QUFDbEUsQ0FBQztBQUNELElBQU0sZUFBZSxhQUFFLE9BQU87QUFBQSxFQUM1QixJQUFJLGFBQUUsT0FBTztBQUFBLEVBQ2IsU0FBUyxhQUFFLE9BQU87QUFBQSxFQUNsQixXQUFXLGFBQUUsT0FBTztBQUFBLEVBQ3BCLFNBQVMsYUFBRSxPQUFPO0FBQUEsRUFDbEIsYUFBYSxhQUFFLE9BQU8sRUFBRSxTQUFTO0FBQUEsRUFDakMsVUFBVSxhQUFFLE9BQU8sRUFBRSxTQUFTO0FBQUEsRUFDOUIsVUFBVSxhQUFFLE9BQU87QUFDckIsQ0FBQztBQUNELElBQU0sU0FBUztBQUFBLEVBQ2IsTUFBTTtBQUFBLEVBQ04sYUFBYTtBQUFBLEVBQ2IsU0FBUztBQUFBLEVBQ1QsVUFBVTtBQUFBLElBQ1IsUUFBUTtBQUFBLElBQ1IsTUFBTTtBQUFBLElBQ04sT0FBTztBQUFBLEVBQ1Q7QUFBQSxFQUNBLE9BQU87QUFBQSxFQUNQLFFBQVE7QUFBQSxFQUNSLFFBQVEsQ0FBQyxpREFBaUQ7QUFBQSxFQUMxRCxNQUFNLE9BQU8sT0FBTyxVQUFpRDtBQUNuRSxVQUFNLGFBQWEsTUFBTSxjQUFjO0FBR3ZDLFVBQU0sV0FBVyxNQUFNLE1BQU0sS0FBSztBQUFBLE1BQ2hDLFVBQVUsMEJBQTBCLFVBQVU7QUFBQSxNQUM5QyxNQUFNO0FBQUEsUUFDSixTQUFTLE1BQU07QUFBQSxRQUNmLE9BQU87QUFBQSxVQUNMLE1BQU0sTUFBTTtBQUFBLFFBQ2Q7QUFBQSxRQUNBLEtBQUs7QUFBQSxVQUNILE1BQU0sTUFBTTtBQUFBLFFBQ2Q7QUFBQSxRQUNBLEdBQUksTUFBTSxlQUFlO0FBQUEsVUFDdkIsYUFBYSxNQUFNO0FBQUEsUUFDckI7QUFBQSxRQUNBLEdBQUksTUFBTSxZQUFZO0FBQUEsVUFDcEIsVUFBVSxNQUFNO0FBQUEsUUFDbEI7QUFBQSxNQUNGO0FBQUEsTUFDQSxTQUFTO0FBQUEsSUFDWCxDQUFDO0FBQ0QsVUFBTSxRQUFRLFNBQVM7QUFDdkIsV0FBTztBQUFBLE1BQ0wsSUFBSSxNQUFNO0FBQUEsTUFDVixTQUFTLE1BQU07QUFBQSxNQUNmLFdBQVcsTUFBTSxNQUFNO0FBQUEsTUFDdkIsU0FBUyxNQUFNLElBQUk7QUFBQSxNQUNuQixhQUFhLE1BQU0sZUFBZTtBQUFBLE1BQ2xDLFVBQVUsTUFBTSxZQUFZO0FBQUEsTUFDNUIsVUFBVSxNQUFNO0FBQUEsSUFDbEI7QUFBQSxFQUNGO0FBQ0Y7QUFFQSxJQUFPLCtCQUFROyIsCiAgIm5hbWVzIjogW10KfQo=
