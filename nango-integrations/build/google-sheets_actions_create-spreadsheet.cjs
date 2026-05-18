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

// google-sheets/actions/create-spreadsheet.ts
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiZ29vZ2xlLXNoZWV0cy9hY3Rpb25zL2NyZWF0ZS1zcHJlYWRzaGVldC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiaW1wb3J0IHsgeiB9IGZyb20gJ3pvZCc7XG5pbXBvcnQgeyBjcmVhdGVBY3Rpb24gfSBmcm9tICduYW5nbyc7XG5jb25zdCBTaGVldFByb3BlcnRpZXNTY2hlbWEgPSB6Lm9iamVjdCh7XG4gIHRpdGxlOiB6LnN0cmluZygpLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ1NoZWV0IHRpdGxlLiBFeGFtcGxlOiBcIlNoZWV0MVwiJyksXG4gIGdyaWRQcm9wZXJ0aWVzOiB6Lm9iamVjdCh7XG4gICAgcm93Q291bnQ6IHoubnVtYmVyKCkub3B0aW9uYWwoKSxcbiAgICBjb2x1bW5Db3VudDogei5udW1iZXIoKS5vcHRpb25hbCgpXG4gIH0pLm9wdGlvbmFsKClcbn0pLnBhc3N0aHJvdWdoKCk7XG5jb25zdCBTaGVldFNjaGVtYSA9IHoub2JqZWN0KHtcbiAgcHJvcGVydGllczogU2hlZXRQcm9wZXJ0aWVzU2NoZW1hLm9wdGlvbmFsKClcbn0pLnBhc3N0aHJvdWdoKCk7XG5jb25zdCBTcHJlYWRzaGVldFByb3BlcnRpZXNTY2hlbWEgPSB6Lm9iamVjdCh7XG4gIHRpdGxlOiB6LnN0cmluZygpLmRlc2NyaWJlKCdTcHJlYWRzaGVldCB0aXRsZS4gRXhhbXBsZTogXCJNeSBOZXcgU3ByZWFkc2hlZXRcIicpLFxuICBsb2NhbGU6IHouc3RyaW5nKCkub3B0aW9uYWwoKS5kZXNjcmliZSgnU3ByZWFkc2hlZXQgbG9jYWxlLiBFeGFtcGxlOiBcImVuX1VTXCInKSxcbiAgdGltZVpvbmU6IHouc3RyaW5nKCkub3B0aW9uYWwoKS5kZXNjcmliZSgnU3ByZWFkc2hlZXQgdGltZSB6b25lLiBFeGFtcGxlOiBcIkFtZXJpY2EvTmV3X1lvcmtcIicpXG59KS5wYXNzdGhyb3VnaCgpO1xuY29uc3QgSW5wdXRTY2hlbWEgPSB6Lm9iamVjdCh7XG4gIHByb3BlcnRpZXM6IFNwcmVhZHNoZWV0UHJvcGVydGllc1NjaGVtYS5kZXNjcmliZSgnU3ByZWFkc2hlZXQgcHJvcGVydGllcyBpbmNsdWRpbmcgdGl0bGUnKSxcbiAgc2hlZXRzOiB6LmFycmF5KFNoZWV0U2NoZW1hKS5vcHRpb25hbCgpLmRlc2NyaWJlKCdBcnJheSBvZiBzaGVldHMgdG8gY3JlYXRlIGluIHRoZSBzcHJlYWRzaGVldCcpXG59KTtcbmNvbnN0IE91dHB1dFNjaGVtYSA9IHoub2JqZWN0KHtcbiAgc3ByZWFkc2hlZXRJZDogei5zdHJpbmcoKS5kZXNjcmliZSgnVGhlIHVuaXF1ZSBJRCBvZiB0aGUgY3JlYXRlZCBzcHJlYWRzaGVldCcpLFxuICBzcHJlYWRzaGVldFVybDogei5zdHJpbmcoKS5kZXNjcmliZSgnVGhlIFVSTCB0byB2aWV3IHRoZSBzcHJlYWRzaGVldCBpbiBHb29nbGUgU2hlZXRzJyksXG4gIHByb3BlcnRpZXM6IHouYW55KCkub3B0aW9uYWwoKVxufSkucGFzc3Rocm91Z2goKTtcbmNvbnN0IGFjdGlvbiA9IHtcbiAgdHlwZTogXCJhY3Rpb25cIixcbiAgZGVzY3JpcHRpb246ICdDcmVhdGUgYSBuZXcgc3ByZWFkc2hlZXQnLFxuICB2ZXJzaW9uOiAnMS4wLjAnLFxuICBlbmRwb2ludDoge1xuICAgIG1ldGhvZDogJ1BPU1QnLFxuICAgIHBhdGg6ICcvYWN0aW9ucy9jcmVhdGUtc3ByZWFkc2hlZXQnLFxuICAgIGdyb3VwOiAnU3ByZWFkc2hlZXRzJ1xuICB9LFxuICBpbnB1dDogSW5wdXRTY2hlbWEsXG4gIG91dHB1dDogT3V0cHV0U2NoZW1hLFxuICBzY29wZXM6IFsnaHR0cHM6Ly93d3cuZ29vZ2xlYXBpcy5jb20vYXV0aC9zcHJlYWRzaGVldHMnXSxcbiAgZXhlYzogYXN5bmMgKG5hbmdvLCBpbnB1dCk6IFByb21pc2U8ei5pbmZlcjx0eXBlb2YgT3V0cHV0U2NoZW1hPj4gPT4ge1xuICAgIC8vIGh0dHBzOi8vZGV2ZWxvcGVycy5nb29nbGUuY29tL3NoZWV0cy9hcGkvcmVmZXJlbmNlL3Jlc3QvdjQvc3ByZWFkc2hlZXRzL2NyZWF0ZVxuICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgbmFuZ28ucG9zdCh7XG4gICAgICBlbmRwb2ludDogJy92NC9zcHJlYWRzaGVldHMnLFxuICAgICAgZGF0YToge1xuICAgICAgICBwcm9wZXJ0aWVzOiBpbnB1dC5wcm9wZXJ0aWVzLFxuICAgICAgICAuLi4oaW5wdXQuc2hlZXRzICYmIHtcbiAgICAgICAgICBzaGVldHM6IGlucHV0LnNoZWV0c1xuICAgICAgICB9KVxuICAgICAgfSxcbiAgICAgIHJldHJpZXM6IDNcbiAgICB9KTtcbiAgICByZXR1cm4ge1xuICAgICAgc3ByZWFkc2hlZXRJZDogcmVzcG9uc2UuZGF0YS5zcHJlYWRzaGVldElkLFxuICAgICAgc3ByZWFkc2hlZXRVcmw6IHJlc3BvbnNlLmRhdGEuc3ByZWFkc2hlZXRVcmwsXG4gICAgICBwcm9wZXJ0aWVzOiByZXNwb25zZS5kYXRhLnByb3BlcnRpZXNcbiAgICB9O1xuICB9XG59O1xuZXhwb3J0IHR5cGUgTmFuZ29BY3Rpb25Mb2NhbCA9IFBhcmFtZXRlcnM8KHR5cGVvZiBhY3Rpb24pWydleGVjJ10+WzBdO1xuZXhwb3J0IGRlZmF1bHQgYWN0aW9uOyJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLGlCQUFrQjtBQUVsQixJQUFNLHdCQUF3QixhQUFFLE9BQU87QUFBQSxFQUNyQyxPQUFPLGFBQUUsT0FBTyxFQUFFLFNBQVMsRUFBRSxTQUFTLGdDQUFnQztBQUFBLEVBQ3RFLGdCQUFnQixhQUFFLE9BQU87QUFBQSxJQUN2QixVQUFVLGFBQUUsT0FBTyxFQUFFLFNBQVM7QUFBQSxJQUM5QixhQUFhLGFBQUUsT0FBTyxFQUFFLFNBQVM7QUFBQSxFQUNuQyxDQUFDLEVBQUUsU0FBUztBQUNkLENBQUMsRUFBRSxZQUFZO0FBQ2YsSUFBTSxjQUFjLGFBQUUsT0FBTztBQUFBLEVBQzNCLFlBQVksc0JBQXNCLFNBQVM7QUFDN0MsQ0FBQyxFQUFFLFlBQVk7QUFDZixJQUFNLDhCQUE4QixhQUFFLE9BQU87QUFBQSxFQUMzQyxPQUFPLGFBQUUsT0FBTyxFQUFFLFNBQVMsa0RBQWtEO0FBQUEsRUFDN0UsUUFBUSxhQUFFLE9BQU8sRUFBRSxTQUFTLEVBQUUsU0FBUyxzQ0FBc0M7QUFBQSxFQUM3RSxVQUFVLGFBQUUsT0FBTyxFQUFFLFNBQVMsRUFBRSxTQUFTLG9EQUFvRDtBQUMvRixDQUFDLEVBQUUsWUFBWTtBQUNmLElBQU0sY0FBYyxhQUFFLE9BQU87QUFBQSxFQUMzQixZQUFZLDRCQUE0QixTQUFTLHdDQUF3QztBQUFBLEVBQ3pGLFFBQVEsYUFBRSxNQUFNLFdBQVcsRUFBRSxTQUFTLEVBQUUsU0FBUyw4Q0FBOEM7QUFDakcsQ0FBQztBQUNELElBQU0sZUFBZSxhQUFFLE9BQU87QUFBQSxFQUM1QixlQUFlLGFBQUUsT0FBTyxFQUFFLFNBQVMsMENBQTBDO0FBQUEsRUFDN0UsZ0JBQWdCLGFBQUUsT0FBTyxFQUFFLFNBQVMsa0RBQWtEO0FBQUEsRUFDdEYsWUFBWSxhQUFFLElBQUksRUFBRSxTQUFTO0FBQy9CLENBQUMsRUFBRSxZQUFZO0FBQ2YsSUFBTSxTQUFTO0FBQUEsRUFDYixNQUFNO0FBQUEsRUFDTixhQUFhO0FBQUEsRUFDYixTQUFTO0FBQUEsRUFDVCxVQUFVO0FBQUEsSUFDUixRQUFRO0FBQUEsSUFDUixNQUFNO0FBQUEsSUFDTixPQUFPO0FBQUEsRUFDVDtBQUFBLEVBQ0EsT0FBTztBQUFBLEVBQ1AsUUFBUTtBQUFBLEVBQ1IsUUFBUSxDQUFDLDhDQUE4QztBQUFBLEVBQ3ZELE1BQU0sT0FBTyxPQUFPLFVBQWlEO0FBRW5FLFVBQU0sV0FBVyxNQUFNLE1BQU0sS0FBSztBQUFBLE1BQ2hDLFVBQVU7QUFBQSxNQUNWLE1BQU07QUFBQSxRQUNKLFlBQVksTUFBTTtBQUFBLFFBQ2xCLEdBQUksTUFBTSxVQUFVO0FBQUEsVUFDbEIsUUFBUSxNQUFNO0FBQUEsUUFDaEI7QUFBQSxNQUNGO0FBQUEsTUFDQSxTQUFTO0FBQUEsSUFDWCxDQUFDO0FBQ0QsV0FBTztBQUFBLE1BQ0wsZUFBZSxTQUFTLEtBQUs7QUFBQSxNQUM3QixnQkFBZ0IsU0FBUyxLQUFLO0FBQUEsTUFDOUIsWUFBWSxTQUFTLEtBQUs7QUFBQSxJQUM1QjtBQUFBLEVBQ0Y7QUFDRjtBQUVBLElBQU8sNkJBQVE7IiwKICAibmFtZXMiOiBbXQp9Cg==
