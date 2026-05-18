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

// google/actions/create-spreadsheet-row.ts
var create_spreadsheet_row_exports = {};
__export(create_spreadsheet_row_exports, {
  default: () => create_spreadsheet_row_default
});
module.exports = __toCommonJS(create_spreadsheet_row_exports);
var import_zod = require("zod");
var InputSchema = import_zod.z.object({
  spreadsheetId: import_zod.z.string().describe('The ID of the spreadsheet. Example: "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms"'),
  sheetId: import_zod.z.number().describe("The ID of the sheet (can be found via the API). Example: 687284948"),
  sheetName: import_zod.z.string().describe('The name of the sheet for A1 notation. Example: "Sheet1"'),
  rowIndex: import_zod.z.number().describe("The index where to insert the row (0-based, where 0 is the first row). Example: 5"),
  values: import_zod.z.array(import_zod.z.string()).describe('Array of values to insert in the new row. Example: ["John", "Doe", "john@example.com"]')
});
var OutputSchema = import_zod.z.object({
  spreadsheetId: import_zod.z.string(),
  sheetId: import_zod.z.number(),
  rowIndex: import_zod.z.number(),
  values: import_zod.z.array(import_zod.z.string()),
  updatedRange: import_zod.z.string()
});
var action = {
  type: "action",
  description: "Insert a new row at a given index in a Google Sheet",
  version: "1.0.0",
  endpoint: {
    method: "POST",
    path: "/actions/create-spreadsheet-row",
    group: "Spreadsheets"
  },
  input: InputSchema,
  output: OutputSchema,
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  exec: async (nango, input) => {
    await nango.post({
      baseUrlOverride: "https://sheets.googleapis.com",
      endpoint: `/v4/spreadsheets/${input.spreadsheetId}:batchUpdate`,
      data: {
        requests: [{
          insertDimension: {
            range: {
              sheetId: input.sheetId,
              dimension: "ROWS",
              startIndex: input.rowIndex,
              endIndex: input.rowIndex + 1
            },
            inheritFromBefore: false
          }
        }]
      },
      retries: 3
    });
    const endColumn = input.values.length > 0 ? String.fromCharCode(65 + Math.min(input.values.length - 1, 25)) : "A";
    const range = `${input.sheetName}!A${input.rowIndex + 1}:${endColumn}${input.rowIndex + 1}`;
    const updateResponse = await nango.put({
      baseUrlOverride: "https://sheets.googleapis.com",
      endpoint: `/v4/spreadsheets/${input.spreadsheetId}/values/${encodeURIComponent(range)}`,
      params: {
        valueInputOption: "USER_ENTERED"
      },
      data: {
        majorDimension: "ROWS",
        values: [input.values]
      },
      retries: 3
    });
    return {
      spreadsheetId: input.spreadsheetId,
      sheetId: input.sheetId,
      rowIndex: input.rowIndex,
      values: input.values,
      updatedRange: updateResponse.data?.updatedRange || range
    };
  }
};
var create_spreadsheet_row_default = action;
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiZ29vZ2xlL2FjdGlvbnMvY3JlYXRlLXNwcmVhZHNoZWV0LXJvdy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiaW1wb3J0IHsgeiB9IGZyb20gJ3pvZCc7XG5pbXBvcnQgeyBjcmVhdGVBY3Rpb24gfSBmcm9tICduYW5nbyc7XG5jb25zdCBJbnB1dFNjaGVtYSA9IHoub2JqZWN0KHtcbiAgc3ByZWFkc2hlZXRJZDogei5zdHJpbmcoKS5kZXNjcmliZSgnVGhlIElEIG9mIHRoZSBzcHJlYWRzaGVldC4gRXhhbXBsZTogXCIxQnhpTVZzMFhSQTVuRk1kS3ZCZEJaamdtVVVxcHRsYnM3NE9ndkUydXBtc1wiJyksXG4gIHNoZWV0SWQ6IHoubnVtYmVyKCkuZGVzY3JpYmUoJ1RoZSBJRCBvZiB0aGUgc2hlZXQgKGNhbiBiZSBmb3VuZCB2aWEgdGhlIEFQSSkuIEV4YW1wbGU6IDY4NzI4NDk0OCcpLFxuICBzaGVldE5hbWU6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ1RoZSBuYW1lIG9mIHRoZSBzaGVldCBmb3IgQTEgbm90YXRpb24uIEV4YW1wbGU6IFwiU2hlZXQxXCInKSxcbiAgcm93SW5kZXg6IHoubnVtYmVyKCkuZGVzY3JpYmUoJ1RoZSBpbmRleCB3aGVyZSB0byBpbnNlcnQgdGhlIHJvdyAoMC1iYXNlZCwgd2hlcmUgMCBpcyB0aGUgZmlyc3Qgcm93KS4gRXhhbXBsZTogNScpLFxuICB2YWx1ZXM6IHouYXJyYXkoei5zdHJpbmcoKSkuZGVzY3JpYmUoJ0FycmF5IG9mIHZhbHVlcyB0byBpbnNlcnQgaW4gdGhlIG5ldyByb3cuIEV4YW1wbGU6IFtcIkpvaG5cIiwgXCJEb2VcIiwgXCJqb2huQGV4YW1wbGUuY29tXCJdJylcbn0pO1xuY29uc3QgT3V0cHV0U2NoZW1hID0gei5vYmplY3Qoe1xuICBzcHJlYWRzaGVldElkOiB6LnN0cmluZygpLFxuICBzaGVldElkOiB6Lm51bWJlcigpLFxuICByb3dJbmRleDogei5udW1iZXIoKSxcbiAgdmFsdWVzOiB6LmFycmF5KHouc3RyaW5nKCkpLFxuICB1cGRhdGVkUmFuZ2U6IHouc3RyaW5nKClcbn0pO1xuY29uc3QgYWN0aW9uID0ge1xuICB0eXBlOiBcImFjdGlvblwiLFxuICBkZXNjcmlwdGlvbjogJ0luc2VydCBhIG5ldyByb3cgYXQgYSBnaXZlbiBpbmRleCBpbiBhIEdvb2dsZSBTaGVldCcsXG4gIHZlcnNpb246ICcxLjAuMCcsXG4gIGVuZHBvaW50OiB7XG4gICAgbWV0aG9kOiAnUE9TVCcsXG4gICAgcGF0aDogJy9hY3Rpb25zL2NyZWF0ZS1zcHJlYWRzaGVldC1yb3cnLFxuICAgIGdyb3VwOiAnU3ByZWFkc2hlZXRzJ1xuICB9LFxuICBpbnB1dDogSW5wdXRTY2hlbWEsXG4gIG91dHB1dDogT3V0cHV0U2NoZW1hLFxuICBzY29wZXM6IFsnaHR0cHM6Ly93d3cuZ29vZ2xlYXBpcy5jb20vYXV0aC9zcHJlYWRzaGVldHMnXSxcbiAgZXhlYzogYXN5bmMgKG5hbmdvLCBpbnB1dCk6IFByb21pc2U8ei5pbmZlcjx0eXBlb2YgT3V0cHV0U2NoZW1hPj4gPT4ge1xuICAgIC8vIFN0ZXAgMTogSW5zZXJ0IGEgbmV3IHJvdyBhdCB0aGUgc3BlY2lmaWVkIGluZGV4XG4gICAgLy8gaHR0cHM6Ly9kZXZlbG9wZXJzLmdvb2dsZS5jb20vc2hlZXRzL2FwaS9yZWZlcmVuY2UvcmVzdC92NC9zcHJlYWRzaGVldHMvcmVxdWVzdCNJbnNlcnREaW1lbnNpb25SZXF1ZXN0XG4gICAgYXdhaXQgbmFuZ28ucG9zdCh7XG4gICAgICBlbmRwb2ludDogYC92NC9zcHJlYWRzaGVldHMvJHtpbnB1dC5zcHJlYWRzaGVldElkfTpiYXRjaFVwZGF0ZWAsXG4gICAgICBkYXRhOiB7XG4gICAgICAgIHJlcXVlc3RzOiBbe1xuICAgICAgICAgIGluc2VydERpbWVuc2lvbjoge1xuICAgICAgICAgICAgcmFuZ2U6IHtcbiAgICAgICAgICAgICAgc2hlZXRJZDogaW5wdXQuc2hlZXRJZCxcbiAgICAgICAgICAgICAgZGltZW5zaW9uOiAnUk9XUycsXG4gICAgICAgICAgICAgIHN0YXJ0SW5kZXg6IGlucHV0LnJvd0luZGV4LFxuICAgICAgICAgICAgICBlbmRJbmRleDogaW5wdXQucm93SW5kZXggKyAxXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgaW5oZXJpdEZyb21CZWZvcmU6IGZhbHNlXG4gICAgICAgICAgfVxuICAgICAgICB9XVxuICAgICAgfSxcbiAgICAgIHJldHJpZXM6IDNcbiAgICB9KTtcblxuICAgIC8vIFN0ZXAgMjogVXBkYXRlIHRoZSB2YWx1ZXMgaW4gdGhlIG5ld2x5IGluc2VydGVkIHJvd1xuICAgIC8vIGh0dHBzOi8vZGV2ZWxvcGVycy5nb29nbGUuY29tL3NoZWV0cy9hcGkvcmVmZXJlbmNlL3Jlc3QvdjQvc3ByZWFkc2hlZXRzLnZhbHVlcy91cGRhdGVcbiAgICAvLyBCdWlsZCByYW5nZSBsaWtlIFwiU2hlZXQxIUE1OkM1XCIgd2hlcmUgcm93X2luZGV4PTQgKDAtYmFzZWQpIC0+IHJvdyA1ICgxLWJhc2VkKVxuICAgIGNvbnN0IGVuZENvbHVtbiA9IGlucHV0LnZhbHVlcy5sZW5ndGggPiAwID8gU3RyaW5nLmZyb21DaGFyQ29kZSg2NSArIE1hdGgubWluKGlucHV0LnZhbHVlcy5sZW5ndGggLSAxLCAyNSkpIDogJ0EnO1xuICAgIGNvbnN0IHJhbmdlID0gYCR7aW5wdXQuc2hlZXROYW1lfSFBJHtpbnB1dC5yb3dJbmRleCArIDF9OiR7ZW5kQ29sdW1ufSR7aW5wdXQucm93SW5kZXggKyAxfWA7XG4gICAgY29uc3QgdXBkYXRlUmVzcG9uc2UgPSBhd2FpdCBuYW5nby5wdXQoe1xuICAgICAgZW5kcG9pbnQ6IGAvdjQvc3ByZWFkc2hlZXRzLyR7aW5wdXQuc3ByZWFkc2hlZXRJZH0vdmFsdWVzLyR7ZW5jb2RlVVJJQ29tcG9uZW50KHJhbmdlKX1gLFxuICAgICAgcGFyYW1zOiB7XG4gICAgICAgIHZhbHVlSW5wdXRPcHRpb246ICdVU0VSX0VOVEVSRUQnXG4gICAgICB9LFxuICAgICAgZGF0YToge1xuICAgICAgICBtYWpvckRpbWVuc2lvbjogJ1JPV1MnLFxuICAgICAgICB2YWx1ZXM6IFtpbnB1dC52YWx1ZXNdXG4gICAgICB9LFxuICAgICAgcmV0cmllczogM1xuICAgIH0pO1xuICAgIHJldHVybiB7XG4gICAgICBzcHJlYWRzaGVldElkOiBpbnB1dC5zcHJlYWRzaGVldElkLFxuICAgICAgc2hlZXRJZDogaW5wdXQuc2hlZXRJZCxcbiAgICAgIHJvd0luZGV4OiBpbnB1dC5yb3dJbmRleCxcbiAgICAgIHZhbHVlczogaW5wdXQudmFsdWVzLFxuICAgICAgdXBkYXRlZFJhbmdlOiB1cGRhdGVSZXNwb25zZS5kYXRhPy51cGRhdGVkUmFuZ2UgfHwgcmFuZ2VcbiAgICB9O1xuICB9XG59O1xuZXhwb3J0IHR5cGUgTmFuZ29BY3Rpb25Mb2NhbCA9IFBhcmFtZXRlcnM8KHR5cGVvZiBhY3Rpb24pWydleGVjJ10+WzBdO1xuZXhwb3J0IGRlZmF1bHQgYWN0aW9uOyJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLGlCQUFrQjtBQUVsQixJQUFNLGNBQWMsYUFBRSxPQUFPO0FBQUEsRUFDM0IsZUFBZSxhQUFFLE9BQU8sRUFBRSxTQUFTLG9GQUFvRjtBQUFBLEVBQ3ZILFNBQVMsYUFBRSxPQUFPLEVBQUUsU0FBUyxvRUFBb0U7QUFBQSxFQUNqRyxXQUFXLGFBQUUsT0FBTyxFQUFFLFNBQVMsMERBQTBEO0FBQUEsRUFDekYsVUFBVSxhQUFFLE9BQU8sRUFBRSxTQUFTLG1GQUFtRjtBQUFBLEVBQ2pILFFBQVEsYUFBRSxNQUFNLGFBQUUsT0FBTyxDQUFDLEVBQUUsU0FBUyx3RkFBd0Y7QUFDL0gsQ0FBQztBQUNELElBQU0sZUFBZSxhQUFFLE9BQU87QUFBQSxFQUM1QixlQUFlLGFBQUUsT0FBTztBQUFBLEVBQ3hCLFNBQVMsYUFBRSxPQUFPO0FBQUEsRUFDbEIsVUFBVSxhQUFFLE9BQU87QUFBQSxFQUNuQixRQUFRLGFBQUUsTUFBTSxhQUFFLE9BQU8sQ0FBQztBQUFBLEVBQzFCLGNBQWMsYUFBRSxPQUFPO0FBQ3pCLENBQUM7QUFDRCxJQUFNLFNBQVM7QUFBQSxFQUNiLE1BQU07QUFBQSxFQUNOLGFBQWE7QUFBQSxFQUNiLFNBQVM7QUFBQSxFQUNULFVBQVU7QUFBQSxJQUNSLFFBQVE7QUFBQSxJQUNSLE1BQU07QUFBQSxJQUNOLE9BQU87QUFBQSxFQUNUO0FBQUEsRUFDQSxPQUFPO0FBQUEsRUFDUCxRQUFRO0FBQUEsRUFDUixRQUFRLENBQUMsOENBQThDO0FBQUEsRUFDdkQsTUFBTSxPQUFPLE9BQU8sVUFBaUQ7QUFHbkUsVUFBTSxNQUFNLEtBQUs7QUFBQSxNQUNmLFVBQVUsb0JBQW9CLE1BQU0sYUFBYTtBQUFBLE1BQ2pELE1BQU07QUFBQSxRQUNKLFVBQVUsQ0FBQztBQUFBLFVBQ1QsaUJBQWlCO0FBQUEsWUFDZixPQUFPO0FBQUEsY0FDTCxTQUFTLE1BQU07QUFBQSxjQUNmLFdBQVc7QUFBQSxjQUNYLFlBQVksTUFBTTtBQUFBLGNBQ2xCLFVBQVUsTUFBTSxXQUFXO0FBQUEsWUFDN0I7QUFBQSxZQUNBLG1CQUFtQjtBQUFBLFVBQ3JCO0FBQUEsUUFDRixDQUFDO0FBQUEsTUFDSDtBQUFBLE1BQ0EsU0FBUztBQUFBLElBQ1gsQ0FBQztBQUtELFVBQU0sWUFBWSxNQUFNLE9BQU8sU0FBUyxJQUFJLE9BQU8sYUFBYSxLQUFLLEtBQUssSUFBSSxNQUFNLE9BQU8sU0FBUyxHQUFHLEVBQUUsQ0FBQyxJQUFJO0FBQzlHLFVBQU0sUUFBUSxHQUFHLE1BQU0sU0FBUyxLQUFLLE1BQU0sV0FBVyxDQUFDLElBQUksU0FBUyxHQUFHLE1BQU0sV0FBVyxDQUFDO0FBQ3pGLFVBQU0saUJBQWlCLE1BQU0sTUFBTSxJQUFJO0FBQUEsTUFDckMsVUFBVSxvQkFBb0IsTUFBTSxhQUFhLFdBQVcsbUJBQW1CLEtBQUssQ0FBQztBQUFBLE1BQ3JGLFFBQVE7QUFBQSxRQUNOLGtCQUFrQjtBQUFBLE1BQ3BCO0FBQUEsTUFDQSxNQUFNO0FBQUEsUUFDSixnQkFBZ0I7QUFBQSxRQUNoQixRQUFRLENBQUMsTUFBTSxNQUFNO0FBQUEsTUFDdkI7QUFBQSxNQUNBLFNBQVM7QUFBQSxJQUNYLENBQUM7QUFDRCxXQUFPO0FBQUEsTUFDTCxlQUFlLE1BQU07QUFBQSxNQUNyQixTQUFTLE1BQU07QUFBQSxNQUNmLFVBQVUsTUFBTTtBQUFBLE1BQ2hCLFFBQVEsTUFBTTtBQUFBLE1BQ2QsY0FBYyxlQUFlLE1BQU0sZ0JBQWdCO0FBQUEsSUFDckQ7QUFBQSxFQUNGO0FBQ0Y7QUFFQSxJQUFPLGlDQUFROyIsCiAgIm5hbWVzIjogW10KfQo=
