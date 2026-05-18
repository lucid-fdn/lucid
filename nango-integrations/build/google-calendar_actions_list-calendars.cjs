"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
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
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// google-calendar/actions/list-calendars.ts
var list_calendars_exports = {};
__export(list_calendars_exports, {
  default: () => list_calendars_default
});
module.exports = __toCommonJS(list_calendars_exports);
var z = __toESM(require("zod"), 1);
var inputSchema = z.object({});
var calendarSchema = z.object({
  id: z.string(),
  summary: z.string(),
  description: z.string().optional(),
  timezone: z.string().optional(),
  primary: z.boolean().optional(),
  access_role: z.string().optional()
});
var outputSchema = z.object({
  calendars: z.array(calendarSchema),
  total: z.number()
});
var action = {
  type: "action",
  description: "List all calendars accessible to the user",
  version: "1.0.0",
  endpoint: {
    method: "GET",
    path: "/google-calendar/calendars",
    group: "Calendars"
  },
  input: inputSchema,
  output: outputSchema,
  exec: async (nango) => {
    const response = await nango.proxy({
      baseUrlOverride: "https://www.googleapis.com",
      method: "GET",
      endpoint: "/calendar/v3/users/me/calendarList"
    });
    if (response.data?.error) {
      throw new Error(`Google Calendar error: ${response.data.error.message}`);
    }
    const calendars = (response.data?.items || []).map((c) => ({
      id: c.id,
      summary: c.summary || c.summaryOverride,
      description: c.description,
      timezone: c.timeZone,
      primary: c.primary,
      access_role: c.accessRole
    }));
    return {
      calendars,
      total: calendars.length
    };
  }
};
var list_calendars_default = action;
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiZ29vZ2xlLWNhbGVuZGFyL2FjdGlvbnMvbGlzdC1jYWxlbmRhcnMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImltcG9ydCB7IGNyZWF0ZUFjdGlvbiB9IGZyb20gJ25hbmdvJztcbmltcG9ydCAqIGFzIHogZnJvbSAnem9kJztcbmNvbnN0IGlucHV0U2NoZW1hID0gei5vYmplY3Qoe30pO1xuY29uc3QgY2FsZW5kYXJTY2hlbWEgPSB6Lm9iamVjdCh7XG4gIGlkOiB6LnN0cmluZygpLFxuICBzdW1tYXJ5OiB6LnN0cmluZygpLFxuICBkZXNjcmlwdGlvbjogei5zdHJpbmcoKS5vcHRpb25hbCgpLFxuICB0aW1lem9uZTogei5zdHJpbmcoKS5vcHRpb25hbCgpLFxuICBwcmltYXJ5OiB6LmJvb2xlYW4oKS5vcHRpb25hbCgpLFxuICBhY2Nlc3Nfcm9sZTogei5zdHJpbmcoKS5vcHRpb25hbCgpXG59KTtcbmNvbnN0IG91dHB1dFNjaGVtYSA9IHoub2JqZWN0KHtcbiAgY2FsZW5kYXJzOiB6LmFycmF5KGNhbGVuZGFyU2NoZW1hKSxcbiAgdG90YWw6IHoubnVtYmVyKClcbn0pO1xuY29uc3QgYWN0aW9uID0ge1xuICB0eXBlOiBcImFjdGlvblwiLFxuICBkZXNjcmlwdGlvbjogJ0xpc3QgYWxsIGNhbGVuZGFycyBhY2Nlc3NpYmxlIHRvIHRoZSB1c2VyJyxcbiAgdmVyc2lvbjogJzEuMC4wJyxcbiAgZW5kcG9pbnQ6IHtcbiAgICBtZXRob2Q6ICdHRVQnLFxuICAgIHBhdGg6ICcvZ29vZ2xlLWNhbGVuZGFyL2NhbGVuZGFycycsXG4gICAgZ3JvdXA6ICdDYWxlbmRhcnMnXG4gIH0sXG4gIGlucHV0OiBpbnB1dFNjaGVtYSxcbiAgb3V0cHV0OiBvdXRwdXRTY2hlbWEsXG4gIGV4ZWM6IGFzeW5jIG5hbmdvID0+IHtcbiAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IG5hbmdvLnByb3h5KHtcbiAgICAgIGJhc2VVcmxPdmVycmlkZTogJ2h0dHBzOi8vd3d3Lmdvb2dsZWFwaXMuY29tJyxcbiAgICAgIG1ldGhvZDogJ0dFVCcsXG4gICAgICBlbmRwb2ludDogJy9jYWxlbmRhci92My91c2Vycy9tZS9jYWxlbmRhckxpc3QnXG4gICAgfSk7XG4gICAgaWYgKHJlc3BvbnNlLmRhdGE/LmVycm9yKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoYEdvb2dsZSBDYWxlbmRhciBlcnJvcjogJHtyZXNwb25zZS5kYXRhLmVycm9yLm1lc3NhZ2V9YCk7XG4gICAgfVxuXG4gICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uby1leHBsaWNpdC1hbnlcbiAgICBjb25zdCBjYWxlbmRhcnMgPSAocmVzcG9uc2UuZGF0YT8uaXRlbXMgfHwgW10pLm1hcCgoYzogYW55KSA9PiAoe1xuICAgICAgaWQ6IGMuaWQsXG4gICAgICBzdW1tYXJ5OiBjLnN1bW1hcnkgfHwgYy5zdW1tYXJ5T3ZlcnJpZGUsXG4gICAgICBkZXNjcmlwdGlvbjogYy5kZXNjcmlwdGlvbixcbiAgICAgIHRpbWV6b25lOiBjLnRpbWVab25lLFxuICAgICAgcHJpbWFyeTogYy5wcmltYXJ5LFxuICAgICAgYWNjZXNzX3JvbGU6IGMuYWNjZXNzUm9sZVxuICAgIH0pKTtcbiAgICByZXR1cm4ge1xuICAgICAgY2FsZW5kYXJzLFxuICAgICAgdG90YWw6IGNhbGVuZGFycy5sZW5ndGhcbiAgICB9O1xuICB9XG59O1xuZXhwb3J0IGRlZmF1bHQgYWN0aW9uOyJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFDQSxRQUFtQjtBQUNuQixJQUFNLGNBQWdCLFNBQU8sQ0FBQyxDQUFDO0FBQy9CLElBQU0saUJBQW1CLFNBQU87QUFBQSxFQUM5QixJQUFNLFNBQU87QUFBQSxFQUNiLFNBQVcsU0FBTztBQUFBLEVBQ2xCLGFBQWUsU0FBTyxFQUFFLFNBQVM7QUFBQSxFQUNqQyxVQUFZLFNBQU8sRUFBRSxTQUFTO0FBQUEsRUFDOUIsU0FBVyxVQUFRLEVBQUUsU0FBUztBQUFBLEVBQzlCLGFBQWUsU0FBTyxFQUFFLFNBQVM7QUFDbkMsQ0FBQztBQUNELElBQU0sZUFBaUIsU0FBTztBQUFBLEVBQzVCLFdBQWEsUUFBTSxjQUFjO0FBQUEsRUFDakMsT0FBUyxTQUFPO0FBQ2xCLENBQUM7QUFDRCxJQUFNLFNBQVM7QUFBQSxFQUNiLE1BQU07QUFBQSxFQUNOLGFBQWE7QUFBQSxFQUNiLFNBQVM7QUFBQSxFQUNULFVBQVU7QUFBQSxJQUNSLFFBQVE7QUFBQSxJQUNSLE1BQU07QUFBQSxJQUNOLE9BQU87QUFBQSxFQUNUO0FBQUEsRUFDQSxPQUFPO0FBQUEsRUFDUCxRQUFRO0FBQUEsRUFDUixNQUFNLE9BQU0sVUFBUztBQUNuQixVQUFNLFdBQVcsTUFBTSxNQUFNLE1BQU07QUFBQSxNQUNqQyxpQkFBaUI7QUFBQSxNQUNqQixRQUFRO0FBQUEsTUFDUixVQUFVO0FBQUEsSUFDWixDQUFDO0FBQ0QsUUFBSSxTQUFTLE1BQU0sT0FBTztBQUN4QixZQUFNLElBQUksTUFBTSwwQkFBMEIsU0FBUyxLQUFLLE1BQU0sT0FBTyxFQUFFO0FBQUEsSUFDekU7QUFHQSxVQUFNLGFBQWEsU0FBUyxNQUFNLFNBQVMsQ0FBQyxHQUFHLElBQUksQ0FBQyxPQUFZO0FBQUEsTUFDOUQsSUFBSSxFQUFFO0FBQUEsTUFDTixTQUFTLEVBQUUsV0FBVyxFQUFFO0FBQUEsTUFDeEIsYUFBYSxFQUFFO0FBQUEsTUFDZixVQUFVLEVBQUU7QUFBQSxNQUNaLFNBQVMsRUFBRTtBQUFBLE1BQ1gsYUFBYSxFQUFFO0FBQUEsSUFDakIsRUFBRTtBQUNGLFdBQU87QUFBQSxNQUNMO0FBQUEsTUFDQSxPQUFPLFVBQVU7QUFBQSxJQUNuQjtBQUFBLEVBQ0Y7QUFDRjtBQUNBLElBQU8seUJBQVE7IiwKICAibmFtZXMiOiBbXQp9Cg==
