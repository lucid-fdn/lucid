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

// google/actions/fetch-attachment.ts
var fetch_attachment_exports = {};
__export(fetch_attachment_exports, {
  default: () => fetch_attachment_default
});
module.exports = __toCommonJS(fetch_attachment_exports);
var import_zod = require("zod");
var InputSchema = import_zod.z.object({
  messageId: import_zod.z.string().describe("The ID of the message containing the attachment"),
  attachmentId: import_zod.z.string().describe("The ID of the attachment to fetch")
});
var OutputSchema = import_zod.z.object({
  data: import_zod.z.string().describe("Base64-encoded attachment content"),
  size: import_zod.z.number().optional().describe("Attachment size in bytes")
});
var action = {
  type: "action",
  description: "Fetch the content of a Gmail attachment",
  version: "1.0.0",
  endpoint: {
    method: "GET",
    path: "/gmail/attachment",
    group: "Gmail"
  },
  input: InputSchema,
  output: OutputSchema,
  scopes: ["https://www.googleapis.com/auth/gmail.readonly"],
  exec: async (nango, input) => {
    const response = await nango.get({
      endpoint: `/gmail/v1/users/me/messages/${input.messageId}/attachments/${input.attachmentId}`,
      retries: 3
    });
    return {
      data: response.data.data,
      size: response.data.size ?? void 0
    };
  }
};
var fetch_attachment_default = action;
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiZ29vZ2xlL2FjdGlvbnMvZmV0Y2gtYXR0YWNobWVudC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiaW1wb3J0IHsgeiB9IGZyb20gJ3pvZCc7XG5pbXBvcnQgeyBjcmVhdGVBY3Rpb24gfSBmcm9tICduYW5nbyc7XG5jb25zdCBJbnB1dFNjaGVtYSA9IHoub2JqZWN0KHtcbiAgbWVzc2FnZUlkOiB6LnN0cmluZygpLmRlc2NyaWJlKCdUaGUgSUQgb2YgdGhlIG1lc3NhZ2UgY29udGFpbmluZyB0aGUgYXR0YWNobWVudCcpLFxuICBhdHRhY2htZW50SWQ6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ1RoZSBJRCBvZiB0aGUgYXR0YWNobWVudCB0byBmZXRjaCcpXG59KTtcbmNvbnN0IE91dHB1dFNjaGVtYSA9IHoub2JqZWN0KHtcbiAgZGF0YTogei5zdHJpbmcoKS5kZXNjcmliZSgnQmFzZTY0LWVuY29kZWQgYXR0YWNobWVudCBjb250ZW50JyksXG4gIHNpemU6IHoubnVtYmVyKCkub3B0aW9uYWwoKS5kZXNjcmliZSgnQXR0YWNobWVudCBzaXplIGluIGJ5dGVzJylcbn0pO1xuY29uc3QgYWN0aW9uID0ge1xuICB0eXBlOiBcImFjdGlvblwiLFxuICBkZXNjcmlwdGlvbjogJ0ZldGNoIHRoZSBjb250ZW50IG9mIGEgR21haWwgYXR0YWNobWVudCcsXG4gIHZlcnNpb246ICcxLjAuMCcsXG4gIGVuZHBvaW50OiB7XG4gICAgbWV0aG9kOiAnR0VUJyxcbiAgICBwYXRoOiAnL2dtYWlsL2F0dGFjaG1lbnQnLFxuICAgIGdyb3VwOiAnR21haWwnXG4gIH0sXG4gIGlucHV0OiBJbnB1dFNjaGVtYSxcbiAgb3V0cHV0OiBPdXRwdXRTY2hlbWEsXG4gIHNjb3BlczogWydodHRwczovL3d3dy5nb29nbGVhcGlzLmNvbS9hdXRoL2dtYWlsLnJlYWRvbmx5J10sXG4gIGV4ZWM6IGFzeW5jIChuYW5nbywgaW5wdXQpOiBQcm9taXNlPHouaW5mZXI8dHlwZW9mIE91dHB1dFNjaGVtYT4+ID0+IHtcbiAgICAvLyBodHRwczovL2RldmVsb3BlcnMuZ29vZ2xlLmNvbS9nbWFpbC9hcGkvcmVmZXJlbmNlL3Jlc3QvdjEvdXNlcnMubWVzc2FnZXMuYXR0YWNobWVudHMvZ2V0XG4gICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBuYW5nby5nZXQoe1xuICAgICAgZW5kcG9pbnQ6IGAvZ21haWwvdjEvdXNlcnMvbWUvbWVzc2FnZXMvJHtpbnB1dC5tZXNzYWdlSWR9L2F0dGFjaG1lbnRzLyR7aW5wdXQuYXR0YWNobWVudElkfWAsXG4gICAgICByZXRyaWVzOiAzXG4gICAgfSk7XG4gICAgcmV0dXJuIHtcbiAgICAgIGRhdGE6IHJlc3BvbnNlLmRhdGEuZGF0YSxcbiAgICAgIHNpemU6IHJlc3BvbnNlLmRhdGEuc2l6ZSA/PyB1bmRlZmluZWRcbiAgICB9O1xuICB9XG59O1xuZXhwb3J0IHR5cGUgTmFuZ29BY3Rpb25Mb2NhbCA9IFBhcmFtZXRlcnM8KHR5cGVvZiBhY3Rpb24pWydleGVjJ10+WzBdO1xuZXhwb3J0IGRlZmF1bHQgYWN0aW9uOyJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLGlCQUFrQjtBQUVsQixJQUFNLGNBQWMsYUFBRSxPQUFPO0FBQUEsRUFDM0IsV0FBVyxhQUFFLE9BQU8sRUFBRSxTQUFTLGlEQUFpRDtBQUFBLEVBQ2hGLGNBQWMsYUFBRSxPQUFPLEVBQUUsU0FBUyxtQ0FBbUM7QUFDdkUsQ0FBQztBQUNELElBQU0sZUFBZSxhQUFFLE9BQU87QUFBQSxFQUM1QixNQUFNLGFBQUUsT0FBTyxFQUFFLFNBQVMsbUNBQW1DO0FBQUEsRUFDN0QsTUFBTSxhQUFFLE9BQU8sRUFBRSxTQUFTLEVBQUUsU0FBUywwQkFBMEI7QUFDakUsQ0FBQztBQUNELElBQU0sU0FBUztBQUFBLEVBQ2IsTUFBTTtBQUFBLEVBQ04sYUFBYTtBQUFBLEVBQ2IsU0FBUztBQUFBLEVBQ1QsVUFBVTtBQUFBLElBQ1IsUUFBUTtBQUFBLElBQ1IsTUFBTTtBQUFBLElBQ04sT0FBTztBQUFBLEVBQ1Q7QUFBQSxFQUNBLE9BQU87QUFBQSxFQUNQLFFBQVE7QUFBQSxFQUNSLFFBQVEsQ0FBQyxnREFBZ0Q7QUFBQSxFQUN6RCxNQUFNLE9BQU8sT0FBTyxVQUFpRDtBQUVuRSxVQUFNLFdBQVcsTUFBTSxNQUFNLElBQUk7QUFBQSxNQUMvQixVQUFVLCtCQUErQixNQUFNLFNBQVMsZ0JBQWdCLE1BQU0sWUFBWTtBQUFBLE1BQzFGLFNBQVM7QUFBQSxJQUNYLENBQUM7QUFDRCxXQUFPO0FBQUEsTUFDTCxNQUFNLFNBQVMsS0FBSztBQUFBLE1BQ3BCLE1BQU0sU0FBUyxLQUFLLFFBQVE7QUFBQSxJQUM5QjtBQUFBLEVBQ0Y7QUFDRjtBQUVBLElBQU8sMkJBQVE7IiwKICAibmFtZXMiOiBbXQp9Cg==
