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

// google/actions/create-spreadsheet.ts
var create_spreadsheet_exports = {};
__export(create_spreadsheet_exports, {
  default: () => create_spreadsheet_default
});
module.exports = __toCommonJS(create_spreadsheet_exports);
var import_zod = require("zod");
var SheetPropertiesSchema = import_zod.z.object({
  title: import_zod.z.string().optional().describe('Sheet title. Example: "Sheet1"'),
  gridProperties: import_zod.z.object({
    rowCount: import_zod.z.number().optional(),
    columnCount: import_zod.z.number().optional()
  }).optional()
}).passthrough();
var SheetSchema = import_zod.z.object({
  properties: SheetPropertiesSchema.optional()
}).passthrough();
var SpreadsheetPropertiesSchema = import_zod.z.object({
  title: import_zod.z.string().describe('Spreadsheet title. Example: "My New Spreadsheet"'),
  locale: import_zod.z.string().optional().describe('Spreadsheet locale. Example: "en_US"'),
  timeZone: import_zod.z.string().optional().describe('Spreadsheet time zone. Example: "America/New_York"')
}).passthrough();
var InputSchema = import_zod.z.object({
  properties: SpreadsheetPropertiesSchema.describe("Spreadsheet properties including title"),
  sheets: import_zod.z.array(SheetSchema).optional().describe("Array of sheets to create in the spreadsheet")
});
var OutputSchema = import_zod.z.object({
  spreadsheetId: import_zod.z.string().describe("The unique ID of the created spreadsheet"),
  spreadsheetUrl: import_zod.z.string().describe("The URL to view the spreadsheet in Google Sheets"),
  properties: import_zod.z.any().optional()
}).passthrough();
var action = {
  type: "action",
  description: "Create a new spreadsheet",
  version: "1.0.0",
  endpoint: {
    method: "POST",
    path: "/actions/create-spreadsheet",
    group: "Spreadsheets"
  },
  input: InputSchema,
  output: OutputSchema,
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  exec: async (nango, input) => {
    const response = await nango.post({
      baseUrlOverride: "https://sheets.googleapis.com",
      endpoint: "/v4/spreadsheets",
      data: {
        properties: input.properties,
        ...input.sheets && {
          sheets: input.sheets
        }
      },
      retries: 3
    });
    return {
      spreadsheetId: response.data.spreadsheetId,
      spreadsheetUrl: response.data.spreadsheetUrl,
      properties: response.data.properties
    };
  }
};
var create_spreadsheet_default = action;
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiZ29vZ2xlL2FjdGlvbnMvY3JlYXRlLXNwcmVhZHNoZWV0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyJpbXBvcnQgeyB6IH0gZnJvbSAnem9kJztcbmltcG9ydCB7IGNyZWF0ZUFjdGlvbiB9IGZyb20gJ25hbmdvJztcbmNvbnN0IFNoZWV0UHJvcGVydGllc1NjaGVtYSA9IHoub2JqZWN0KHtcbiAgdGl0bGU6IHouc3RyaW5nKCkub3B0aW9uYWwoKS5kZXNjcmliZSgnU2hlZXQgdGl0bGUuIEV4YW1wbGU6IFwiU2hlZXQxXCInKSxcbiAgZ3JpZFByb3BlcnRpZXM6IHoub2JqZWN0KHtcbiAgICByb3dDb3VudDogei5udW1iZXIoKS5vcHRpb25hbCgpLFxuICAgIGNvbHVtbkNvdW50OiB6Lm51bWJlcigpLm9wdGlvbmFsKClcbiAgfSkub3B0aW9uYWwoKVxufSkucGFzc3Rocm91Z2goKTtcbmNvbnN0IFNoZWV0U2NoZW1hID0gei5vYmplY3Qoe1xuICBwcm9wZXJ0aWVzOiBTaGVldFByb3BlcnRpZXNTY2hlbWEub3B0aW9uYWwoKVxufSkucGFzc3Rocm91Z2goKTtcbmNvbnN0IFNwcmVhZHNoZWV0UHJvcGVydGllc1NjaGVtYSA9IHoub2JqZWN0KHtcbiAgdGl0bGU6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ1NwcmVhZHNoZWV0IHRpdGxlLiBFeGFtcGxlOiBcIk15IE5ldyBTcHJlYWRzaGVldFwiJyksXG4gIGxvY2FsZTogei5zdHJpbmcoKS5vcHRpb25hbCgpLmRlc2NyaWJlKCdTcHJlYWRzaGVldCBsb2NhbGUuIEV4YW1wbGU6IFwiZW5fVVNcIicpLFxuICB0aW1lWm9uZTogei5zdHJpbmcoKS5vcHRpb25hbCgpLmRlc2NyaWJlKCdTcHJlYWRzaGVldCB0aW1lIHpvbmUuIEV4YW1wbGU6IFwiQW1lcmljYS9OZXdfWW9ya1wiJylcbn0pLnBhc3N0aHJvdWdoKCk7XG5jb25zdCBJbnB1dFNjaGVtYSA9IHoub2JqZWN0KHtcbiAgcHJvcGVydGllczogU3ByZWFkc2hlZXRQcm9wZXJ0aWVzU2NoZW1hLmRlc2NyaWJlKCdTcHJlYWRzaGVldCBwcm9wZXJ0aWVzIGluY2x1ZGluZyB0aXRsZScpLFxuICBzaGVldHM6IHouYXJyYXkoU2hlZXRTY2hlbWEpLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ0FycmF5IG9mIHNoZWV0cyB0byBjcmVhdGUgaW4gdGhlIHNwcmVhZHNoZWV0Jylcbn0pO1xuY29uc3QgT3V0cHV0U2NoZW1hID0gei5vYmplY3Qoe1xuICBzcHJlYWRzaGVldElkOiB6LnN0cmluZygpLmRlc2NyaWJlKCdUaGUgdW5pcXVlIElEIG9mIHRoZSBjcmVhdGVkIHNwcmVhZHNoZWV0JyksXG4gIHNwcmVhZHNoZWV0VXJsOiB6LnN0cmluZygpLmRlc2NyaWJlKCdUaGUgVVJMIHRvIHZpZXcgdGhlIHNwcmVhZHNoZWV0IGluIEdvb2dsZSBTaGVldHMnKSxcbiAgcHJvcGVydGllczogei5hbnkoKS5vcHRpb25hbCgpXG59KS5wYXNzdGhyb3VnaCgpO1xuY29uc3QgYWN0aW9uID0ge1xuICB0eXBlOiBcImFjdGlvblwiLFxuICBkZXNjcmlwdGlvbjogJ0NyZWF0ZSBhIG5ldyBzcHJlYWRzaGVldCcsXG4gIHZlcnNpb246ICcxLjAuMCcsXG4gIGVuZHBvaW50OiB7XG4gICAgbWV0aG9kOiAnUE9TVCcsXG4gICAgcGF0aDogJy9hY3Rpb25zL2NyZWF0ZS1zcHJlYWRzaGVldCcsXG4gICAgZ3JvdXA6ICdTcHJlYWRzaGVldHMnXG4gIH0sXG4gIGlucHV0OiBJbnB1dFNjaGVtYSxcbiAgb3V0cHV0OiBPdXRwdXRTY2hlbWEsXG4gIHNjb3BlczogWydodHRwczovL3d3dy5nb29nbGVhcGlzLmNvbS9hdXRoL3NwcmVhZHNoZWV0cyddLFxuICBleGVjOiBhc3luYyAobmFuZ28sIGlucHV0KTogUHJvbWlzZTx6LmluZmVyPHR5cGVvZiBPdXRwdXRTY2hlbWE+PiA9PiB7XG4gICAgLy8gaHR0cHM6Ly9kZXZlbG9wZXJzLmdvb2dsZS5jb20vc2hlZXRzL2FwaS9yZWZlcmVuY2UvcmVzdC92NC9zcHJlYWRzaGVldHMvY3JlYXRlXG4gICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBuYW5nby5wb3N0KHtcbiAgICAgIGVuZHBvaW50OiAnL3Y0L3NwcmVhZHNoZWV0cycsXG4gICAgICBkYXRhOiB7XG4gICAgICAgIHByb3BlcnRpZXM6IGlucHV0LnByb3BlcnRpZXMsXG4gICAgICAgIC4uLihpbnB1dC5zaGVldHMgJiYge1xuICAgICAgICAgIHNoZWV0czogaW5wdXQuc2hlZXRzXG4gICAgICAgIH0pXG4gICAgICB9LFxuICAgICAgcmV0cmllczogM1xuICAgIH0pO1xuICAgIHJldHVybiB7XG4gICAgICBzcHJlYWRzaGVldElkOiByZXNwb25zZS5kYXRhLnNwcmVhZHNoZWV0SWQsXG4gICAgICBzcHJlYWRzaGVldFVybDogcmVzcG9uc2UuZGF0YS5zcHJlYWRzaGVldFVybCxcbiAgICAgIHByb3BlcnRpZXM6IHJlc3BvbnNlLmRhdGEucHJvcGVydGllc1xuICAgIH07XG4gIH1cbn07XG5leHBvcnQgdHlwZSBOYW5nb0FjdGlvbkxvY2FsID0gUGFyYW1ldGVyczwodHlwZW9mIGFjdGlvbilbJ2V4ZWMnXT5bMF07XG5leHBvcnQgZGVmYXVsdCBhY3Rpb247Il0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsaUJBQWtCO0FBRWxCLElBQU0sd0JBQXdCLGFBQUUsT0FBTztBQUFBLEVBQ3JDLE9BQU8sYUFBRSxPQUFPLEVBQUUsU0FBUyxFQUFFLFNBQVMsZ0NBQWdDO0FBQUEsRUFDdEUsZ0JBQWdCLGFBQUUsT0FBTztBQUFBLElBQ3ZCLFVBQVUsYUFBRSxPQUFPLEVBQUUsU0FBUztBQUFBLElBQzlCLGFBQWEsYUFBRSxPQUFPLEVBQUUsU0FBUztBQUFBLEVBQ25DLENBQUMsRUFBRSxTQUFTO0FBQ2QsQ0FBQyxFQUFFLFlBQVk7QUFDZixJQUFNLGNBQWMsYUFBRSxPQUFPO0FBQUEsRUFDM0IsWUFBWSxzQkFBc0IsU0FBUztBQUM3QyxDQUFDLEVBQUUsWUFBWTtBQUNmLElBQU0sOEJBQThCLGFBQUUsT0FBTztBQUFBLEVBQzNDLE9BQU8sYUFBRSxPQUFPLEVBQUUsU0FBUyxrREFBa0Q7QUFBQSxFQUM3RSxRQUFRLGFBQUUsT0FBTyxFQUFFLFNBQVMsRUFBRSxTQUFTLHNDQUFzQztBQUFBLEVBQzdFLFVBQVUsYUFBRSxPQUFPLEVBQUUsU0FBUyxFQUFFLFNBQVMsb0RBQW9EO0FBQy9GLENBQUMsRUFBRSxZQUFZO0FBQ2YsSUFBTSxjQUFjLGFBQUUsT0FBTztBQUFBLEVBQzNCLFlBQVksNEJBQTRCLFNBQVMsd0NBQXdDO0FBQUEsRUFDekYsUUFBUSxhQUFFLE1BQU0sV0FBVyxFQUFFLFNBQVMsRUFBRSxTQUFTLDhDQUE4QztBQUNqRyxDQUFDO0FBQ0QsSUFBTSxlQUFlLGFBQUUsT0FBTztBQUFBLEVBQzVCLGVBQWUsYUFBRSxPQUFPLEVBQUUsU0FBUywwQ0FBMEM7QUFBQSxFQUM3RSxnQkFBZ0IsYUFBRSxPQUFPLEVBQUUsU0FBUyxrREFBa0Q7QUFBQSxFQUN0RixZQUFZLGFBQUUsSUFBSSxFQUFFLFNBQVM7QUFDL0IsQ0FBQyxFQUFFLFlBQVk7QUFDZixJQUFNLFNBQVM7QUFBQSxFQUNiLE1BQU07QUFBQSxFQUNOLGFBQWE7QUFBQSxFQUNiLFNBQVM7QUFBQSxFQUNULFVBQVU7QUFBQSxJQUNSLFFBQVE7QUFBQSxJQUNSLE1BQU07QUFBQSxJQUNOLE9BQU87QUFBQSxFQUNUO0FBQUEsRUFDQSxPQUFPO0FBQUEsRUFDUCxRQUFRO0FBQUEsRUFDUixRQUFRLENBQUMsOENBQThDO0FBQUEsRUFDdkQsTUFBTSxPQUFPLE9BQU8sVUFBaUQ7QUFFbkUsVUFBTSxXQUFXLE1BQU0sTUFBTSxLQUFLO0FBQUEsTUFDaEMsVUFBVTtBQUFBLE1BQ1YsTUFBTTtBQUFBLFFBQ0osWUFBWSxNQUFNO0FBQUEsUUFDbEIsR0FBSSxNQUFNLFVBQVU7QUFBQSxVQUNsQixRQUFRLE1BQU07QUFBQSxRQUNoQjtBQUFBLE1BQ0Y7QUFBQSxNQUNBLFNBQVM7QUFBQSxJQUNYLENBQUM7QUFDRCxXQUFPO0FBQUEsTUFDTCxlQUFlLFNBQVMsS0FBSztBQUFBLE1BQzdCLGdCQUFnQixTQUFTLEtBQUs7QUFBQSxNQUM5QixZQUFZLFNBQVMsS0FBSztBQUFBLElBQzVCO0FBQUEsRUFDRjtBQUNGO0FBRUEsSUFBTyw2QkFBUTsiLAogICJuYW1lcyI6IFtdCn0K
