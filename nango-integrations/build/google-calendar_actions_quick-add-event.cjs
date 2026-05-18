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

// google-calendar/actions/quick-add-event.ts
var quick_add_event_exports = {};
__export(quick_add_event_exports, {
  default: () => quick_add_event_default
});
module.exports = __toCommonJS(quick_add_event_exports);
var import_zod = require("zod");
var InputSchema = import_zod.z.object({
  calendarId: import_zod.z.string().optional().describe('Calendar identifier. Use "primary" for the primary calendar. Example: "primary"'),
  text: import_zod.z.string().describe('The text describing the event to be created. Example: "Meeting with John tomorrow at 2pm"'),
  sendUpdates: import_zod.z.enum(["all", "externalOnly", "none"]).optional().describe('Guests who should receive notifications about the creation of the new event. Acceptable values: "all", "externalOnly", "none".')
});
var OutputSchema = import_zod.z.object({
  id: import_zod.z.string().describe("The unique ID of the event."),
  summary: import_zod.z.string().optional().describe("The title of the event."),
  description: import_zod.z.string().optional().describe("The description of the event."),
  start: import_zod.z.object({
    dateTime: import_zod.z.string().optional(),
    date: import_zod.z.string().optional(),
    timeZone: import_zod.z.string().optional()
  }).describe("The start time of the event."),
  end: import_zod.z.object({
    dateTime: import_zod.z.string().optional(),
    date: import_zod.z.string().optional(),
    timeZone: import_zod.z.string().optional()
  }).describe("The end time of the event."),
  htmlLink: import_zod.z.string().optional().describe("A link to the event in Google Calendar."),
  created: import_zod.z.string().optional().describe("The creation time of the event."),
  updated: import_zod.z.string().optional().describe("The last modification time of the event."),
  status: import_zod.z.string().optional().describe("The status of the event."),
  creator: import_zod.z.object({
    email: import_zod.z.string().optional(),
    displayName: import_zod.z.string().optional()
  }).optional().describe("The creator of the event."),
  organizer: import_zod.z.object({
    email: import_zod.z.string().optional(),
    displayName: import_zod.z.string().optional()
  }).optional().describe("The organizer of the event.")
});
var action = {
  type: "action",
  description: "Create an event from a text string",
  version: "1.0.0",
  endpoint: {
    method: "POST",
    path: "/actions/quick-add-event",
    group: "Events"
  },
  input: InputSchema,
  output: OutputSchema,
  scopes: ["https://www.googleapis.com/auth/calendar.events"],
  exec: async (nango, input) => {
    const calendarId = input.calendarId || "primary";
    const response = await nango.post({
      // https://developers.google.com/calendar/api/v3/reference/events/quickAdd
      endpoint: `/calendar/v3/calendars/${calendarId}/events/quickAdd`,
      params: {
        text: input.text,
        ...input.sendUpdates && {
          sendUpdates: input.sendUpdates
        }
      },
      retries: 3
    });
    const event = response.data;
    return {
      id: event.id,
      summary: event.summary ?? void 0,
      description: event.description ?? void 0,
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
      htmlLink: event.htmlLink ?? void 0,
      created: event.created ?? void 0,
      updated: event.updated ?? void 0,
      status: event.status ?? void 0,
      creator: event.creator ? {
        email: event.creator.email ?? void 0,
        displayName: event.creator.displayName ?? void 0
      } : void 0,
      organizer: event.organizer ? {
        email: event.organizer.email ?? void 0,
        displayName: event.organizer.displayName ?? void 0
      } : void 0
    };
  }
};
var quick_add_event_default = action;
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiZ29vZ2xlLWNhbGVuZGFyL2FjdGlvbnMvcXVpY2stYWRkLWV2ZW50LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyJpbXBvcnQgeyB6IH0gZnJvbSAnem9kJztcbmltcG9ydCB7IGNyZWF0ZUFjdGlvbiB9IGZyb20gJ25hbmdvJztcbmNvbnN0IElucHV0U2NoZW1hID0gei5vYmplY3Qoe1xuICBjYWxlbmRhcklkOiB6LnN0cmluZygpLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ0NhbGVuZGFyIGlkZW50aWZpZXIuIFVzZSBcInByaW1hcnlcIiBmb3IgdGhlIHByaW1hcnkgY2FsZW5kYXIuIEV4YW1wbGU6IFwicHJpbWFyeVwiJyksXG4gIHRleHQ6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ1RoZSB0ZXh0IGRlc2NyaWJpbmcgdGhlIGV2ZW50IHRvIGJlIGNyZWF0ZWQuIEV4YW1wbGU6IFwiTWVldGluZyB3aXRoIEpvaG4gdG9tb3Jyb3cgYXQgMnBtXCInKSxcbiAgc2VuZFVwZGF0ZXM6IHouZW51bShbJ2FsbCcsICdleHRlcm5hbE9ubHknLCAnbm9uZSddKS5vcHRpb25hbCgpLmRlc2NyaWJlKCdHdWVzdHMgd2hvIHNob3VsZCByZWNlaXZlIG5vdGlmaWNhdGlvbnMgYWJvdXQgdGhlIGNyZWF0aW9uIG9mIHRoZSBuZXcgZXZlbnQuIEFjY2VwdGFibGUgdmFsdWVzOiBcImFsbFwiLCBcImV4dGVybmFsT25seVwiLCBcIm5vbmVcIi4nKVxufSk7XG5jb25zdCBPdXRwdXRTY2hlbWEgPSB6Lm9iamVjdCh7XG4gIGlkOiB6LnN0cmluZygpLmRlc2NyaWJlKCdUaGUgdW5pcXVlIElEIG9mIHRoZSBldmVudC4nKSxcbiAgc3VtbWFyeTogei5zdHJpbmcoKS5vcHRpb25hbCgpLmRlc2NyaWJlKCdUaGUgdGl0bGUgb2YgdGhlIGV2ZW50LicpLFxuICBkZXNjcmlwdGlvbjogei5zdHJpbmcoKS5vcHRpb25hbCgpLmRlc2NyaWJlKCdUaGUgZGVzY3JpcHRpb24gb2YgdGhlIGV2ZW50LicpLFxuICBzdGFydDogei5vYmplY3Qoe1xuICAgIGRhdGVUaW1lOiB6LnN0cmluZygpLm9wdGlvbmFsKCksXG4gICAgZGF0ZTogei5zdHJpbmcoKS5vcHRpb25hbCgpLFxuICAgIHRpbWVab25lOiB6LnN0cmluZygpLm9wdGlvbmFsKClcbiAgfSkuZGVzY3JpYmUoJ1RoZSBzdGFydCB0aW1lIG9mIHRoZSBldmVudC4nKSxcbiAgZW5kOiB6Lm9iamVjdCh7XG4gICAgZGF0ZVRpbWU6IHouc3RyaW5nKCkub3B0aW9uYWwoKSxcbiAgICBkYXRlOiB6LnN0cmluZygpLm9wdGlvbmFsKCksXG4gICAgdGltZVpvbmU6IHouc3RyaW5nKCkub3B0aW9uYWwoKVxuICB9KS5kZXNjcmliZSgnVGhlIGVuZCB0aW1lIG9mIHRoZSBldmVudC4nKSxcbiAgaHRtbExpbms6IHouc3RyaW5nKCkub3B0aW9uYWwoKS5kZXNjcmliZSgnQSBsaW5rIHRvIHRoZSBldmVudCBpbiBHb29nbGUgQ2FsZW5kYXIuJyksXG4gIGNyZWF0ZWQ6IHouc3RyaW5nKCkub3B0aW9uYWwoKS5kZXNjcmliZSgnVGhlIGNyZWF0aW9uIHRpbWUgb2YgdGhlIGV2ZW50LicpLFxuICB1cGRhdGVkOiB6LnN0cmluZygpLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ1RoZSBsYXN0IG1vZGlmaWNhdGlvbiB0aW1lIG9mIHRoZSBldmVudC4nKSxcbiAgc3RhdHVzOiB6LnN0cmluZygpLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ1RoZSBzdGF0dXMgb2YgdGhlIGV2ZW50LicpLFxuICBjcmVhdG9yOiB6Lm9iamVjdCh7XG4gICAgZW1haWw6IHouc3RyaW5nKCkub3B0aW9uYWwoKSxcbiAgICBkaXNwbGF5TmFtZTogei5zdHJpbmcoKS5vcHRpb25hbCgpXG4gIH0pLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ1RoZSBjcmVhdG9yIG9mIHRoZSBldmVudC4nKSxcbiAgb3JnYW5pemVyOiB6Lm9iamVjdCh7XG4gICAgZW1haWw6IHouc3RyaW5nKCkub3B0aW9uYWwoKSxcbiAgICBkaXNwbGF5TmFtZTogei5zdHJpbmcoKS5vcHRpb25hbCgpXG4gIH0pLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ1RoZSBvcmdhbml6ZXIgb2YgdGhlIGV2ZW50LicpXG59KTtcbmNvbnN0IGFjdGlvbiA9IHtcbiAgdHlwZTogXCJhY3Rpb25cIixcbiAgZGVzY3JpcHRpb246ICdDcmVhdGUgYW4gZXZlbnQgZnJvbSBhIHRleHQgc3RyaW5nJyxcbiAgdmVyc2lvbjogJzEuMC4wJyxcbiAgZW5kcG9pbnQ6IHtcbiAgICBtZXRob2Q6ICdQT1NUJyxcbiAgICBwYXRoOiAnL2FjdGlvbnMvcXVpY2stYWRkLWV2ZW50JyxcbiAgICBncm91cDogJ0V2ZW50cydcbiAgfSxcbiAgaW5wdXQ6IElucHV0U2NoZW1hLFxuICBvdXRwdXQ6IE91dHB1dFNjaGVtYSxcbiAgc2NvcGVzOiBbJ2h0dHBzOi8vd3d3Lmdvb2dsZWFwaXMuY29tL2F1dGgvY2FsZW5kYXIuZXZlbnRzJ10sXG4gIGV4ZWM6IGFzeW5jIChuYW5nbywgaW5wdXQpOiBQcm9taXNlPHouaW5mZXI8dHlwZW9mIE91dHB1dFNjaGVtYT4+ID0+IHtcbiAgICBjb25zdCBjYWxlbmRhcklkID0gaW5wdXQuY2FsZW5kYXJJZCB8fCAncHJpbWFyeSc7XG4gICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBuYW5nby5wb3N0KHtcbiAgICAgIC8vIGh0dHBzOi8vZGV2ZWxvcGVycy5nb29nbGUuY29tL2NhbGVuZGFyL2FwaS92My9yZWZlcmVuY2UvZXZlbnRzL3F1aWNrQWRkXG4gICAgICBlbmRwb2ludDogYC9jYWxlbmRhci92My9jYWxlbmRhcnMvJHtjYWxlbmRhcklkfS9ldmVudHMvcXVpY2tBZGRgLFxuICAgICAgcGFyYW1zOiB7XG4gICAgICAgIHRleHQ6IGlucHV0LnRleHQsXG4gICAgICAgIC4uLihpbnB1dC5zZW5kVXBkYXRlcyAmJiB7XG4gICAgICAgICAgc2VuZFVwZGF0ZXM6IGlucHV0LnNlbmRVcGRhdGVzXG4gICAgICAgIH0pXG4gICAgICB9LFxuICAgICAgcmV0cmllczogM1xuICAgIH0pO1xuICAgIGNvbnN0IGV2ZW50ID0gcmVzcG9uc2UuZGF0YTtcbiAgICByZXR1cm4ge1xuICAgICAgaWQ6IGV2ZW50LmlkLFxuICAgICAgc3VtbWFyeTogZXZlbnQuc3VtbWFyeSA/PyB1bmRlZmluZWQsXG4gICAgICBkZXNjcmlwdGlvbjogZXZlbnQuZGVzY3JpcHRpb24gPz8gdW5kZWZpbmVkLFxuICAgICAgc3RhcnQ6IHtcbiAgICAgICAgZGF0ZVRpbWU6IGV2ZW50LnN0YXJ0Py5kYXRlVGltZSA/PyB1bmRlZmluZWQsXG4gICAgICAgIGRhdGU6IGV2ZW50LnN0YXJ0Py5kYXRlID8/IHVuZGVmaW5lZCxcbiAgICAgICAgdGltZVpvbmU6IGV2ZW50LnN0YXJ0Py50aW1lWm9uZSA/PyB1bmRlZmluZWRcbiAgICAgIH0sXG4gICAgICBlbmQ6IHtcbiAgICAgICAgZGF0ZVRpbWU6IGV2ZW50LmVuZD8uZGF0ZVRpbWUgPz8gdW5kZWZpbmVkLFxuICAgICAgICBkYXRlOiBldmVudC5lbmQ/LmRhdGUgPz8gdW5kZWZpbmVkLFxuICAgICAgICB0aW1lWm9uZTogZXZlbnQuZW5kPy50aW1lWm9uZSA/PyB1bmRlZmluZWRcbiAgICAgIH0sXG4gICAgICBodG1sTGluazogZXZlbnQuaHRtbExpbmsgPz8gdW5kZWZpbmVkLFxuICAgICAgY3JlYXRlZDogZXZlbnQuY3JlYXRlZCA/PyB1bmRlZmluZWQsXG4gICAgICB1cGRhdGVkOiBldmVudC51cGRhdGVkID8/IHVuZGVmaW5lZCxcbiAgICAgIHN0YXR1czogZXZlbnQuc3RhdHVzID8/IHVuZGVmaW5lZCxcbiAgICAgIGNyZWF0b3I6IGV2ZW50LmNyZWF0b3IgPyB7XG4gICAgICAgIGVtYWlsOiBldmVudC5jcmVhdG9yLmVtYWlsID8/IHVuZGVmaW5lZCxcbiAgICAgICAgZGlzcGxheU5hbWU6IGV2ZW50LmNyZWF0b3IuZGlzcGxheU5hbWUgPz8gdW5kZWZpbmVkXG4gICAgICB9IDogdW5kZWZpbmVkLFxuICAgICAgb3JnYW5pemVyOiBldmVudC5vcmdhbml6ZXIgPyB7XG4gICAgICAgIGVtYWlsOiBldmVudC5vcmdhbml6ZXIuZW1haWwgPz8gdW5kZWZpbmVkLFxuICAgICAgICBkaXNwbGF5TmFtZTogZXZlbnQub3JnYW5pemVyLmRpc3BsYXlOYW1lID8/IHVuZGVmaW5lZFxuICAgICAgfSA6IHVuZGVmaW5lZFxuICAgIH07XG4gIH1cbn07XG5leHBvcnQgdHlwZSBOYW5nb0FjdGlvbkxvY2FsID0gUGFyYW1ldGVyczwodHlwZW9mIGFjdGlvbilbJ2V4ZWMnXT5bMF07XG5leHBvcnQgZGVmYXVsdCBhY3Rpb247Il0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsaUJBQWtCO0FBRWxCLElBQU0sY0FBYyxhQUFFLE9BQU87QUFBQSxFQUMzQixZQUFZLGFBQUUsT0FBTyxFQUFFLFNBQVMsRUFBRSxTQUFTLGlGQUFpRjtBQUFBLEVBQzVILE1BQU0sYUFBRSxPQUFPLEVBQUUsU0FBUywyRkFBMkY7QUFBQSxFQUNySCxhQUFhLGFBQUUsS0FBSyxDQUFDLE9BQU8sZ0JBQWdCLE1BQU0sQ0FBQyxFQUFFLFNBQVMsRUFBRSxTQUFTLGdJQUFnSTtBQUMzTSxDQUFDO0FBQ0QsSUFBTSxlQUFlLGFBQUUsT0FBTztBQUFBLEVBQzVCLElBQUksYUFBRSxPQUFPLEVBQUUsU0FBUyw2QkFBNkI7QUFBQSxFQUNyRCxTQUFTLGFBQUUsT0FBTyxFQUFFLFNBQVMsRUFBRSxTQUFTLHlCQUF5QjtBQUFBLEVBQ2pFLGFBQWEsYUFBRSxPQUFPLEVBQUUsU0FBUyxFQUFFLFNBQVMsK0JBQStCO0FBQUEsRUFDM0UsT0FBTyxhQUFFLE9BQU87QUFBQSxJQUNkLFVBQVUsYUFBRSxPQUFPLEVBQUUsU0FBUztBQUFBLElBQzlCLE1BQU0sYUFBRSxPQUFPLEVBQUUsU0FBUztBQUFBLElBQzFCLFVBQVUsYUFBRSxPQUFPLEVBQUUsU0FBUztBQUFBLEVBQ2hDLENBQUMsRUFB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
