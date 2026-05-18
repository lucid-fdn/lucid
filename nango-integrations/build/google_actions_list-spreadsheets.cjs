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

// google/actions/list-spreadsheets.ts
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiZ29vZ2xlL2FjdGlvbnMvbGlzdC1zcHJlYWRzaGVldHMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImltcG9ydCB7IGNyZWF0ZUFjdGlvbiB9IGZyb20gJ25hbmdvJztcbmltcG9ydCAqIGFzIHogZnJvbSAnem9kJztcbmNvbnN0IGlucHV0U2NoZW1hID0gei5vYmplY3Qoe1xuICBxdWVyeTogei5zdHJpbmcoKS5vcHRpb25hbCgpLmRlc2NyaWJlKCdTZWFyY2ggcXVlcnkgdG8gZmlsdGVyIHNwcmVhZHNoZWV0cyBieSBuYW1lJyksXG4gIHBhZ2Vfc2l6ZTogei5udW1iZXIoKS5taW4oMSkubWF4KDUwKS5vcHRpb25hbCgpLmRlc2NyaWJlKCdNYXggcmVzdWx0cyAoMS01MCwgZGVmYXVsdCAxMCknKVxufSk7XG5jb25zdCBzcHJlYWRzaGVldFNjaGVtYSA9IHoub2JqZWN0KHtcbiAgaWQ6IHouc3RyaW5nKCksXG4gIG5hbWU6IHouc3RyaW5nKCksXG4gIHVybDogei5zdHJpbmcoKS5vcHRpb25hbCgpLFxuICBjcmVhdGVkX3RpbWU6IHouc3RyaW5nKCkub3B0aW9uYWwoKSxcbiAgbW9kaWZpZWRfdGltZTogei5zdHJpbmcoKS5vcHRpb25hbCgpXG59KTtcbmNvbnN0IG91dHB1dFNjaGVtYSA9IHoub2JqZWN0KHtcbiAgc3ByZWFkc2hlZXRzOiB6LmFycmF5KHNwcmVhZHNoZWV0U2NoZW1hKSxcbiAgdG90YWw6IHoubnVtYmVyKClcbn0pO1xuY29uc3QgYWN0aW9uID0ge1xuICB0eXBlOiBcImFjdGlvblwiLFxuICBkZXNjcmlwdGlvbjogJ0xpc3QgR29vZ2xlIFNoZWV0cyBzcHJlYWRzaGVldHMgYWNjZXNzaWJsZSB0byB0aGUgdXNlcicsXG4gIHZlcnNpb246ICcxLjAuMCcsXG4gIGVuZHBvaW50OiB7XG4gICAgbWV0aG9kOiAnR0VUJyxcbiAgICBwYXRoOiAnL2dvb2dsZS1zaGVldHMvc3ByZWFkc2hlZXRzJyxcbiAgICBncm91cDogJ1NwcmVhZHNoZWV0cydcbiAgfSxcbiAgaW5wdXQ6IGlucHV0U2NoZW1hLFxuICBvdXRwdXQ6IG91dHB1dFNjaGVtYSxcbiAgZXhlYzogYXN5bmMgKG5hbmdvLCBpbnB1dCkgPT4ge1xuICAgIGxldCBxID0gXCJtaW1lVHlwZT0nYXBwbGljYXRpb24vdm5kLmdvb2dsZS1hcHBzLnNwcmVhZHNoZWV0J1wiO1xuICAgIGlmIChpbnB1dC5xdWVyeSkge1xuICAgICAgcSArPSBgIGFuZCBuYW1lIGNvbnRhaW5zICcke2lucHV0LnF1ZXJ5LnJlcGxhY2UoLycvZywgXCJcXFxcJ1wiKX0nYDtcbiAgICB9XG4gICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBuYW5nby5wcm94eSh7XG4gICAgICBiYXNlVXJsT3ZlcnJpZGU6ICdodHRwczovL3d3dy5nb29nbGVhcGlzLmNvbScsXG4gICAgICBtZXRob2Q6ICdHRVQnLFxuICAgICAgZW5kcG9pbnQ6ICcvZHJpdmUvdjMvZmlsZXMnLFxuICAgICAgcGFyYW1zOiB7XG4gICAgICAgIHEsXG4gICAgICAgIHBhZ2VTaXplOiBTdHJpbmcoaW5wdXQucGFnZV9zaXplID8/IDEwKSxcbiAgICAgICAgZmllbGRzOiAnZmlsZXMoaWQsbmFtZSx3ZWJWaWV3TGluayxjcmVhdGVkVGltZSxtb2RpZmllZFRpbWUpJyxcbiAgICAgICAgb3JkZXJCeTogJ21vZGlmaWVkVGltZSBkZXNjJ1xuICAgICAgfVxuICAgIH0pO1xuICAgIGlmIChyZXNwb25zZS5kYXRhPy5lcnJvcikge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKGBHb29nbGUgRHJpdmUgZXJyb3I6ICR7cmVzcG9uc2UuZGF0YS5lcnJvci5tZXNzYWdlfWApO1xuICAgIH1cblxuICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tZXhwbGljaXQtYW55XG4gICAgY29uc3QgZmlsZXMgPSAocmVzcG9uc2UuZGF0YT8uZmlsZXMgfHwgW10pLm1hcCgoZjogYW55KSA9PiAoe1xuICAgICAgaWQ6IGYuaWQsXG4gICAgICBuYW1lOiBmLm5hbWUsXG4gICAgICB1cmw6IGYud2ViVmlld0xpbmssXG4gICAgICBjcmVhdGVkX3RpbWU6IGYuY3JlYXRlZFRpbWUsXG4gICAgICBtb2RpZmllZF90aW1lOiBmLm1vZGlmaWVkVGltZVxuICAgIH0pKTtcbiAgICByZXR1cm4ge1xuICAgICAgc3ByZWFkc2hlZXRzOiBmaWxlcyxcbiAgICAgIHRvdGFsOiBmaWxlcy5sZW5ndGhcbiAgICB9O1xuICB9XG59O1xuZXhwb3J0IGRlZmF1bHQgYWN0aW9uOyJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFDQSxRQUFtQjtBQUNuQixJQUFNLGNBQWdCLFNBQU87QUFBQSxFQUMzQixPQUFTLFNBQU8sRUFBRSxTQUFTLEVBQUUsU0FBUyw2Q0FBNkM7QUFBQSxFQUNuRixXQUFhLFNBQU8sRUFBRSxJQUFJLENBQUMsRUFBRSxJQUFJLEVBQUUsRUFBRSxTQUFTLEVBQUUsU0FBUyxnQ0FBZ0M7QUFDM0YsQ0FBQztBQUNELElBQU0sb0JBQXNCLFNBQU87QUFBQSxFQUNqQyxJQUFNLFNBQU87QUFBQSxFQUNiLE1BQVEsU0FBTztBQUFBLEVBQ2YsS0FBTyxTQUFPLEVBQUUsU0FBUztBQUFBLEVBQ3pCLGNBQWdCLFNBQU8sRUFBRSxTQUFTO0FBQUEsRUFDbEMsZUFBaUIsU0FBTyxFQUFFLFNBQVM7QUFDckMsQ0FBQztBQUNELElBQU0sZUFBaUIsU0FBTztBQUFBLEVBQzVCLGNBQWdCLFFBQU0saUJBQWlCO0FBQUEsRUFDdkMsT0FBUyxTQUFPO0FBQ2xCLENBQUM7QUFDRCxJQUFNLFNBQVM7QUFBQSxFQUNiLE1BQU07QUFBQSxFQUNOLGFBQWE7QUFBQSxFQUNiLFNBQVM7QUFBQSxFQUNULFVBQVU7QUFBQSxJQUNSLFFBQVE7QUFBQSxJQUNSLE1BQU07QUFBQSxJQUNOLE9BQU87QUFBQSxFQUNUO0FBQUEsRUFDQSxPQUFPO0FBQUEsRUFDUCxRQUFRO0FBQUEsRUFDUixNQUFNLE9BQU8sT0FBTyxVQUFVO0FBQzVCLFFBQUksSUFBSTtBQUNSLFFBQUksTUFBTSxPQUFPO0FBQ2YsV0FBSyx1QkFBdUIsTUFBTSxNQUFNLFFBQVEsTUFBTSxLQUFLLENBQUM7QUFBQSxJQUM5RDtBQUNBLFVBQU0sV0FBVyxNQUFNLE1BQU0sTUFBTTtBQUFBLE1BQ2pDLGlCQUFpQjtBQUFBLE1BQ2pCLFFBQVE7QUFBQSxNQUNSLFVBQVU7QUFBQSxNQUNWLFFBQVE7QUFBQSxRQUNOO0FBQUEsUUFDQSxVQUFVLE9BQU8sTUFBTSxhQUFhLEVBQUU7QUFBQSxRQUN0QyxRQUFRO0FBQUEsUUFDUixTQUFTO0FBQUEsTUFDWDtBQUFBLElBQ0YsQ0FBQztBQUNELFFBQUksU0FBUyxNQUFNLE9BQU87QUFDeEIsWUFBTSxJQUFJLE1BQU0sdUJBQXVCLFNBQVMsS0FBSyxNQUFNLE9BQU8sRUFBRTtBQUFBLElBQ3RFO0FBR0EsVUFBTSxTQUFTLFNBQVMsTUFBTSxTQUFTLENBQUMsR0FBRyxJQUFJLENBQUMsT0FBWTtBQUFBLE1BQzFELElBQUksRUFBRTtBQUFBLE1BQ04sTUFBTSxFQUFFO0FBQUEsTUFDUixLQUFLLEVBQUU7QUFBQSxNQUNQLGNBQWMsRUFBRTtBQUFBLE1BQ2hCLGVBQWUsRUFBRTtBQUFBLElBQ25CLEVBQUU7QUFDRixXQUFPO0FBQUEsTUFDTCxjQUFjO0FBQUEsTUFDZCxPQUFPLE1BQU07QUFBQSxJQUNmO0FBQUEsRUFDRjtBQUNGO0FBQ0EsSUFBTyw0QkFBUTsiLAogICJuYW1lcyI6IFtdCn0K
