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

// google-sheets/actions/list-spreadsheets.ts
var list_spreadsheets_exports = {};
__export(list_spreadsheets_exports, {
  default: () => list_spreadsheets_default
});
module.exports = __toCommonJS(list_spreadsheets_exports);
var z = __toESM(require("zod"), 1);
var inputSchema = z.object({
  query: z.string().optional().describe("Search query to filter spreadsheets by name"),
  page_size: z.number().min(1).max(50).optional().describe("Max results (1-50, default 10)")
});
var spreadsheetSchema = z.object({
  id: z.string(),
  name: z.string(),
  url: z.string().optional(),
  created_time: z.string().optional(),
  modified_time: z.string().optional()
});
var outputSchema = z.object({
  spreadsheets: z.array(spreadsheetSchema),
  total: z.number()
});
var action = {
  type: "action",
  description: "List Google Sheets spreadsheets accessible to the user",
  version: "1.0.0",
  endpoint: {
    method: "GET",
    path: "/google-sheets/spreadsheets",
    group: "Spreadsheets"
  },
  input: inputSchema,
  output: outputSchema,
  exec: async (nango, input) => {
    let q = "mimeType='application/vnd.google-apps.spreadsheet'";
    if (input.query) {
      q += ` and name contains '${input.query.replace(/'/g, "\\'")}'`;
    }
    const response = await nango.proxy({
      baseUrlOverride: "https://www.googleapis.com",
      method: "GET",
      endpoint: "/drive/v3/files",
      params: {
        q,
        pageSize: String(input.page_size ?? 10),
        fields: "files(id,name,webViewLink,createdTime,modifiedTime)",
        orderBy: "modifiedTime desc"
      }
    });
    if (response.data?.error) {
      throw new Error(`Google Drive error: ${response.data.error.message}`);
    }
    const files = (response.data?.files || []).map((f) => ({
      id: f.id,
      name: f.name,
      url: f.webViewLink,
      created_time: f.createdTime,
      modified_time: f.modifiedTime
    }));
    return {
      spreadsheets: files,
      total: files.length
    };
  }
};
var list_spreadsheets_default = action;
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiZ29vZ2xlLXNoZWV0cy9hY3Rpb25zL2xpc3Qtc3ByZWFkc2hlZXRzLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyJpbXBvcnQgeyBjcmVhdGVBY3Rpb24gfSBmcm9tICduYW5nbyc7XG5pbXBvcnQgKiBhcyB6IGZyb20gJ3pvZCc7XG5jb25zdCBpbnB1dFNjaGVtYSA9IHoub2JqZWN0KHtcbiAgcXVlcnk6IHouc3RyaW5nKCkub3B0aW9uYWwoKS5kZXNjcmliZSgnU2VhcmNoIHF1ZXJ5IHRvIGZpbHRlciBzcHJlYWRzaGVldHMgYnkgbmFtZScpLFxuICBwYWdlX3NpemU6IHoubnVtYmVyKCkubWluKDEpLm1heCg1MCkub3B0aW9uYWwoKS5kZXNjcmliZSgnTWF4IHJlc3VsdHMgKDEtNTAsIGRlZmF1bHQgMTApJylcbn0pO1xuY29uc3Qgc3ByZWFkc2hlZXRTY2hlbWEgPSB6Lm9iamVjdCh7XG4gIGlkOiB6LnN0cmluZygpLFxuICBuYW1lOiB6LnN0cmluZygpLFxuICB1cmw6IHouc3RyaW5nKCkub3B0aW9uYWwoKSxcbiAgY3JlYXRlZF90aW1lOiB6LnN0cmluZygpLm9wdGlvbmFsKCksXG4gIG1vZGlmaWVkX3RpbWU6IHouc3RyaW5nKCkub3B0aW9uYWwoKVxufSk7XG5jb25zdCBvdXRwdXRTY2hlbWEgPSB6Lm9iamVjdCh7XG4gIHNwcmVhZHNoZWV0czogei5hcnJheShzcHJlYWRzaGVldFNjaGVtYSksXG4gIHRvdGFsOiB6Lm51bWJlcigpXG59KTtcbmNvbnN0IGFjdGlvbiA9IHtcbiAgdHlwZTogXCJhY3Rpb25cIixcbiAgZGVzY3JpcHRpb246ICdMaXN0IEdvb2dsZSBTaGVldHMgc3ByZWFkc2hlZXRzIGFjY2Vzc2libGUgdG8gdGhlIHVzZXInLFxuICB2ZXJzaW9uOiAnMS4wLjAnLFxuICBlbmRwb2ludDoge1xuICAgIG1ldGhvZDogJ0dFVCcsXG4gICAgcGF0aDogJy9nb29nbGUtc2hlZXRzL3NwcmVhZHNoZWV0cycsXG4gICAgZ3JvdXA6ICdTcHJlYWRzaGVldHMnXG4gIH0sXG4gIGlucHV0OiBpbnB1dFNjaGVtYSxcbiAgb3V0cHV0OiBvdXRwdXRTY2hlbWEsXG4gIGV4ZWM6IGFzeW5jIChuYW5nbywgaW5wdXQpID0+IHtcbiAgICBsZXQgcSA9IFwibWltZVR5cGU9J2FwcGxpY2F0aW9uL3ZuZC5nb29nbGUtYXBwcy5zcHJlYWRzaGVldCdcIjtcbiAgICBpZiAoaW5wdXQucXVlcnkpIHtcbiAgICAgIHEgKz0gYCBhbmQgbmFtZSBjb250YWlucyAnJHtpbnB1dC5xdWVyeS5yZXBsYWNlKC8nL2csIFwiXFxcXCdcIil9J2A7XG4gICAgfVxuICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgbmFuZ28ucHJveHkoe1xuICAgICAgYmFzZVVybE92ZXJyaWRlOiAnaHR0cHM6Ly93d3cuZ29vZ2xlYXBpcy5jb20nLFxuICAgICAgbWV0aG9kOiAnR0VUJyxcbiAgICAgIGVuZHBvaW50OiAnL2RyaXZlL3YzL2ZpbGVzJyxcbiAgICAgIHBhcmFtczoge1xuICAgICAgICBxLFxuICAgICAgICBwYWdlU2l6ZTogU3RyaW5nKGlucHV0LnBhZ2Vfc2l6ZSA/PyAxMCksXG4gICAgICAgIGZpZWxkczogJ2ZpbGVzKGlkLG5hbWUsd2ViVmlld0xpbmssY3JlYXRlZFRpbWUsbW9kaWZpZWRUaW1lKScsXG4gICAgICAgIG9yZGVyQnk6ICdtb2RpZmllZFRpbWUgZGVzYydcbiAgICAgIH1cbiAgICB9KTtcbiAgICBpZiAocmVzcG9uc2UuZGF0YT8uZXJyb3IpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihgR29vZ2xlIERyaXZlIGVycm9yOiAke3Jlc3BvbnNlLmRhdGEuZXJyb3IubWVzc2FnZX1gKTtcbiAgICB9XG5cbiAgICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgQHR5cGVzY3JpcHQtZXNsaW50L25vLWV4cGxpY2l0LWFueVxuICAgIGNvbnN0IGZpbGVzID0gKHJlc3BvbnNlLmRhdGE/LmZpbGVzIHx8IFtdKS5tYXAoKGY6IGFueSkgPT4gKHtcbiAgICAgIGlkOiBmLmlkLFxuICAgICAgbmFtZTogZi5uYW1lLFxuICAgICAgdXJsOiBmLndlYlZpZXdMaW5rLFxuICAgICAgY3JlYXRlZF90aW1lOiBmLmNyZWF0ZWRUaW1lLFxuICAgICAgbW9kaWZpZWRfdGltZTogZi5tb2RpZmllZFRpbWVcbiAgICB9KSk7XG4gICAgcmV0dXJuIHtcbiAgICAgIHNwcmVhZHNoZWV0czogZmlsZXMsXG4gICAgICB0b3RhbDogZmlsZXMubGVuZ3RoXG4gICAgfTtcbiAgfVxufTtcbmV4cG9ydCBkZWZhdWx0IGFjdGlvbjsiXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQ0EsUUFBbUI7QUFDbkIsSUFBTSxjQUFnQixTQUFPO0FBQUEsRUFDM0IsT0FBUyxTQUFPLEVBQUUsU0FBUyxFQUFFLFNBQVMsNkNBQTZDO0FBQUEsRUFDbkYsV0FBYSxTQUFPLEVBQUUsSUFBSSxDQUFDLEVBQUUsSUFBSSxFQUFFLEVBQUUsU0FBUyxFQUFFLFNBQVMsZ0NBQWdDO0FBQzNGLENBQUM7QUFDRCxJQUFNLG9CQUFzQixTQUFPO0FBQUEsRUFDakMsSUFBTSxTQUFPO0FBQUEsRUFDYixNQUFRLFNBQU87QUFBQSxFQUNmLEtBQU8sU0FBTyxFQUFFLFNBQVM7QUFBQSxFQUN6QixjQUFnQixTQUFPLEVBQUUsU0FBUztBQUFBLEVBQ2xDLGVBQWlCLFNBQU8sRUFBRSxTQUFTO0FBQ3JDLENBQUM7QUFDRCxJQUFNLGVBQWlCLFNBQU87QUFBQSxFQUM1QixjQUFnQixRQUFNLGlCQUFpQjtBQUFBLEVBQ3ZDLE9BQVMsU0FBTztBQUNsQixDQUFDO0FBQ0QsSUFBTSxTQUFTO0FBQUEsRUFDYixNQUFNO0FBQUEsRUFDTixhQUFhO0FBQUEsRUFDYixTQUFTO0FBQUEsRUFDVCxVQUFVO0FBQUEsSUFDUixRQUFRO0FBQUEsSUFDUixNQUFNO0FBQUEsSUFDTixPQUFPO0FBQUEsRUFDVDtBQUFBLEVBQ0EsT0FBTztBQUFBLEVBQ1AsUUFBUTtBQUFBLEVBQ1IsTUFBTSxPQUFPLE9BQU8sVUFBVTtBQUM1QixRQUFJLElBQUk7QUFDUixRQUFJLE1BQU0sT0FBTztBQUNmLFdBQUssdUJBQXVCLE1BQU0sTUFBTSxRQUFRLE1BQU0sS0FBSyxDQUFDO0FBQUEsSUFDOUQ7QUFDQSxVQUFNLFdBQVcsTUFBTSxNQUFNLE1BQU07QUFBQSxNQUNqQyxpQkFBaUI7QUFBQSxNQUNqQixRQUFRO0FBQUEsTUFDUixVQUFVO0FBQUEsTUFDVixRQUFRO0FBQUEsUUFDTjtBQUFBLFFBQ0EsVUFBVSxPQUFPLE1BQU0sYUFBYSxFQUFFO0FBQUEsUUFDdEMsUUFBUTtBQUFBLFFBQ1IsU0FBUztBQUFBLE1BQ1g7QUFBQSxJQUNGLENBQUM7QUFDRCxRQUFJLFNBQVMsTUFBTSxPQUFPO0FBQ3hCLFlBQU0sSUFBSSxNQUFNLHVCQUF1QixTQUFTLEtBQUssTUFBTSxPQUFPLEVBQUU7QUFBQSxJQUN0RTtBQUdBLFVBQU0sU0FBUyxTQUFTLE1BQU0sU0FBUyxDQUFDLEdBQUcsSUFBSSxDQUFDLE9BQVk7QUFBQSxNQUMxRCxJQUFJLEVBQUU7QUFBQSxNQUNOLE1BQU0sRUFBRTtBQUFBLE1BQ1IsS0FBSyxFQUFFO0FBQUEsTUFDUCxjQUFjLEVBQUU7QUFBQSxNQUNoQixlQUFlLEVBQUU7QUFBQSxJQUNuQixFQUFFO0FBQ0YsV0FBTztBQUFBLE1BQ0wsY0FBYztBQUFBLE1BQ2QsT0FBTyxNQUFNO0FBQUEsSUFDZjtBQUFBLEVBQ0Y7QUFDRjtBQUNBLElBQU8sNEJBQVE7IiwKICAibmFtZXMiOiBbXQp9Cg==
