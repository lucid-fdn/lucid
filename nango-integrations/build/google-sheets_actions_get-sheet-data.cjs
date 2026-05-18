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

// google-sheets/actions/get-sheet-data.ts
var get_sheet_data_exports = {};
__export(get_sheet_data_exports, {
  default: () => get_sheet_data_default
});
module.exports = __toCommonJS(get_sheet_data_exports);
var z = __toESM(require("zod"), 1);
var inputSchema = z.object({
  spreadsheet_id: z.string().describe("The Google Sheets spreadsheet ID"),
  range: z.string().optional().describe('A1 notation range (e.g. "Sheet1!A1:D10"). Defaults to first sheet.'),
  include_headers: z.boolean().optional().describe("Treat first row as headers (default: true)")
});
var outputSchema = z.object({
  spreadsheet_id: z.string(),
  range: z.string(),
  headers: z.array(z.string()).optional(),
  rows: z.array(z.array(z.unknown())),
  total_rows: z.number()
});
var action = {
  type: "action",
  description: "Read data from a Google Sheets spreadsheet",
  version: "1.0.0",
  endpoint: {
    method: "GET",
    path: "/google-sheets/data",
    group: "Data"
  },
  input: inputSchema,
  output: outputSchema,
  exec: async (nango, input) => {
    const range = input.range || "Sheet1";
    const response = await nango.proxy({
      baseUrlOverride: "https://sheets.googleapis.com",
      method: "GET",
      endpoint: `/v4/spreadsheets/${input.spreadsheet_id}/values/${encodeURIComponent(range)}`,
      params: {
        valueRenderOption: "FORMATTED_VALUE",
        dateTimeRenderOption: "FORMATTED_STRING"
      }
    });
    if (response.data?.error) {
      throw new Error(`Google Sheets error: ${response.data.error.message}`);
    }
    const values = response.data?.values || [];
    const includeHeaders = input.include_headers !== false;
    let headers;
    let rows = values;
    if (includeHeaders && values.length > 0) {
      headers = values[0].map(String);
      rows = values.slice(1);
    }
    return {
      spreadsheet_id: input.spreadsheet_id,
      range: response.data?.range || range,
      headers,
      rows,
      total_rows: rows.length
    };
  }
};
var get_sheet_data_default = action;
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiZ29vZ2xlLXNoZWV0cy9hY3Rpb25zL2dldC1zaGVldC1kYXRhLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyJpbXBvcnQgeyBjcmVhdGVBY3Rpb24gfSBmcm9tICduYW5nbyc7XG5pbXBvcnQgKiBhcyB6IGZyb20gJ3pvZCc7XG5jb25zdCBpbnB1dFNjaGVtYSA9IHoub2JqZWN0KHtcbiAgc3ByZWFkc2hlZXRfaWQ6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ1RoZSBHb29nbGUgU2hlZXRzIHNwcmVhZHNoZWV0IElEJyksXG4gIHJhbmdlOiB6LnN0cmluZygpLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ0ExIG5vdGF0aW9uIHJhbmdlIChlLmcuIFwiU2hlZXQxIUExOkQxMFwiKS4gRGVmYXVsdHMgdG8gZmlyc3Qgc2hlZXQuJyksXG4gIGluY2x1ZGVfaGVhZGVyczogei5ib29sZWFuKCkub3B0aW9uYWwoKS5kZXNjcmliZSgnVHJlYXQgZmlyc3Qgcm93IGFzIGhlYWRlcnMgKGRlZmF1bHQ6IHRydWUpJylcbn0pO1xuY29uc3Qgb3V0cHV0U2NoZW1hID0gei5vYmplY3Qoe1xuICBzcHJlYWRzaGVldF9pZDogei5zdHJpbmcoKSxcbiAgcmFuZ2U6IHouc3RyaW5nKCksXG4gIGhlYWRlcnM6IHouYXJyYXkoei5zdHJpbmcoKSkub3B0aW9uYWwoKSxcbiAgcm93czogei5hcnJheSh6LmFycmF5KHoudW5rbm93bigpKSksXG4gIHRvdGFsX3Jvd3M6IHoubnVtYmVyKClcbn0pO1xuY29uc3QgYWN0aW9uID0ge1xuICB0eXBlOiBcImFjdGlvblwiLFxuICBkZXNjcmlwdGlvbjogJ1JlYWQgZGF0YSBmcm9tIGEgR29vZ2xlIFNoZWV0cyBzcHJlYWRzaGVldCcsXG4gIHZlcnNpb246ICcxLjAuMCcsXG4gIGVuZHBvaW50OiB7XG4gICAgbWV0aG9kOiAnR0VUJyxcbiAgICBwYXRoOiAnL2dvb2dsZS1zaGVldHMvZGF0YScsXG4gICAgZ3JvdXA6ICdEYXRhJ1xuICB9LFxuICBpbnB1dDogaW5wdXRTY2hlbWEsXG4gIG91dHB1dDogb3V0cHV0U2NoZW1hLFxuICBleGVjOiBhc3luYyAobmFuZ28sIGlucHV0KSA9PiB7XG4gICAgY29uc3QgcmFuZ2UgPSBpbnB1dC5yYW5nZSB8fCAnU2hlZXQxJztcbiAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IG5hbmdvLnByb3h5KHtcbiAgICAgIGJhc2VVcmxPdmVycmlkZTogJ2h0dHBzOi8vc2hlZXRzLmdvb2dsZWFwaXMuY29tJyxcbiAgICAgIG1ldGhvZDogJ0dFVCcsXG4gICAgICBlbmRwb2ludDogYC92NC9zcHJlYWRzaGVldHMvJHtpbnB1dC5zcHJlYWRzaGVldF9pZH0vdmFsdWVzLyR7ZW5jb2RlVVJJQ29tcG9uZW50KHJhbmdlKX1gLFxuICAgICAgcGFyYW1zOiB7XG4gICAgICAgIHZhbHVlUmVuZGVyT3B0aW9uOiAnRk9STUFUVEVEX1ZBTFVFJyxcbiAgICAgICAgZGF0ZVRpbWVSZW5kZXJPcHRpb246ICdGT1JNQVRURURfU1RSSU5HJ1xuICAgICAgfVxuICAgIH0pO1xuICAgIGlmIChyZXNwb25zZS5kYXRhPy5lcnJvcikge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKGBHb29nbGUgU2hlZXRzIGVycm9yOiAke3Jlc3BvbnNlLmRhdGEuZXJyb3IubWVzc2FnZX1gKTtcbiAgICB9XG4gICAgY29uc3QgdmFsdWVzOiB1bmtub3duW11bXSA9IHJlc3BvbnNlLmRhdGE/LnZhbHVlcyB8fCBbXTtcbiAgICBjb25zdCBpbmNsdWRlSGVhZGVycyA9IGlucHV0LmluY2x1ZGVfaGVhZGVycyAhPT0gZmFsc2U7XG4gICAgbGV0IGhlYWRlcnM6IHN0cmluZ1tdIHwgdW5kZWZpbmVkO1xuICAgIGxldCByb3dzID0gdmFsdWVzO1xuICAgIGlmIChpbmNsdWRlSGVhZGVycyAmJiB2YWx1ZXMubGVuZ3RoID4gMCkge1xuICAgICAgaGVhZGVycyA9ICh2YWx1ZXNbMF0gYXMgc3RyaW5nW10pLm1hcChTdHJpbmcpO1xuICAgICAgcm93cyA9IHZhbHVlcy5zbGljZSgxKTtcbiAgICB9XG4gICAgcmV0dXJuIHtcbiAgICAgIHNwcmVhZHNoZWV0X2lkOiBpbnB1dC5zcHJlYWRzaGVldF9pZCxcbiAgICAgIHJhbmdlOiByZXNwb25zZS5kYXRhPy5yYW5nZSB8fCByYW5nZSxcbiAgICAgIGhlYWRlcnMsXG4gICAgICByb3dzLFxuICAgICAgdG90YWxfcm93czogcm93cy5sZW5ndGhcbiAgICB9O1xuICB9XG59O1xuZXhwb3J0IGRlZmF1bHQgYWN0aW9uOyJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFDQSxRQUFtQjtBQUNuQixJQUFNLGNBQWdCLFNBQU87QUFBQSxFQUMzQixnQkFBa0IsU0FBTyxFQUFFLFNBQVMsa0NBQWtDO0FBQUEsRUFDdEUsT0FBUyxTQUFPLEVBQUUsU0FBUyxFQUFFLFNBQVMsb0VBQW9FO0FBQUEsRUFDMUcsaUJBQW1CLFVBQVEsRUFBRSxTQUFTLEVBQUUsU0FBUyw0Q0FBNEM7QUFDL0YsQ0FBQztBQUNELElBQU0sZUFBaUIsU0FBTztBQUFBLEVBQzVCLGdCQUFrQixTQUFPO0FBQUEsRUFDekIsT0FBUyxTQUFPO0FBQUEsRUFDaEIsU0FBVyxRQUFRLFNBQU8sQ0FBQyxFQUFFLFNBQVM7QUFBQSxFQUN0QyxNQUFRLFFBQVEsUUFBUSxVQUFRLENBQUMsQ0FBQztBQUFBLEVBQ2xDLFlBQWMsU0FBTztBQUN2QixDQUFDO0FBQ0QsSUFBTSxTQUFTO0FBQUEsRUFDYixNQUFNO0FBQUEsRUFDTixhQUFhO0FBQUEsRUFDYixTQUFTO0FBQUEsRUFDVCxVQUFVO0FBQUEsSUFDUixRQUFRO0FBQUEsSUFDUixNQUFNO0FBQUEsSUFDTixPQUFPO0FBQUEsRUFDVDtBQUFBLEVBQ0EsT0FBTztBQUFBLEVBQ1AsUUFBUTtBQUFBLEVBQ1IsTUFBTSxPQUFPLE9BQU8sVUFBVTtBQUM1QixVQUFNLFFBQVEsTUFBTSxTQUFTO0FBQzdCLFVBQU0sV0FBVyxNQUFNLE1BQU0sTUFBTTtBQUFBLE1BQ2pDLGlCQUFpQjtBQUFBLE1BQ2pCLFFBQVE7QUFBQSxNQUNSLFVBQVUsb0JBQW9CLE1BQU0sY0FBYyxXQUFXLG1CQUFtQixLQUFLLENBQUM7QUFBQSxNQUN0RixRQUFRO0FBQUEsUUFDTixtQkFBbUI7QUFBQSxRQUNuQixzQkFBc0I7QUFBQSxNQUN4QjtBQUFBLElBQ0YsQ0FBQztBQUNELFFBQUksU0FBUyxNQUFNLE9BQU87QUFDeEIsWUFBTSxJQUFJLE1BQU0sd0JBQXdCLFNBQVMsS0FBSyxNQUFNLE9BQU8sRUFBRTtBQUFBLElBQ3ZFO0FBQ0EsVUFBTSxTQUFzQixTQUFTLE1BQU0sVUFBVSxDQUFDO0FBQ3RELFVBQU0saUJBQWlCLE1BQU0sb0JBQW9CO0FBQ2pELFFBQUk7QUFDSixRQUFJLE9BQU87QUFDWCxRQUFJLGtCQUFrQixPQUFPLFNBQVMsR0FBRztBQUN2QyxnQkFBVyxPQUFPLENBQUMsRUFBZSxJQUFJLE1BQU07QUFDNUMsYUFBTyxPQUFPLE1BQU0sQ0FBQztBQUFBLElBQ3ZCO0FBQ0EsV0FBTztBQUFBLE1BQ0wsZ0JBQWdCLE1BQU07QUFBQSxNQUN0QixPQUFPLFNBQVMsTUFBTSxTQUFTO0FBQUEsTUFDL0I7QUFBQSxNQUNBO0FBQUEsTUFDQSxZQUFZLEtBQUs7QUFBQSxJQUNuQjtBQUFBLEVBQ0Y7QUFDRjtBQUNBLElBQU8seUJBQVE7IiwKICAibmFtZXMiOiBbXQp9Cg==
