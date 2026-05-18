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

// google/actions/append-values-to-spreadsheet.ts
var append_values_to_spreadsheet_exports = {};
__export(append_values_to_spreadsheet_exports, {
  default: () => append_values_to_spreadsheet_default
});
module.exports = __toCommonJS(append_values_to_spreadsheet_exports);
var import_zod = require("zod");
var InputSchema = import_zod.z.object({
  spreadsheetId: import_zod.z.string().describe('The ID of the spreadsheet to update. Example: "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms"'),
  range: import_zod.z.string().describe('The A1 notation of a range to search for a logical table of data. Example: "Sheet1!A1" or "Sheet1"'),
  values: import_zod.z.array(import_zod.z.any()).describe("The values to append to the spreadsheet. Each inner array represents a row of data."),
  valueInputOption: import_zod.z.string().optional().describe('How the input data should be interpreted. "RAW": The values will be parsed as if the user typed them into the UI. "USER_ENTERED": The values will be parsed as if the user typed them into the UI, but formulas will be calculated.'),
  insertDataOption: import_zod.z.string().optional().describe('How the input data should be inserted. "OVERWRITE": Overwrite existing data. "INSERT_ROWS": Insert new rows.'),
  majorDimension: import_zod.z.string().optional().describe('The major dimension of the values. "ROWS": Values are organized by row. "COLUMNS": Values are organized by column.')
});
var OutputSchema = import_zod.z.object({
  spreadsheetId: import_zod.z.string(),
  tableRange: import_zod.z.string(),
  updatedRange: import_zod.z.string(),
  updatedRows: import_zod.z.number(),
  updatedColumns: import_zod.z.number(),
  updatedCells: import_zod.z.number()
});
var action = {
  type: "action",
  description: "Append values to the end of a spreadsheet table",
  version: "1.0.0",
  endpoint: {
    method: "POST",
    path: "/actions/append-values-to-spreadsheet",
    group: "Sheets"
  },
  input: InputSchema,
  output: OutputSchema,
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  exec: async (nango, input) => {
    const valueInputOption = input.valueInputOption ?? "USER_ENTERED";
    const insertDataOption = input.insertDataOption ?? "INSERT_ROWS";
    const majorDimension = input.majorDimension ?? "ROWS";
    const response = await nango.post({
      // https://developers.google.com/sheets/api/reference/rest/v4/spreadsheets.values/append
      baseUrlOverride: "https://sheets.googleapis.com",
      endpoint: `/v4/spreadsheets/${input.spreadsheetId}/values/${encodeURIComponent(input.range)}:append`,
      params: {
        valueInputOption,
        insertDataOption,
        includeValuesInResponse: "true"
      },
      data: {
        values: input.values,
        majorDimension
      },
      retries: 3
    });
    const updates = response.data?.updates;
    if (!updates) {
      throw new nango.ActionError({
        type: "invalid_response",
        message: "Invalid response from Google Sheets API: missing updates data"
      });
    }
    return {
      spreadsheetId: response.data.spreadsheetId || input.spreadsheetId,
      tableRange: response.data.tableRange || "",
      updatedRange: updates.updatedRange || "",
      updatedRows: updates.updatedRows || 0,
      updatedColumns: updates.updatedColumns || 0,
      updatedCells: updates.updatedCells || 0
    };
  }
};
var append_values_to_spreadsheet_default = action;
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiZ29vZ2xlL2FjdGlvbnMvYXBwZW5kLXZhbHVlcy10by1zcHJlYWRzaGVldC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiaW1wb3J0IHsgeiB9IGZyb20gJ3pvZCc7XG5pbXBvcnQgeyBjcmVhdGVBY3Rpb24gfSBmcm9tICduYW5nbyc7XG5jb25zdCBJbnB1dFNjaGVtYSA9IHoub2JqZWN0KHtcbiAgc3ByZWFkc2hlZXRJZDogei5zdHJpbmcoKS5kZXNjcmliZSgnVGhlIElEIG9mIHRoZSBzcHJlYWRzaGVldCB0byB1cGRhdGUuIEV4YW1wbGU6IFwiMUJ4aU1WczBYUkE1bkZNZEt2QmRCWmpnbVVVcXB0bGJzNzRPZ3ZFMnVwbXNcIicpLFxuICByYW5nZTogei5zdHJpbmcoKS5kZXNjcmliZSgnVGhlIEExIG5vdGF0aW9uIG9mIGEgcmFuZ2UgdG8gc2VhcmNoIGZvciBhIGxvZ2ljYWwgdGFibGUgb2YgZGF0YS4gRXhhbXBsZTogXCJTaGVldDEhQTFcIiBvciBcIlNoZWV0MVwiJyksXG4gIHZhbHVlczogei5hcnJheSh6LmFueSgpKS5kZXNjcmliZSgnVGhlIHZhbHVlcyB0byBhcHBlbmQgdG8gdGhlIHNwcmVhZHNoZWV0LiBFYWNoIGlubmVyIGFycmF5IHJlcHJlc2VudHMgYSByb3cgb2YgZGF0YS4nKSxcbiAgdmFsdWVJbnB1dE9wdGlvbjogei5zdHJpbmcoKS5vcHRpb25hbCgpLmRlc2NyaWJlKCdIb3cgdGhlIGlucHV0IGRhdGEgc2hvdWxkIGJlIGludGVycHJldGVkLiBcIlJBV1wiOiBUaGUgdmFsdWVzIHdpbGwgYmUgcGFyc2VkIGFzIGlmIHRoZSB1c2VyIHR5cGVkIHRoZW0gaW50byB0aGUgVUkuIFwiVVNFUl9FTlRFUkVEXCI6IFRoZSB2YWx1ZXMgd2lsbCBiZSBwYXJzZWQgYXMgaWYgdGhlIHVzZXIgdHlwZWQgdGhlbSBpbnRvIHRoZSBVSSwgYnV0IGZvcm11bGFzIHdpbGwgYmUgY2FsY3VsYXRlZC4nKSxcbiAgaW5zZXJ0RGF0YU9wdGlvbjogei5zdHJpbmcoKS5vcHRpb25hbCgpLmRlc2NyaWJlKCdIb3cgdGhlIGlucHV0IGRhdGEgc2hvdWxkIGJlIGluc2VydGVkLiBcIk9WRVJXUklURVwiOiBPdmVyd3JpdGUgZXhpc3RpbmcgZGF0YS4gXCJJTlNFUlRfUk9XU1wiOiBJbnNlcnQgbmV3IHJvd3MuJyksXG4gIG1ham9yRGltZW5zaW9uOiB6LnN0cmluZygpLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ1RoZSBtYWpvciBkaW1lbnNpb24gb2YgdGhlIHZhbHVlcy4gXCJST1dTXCI6IFZhbHVlcyBhcmUgb3JnYW5pemVkIGJ5IHJvdy4gXCJDT0xVTU5TXCI6IFZhbHVlcyBhcmUgb3JnYW5pemVkIGJ5IGNvbHVtbi4nKVxufSk7XG5jb25zdCBPdXRwdXRTY2hlbWEgPSB6Lm9iamVjdCh7XG4gIHNwcmVhZHNoZWV0SWQ6IHouc3RyaW5nKCksXG4gIHRhYmxlUmFuZ2U6IHouc3RyaW5nKCksXG4gIHVwZGF0ZWRSYW5nZTogei5zdHJpbmcoKSxcbiAgdXBkYXRlZFJvd3M6IHoubnVtYmVyKCksXG4gIHVwZGF0ZWRDb2x1bW5zOiB6Lm51bWJlcigpLFxuICB1cGRhdGVkQ2VsbHM6IHoubnVtYmVyKClcbn0pO1xuY29uc3QgYWN0aW9uID0ge1xuICB0eXBlOiBcImFjdGlvblwiLFxuICBkZXNjcmlwdGlvbjogJ0FwcGVuZCB2YWx1ZXMgdG8gdGhlIGVuZCBvZiBhIHNwcmVhZHNoZWV0IHRhYmxlJyxcbiAgdmVyc2lvbjogJzEuMC4wJyxcbiAgZW5kcG9pbnQ6IHtcbiAgICBtZXRob2Q6ICdQT1NUJyxcbiAgICBwYXRoOiAnL2FjdGlvbnMvYXBwZW5kLXZhbHVlcy10by1zcHJlYWRzaGVldCcsXG4gICAgZ3JvdXA6ICdTaGVldHMnXG4gIH0sXG4gIGlucHV0OiBJbnB1dFNjaGVtYSxcbiAgb3V0cHV0OiBPdXRwdXRTY2hlbWEsXG4gIHNjb3BlczogWydodHRwczovL3d3dy5nb29nbGVhcGlzLmNvbS9hdXRoL3NwcmVhZHNoZWV0cyddLFxuICBleGVjOiBhc3luYyAobmFuZ28sIGlucHV0KTogUHJvbWlzZTx6LmluZmVyPHR5cGVvZiBPdXRwdXRTY2hlbWE+PiA9PiB7XG4gICAgY29uc3QgdmFsdWVJbnB1dE9wdGlvbiA9IGlucHV0LnZhbHVlSW5wdXRPcHRpb24gPz8gJ1VTRVJfRU5URVJFRCc7XG4gICAgY29uc3QgaW5zZXJ0RGF0YU9wdGlvbiA9IGlucHV0Lmluc2VydERhdGFPcHRpb24gPz8gJ0lOU0VSVF9ST1dTJztcbiAgICBjb25zdCBtYWpvckRpbWVuc2lvbiA9IGlucHV0Lm1ham9yRGltZW5zaW9uID8/ICdST1dTJztcbiAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IG5hbmdvLnBvc3Qoe1xuICAgICAgLy8gaHR0cHM6Ly9kZXZlbG9wZXJzLmdvb2dsZS5jb20vc2hlZXRzL2FwaS9yZWZlcmVuY2UvcmVzdC92NC9zcHJlYWRzaGVldHMudmFsdWVzL2FwcGVuZFxuICAgICAgZW5kcG9pbnQ6IGAvdjQvc3ByZWFkc2hlZXRzLyR7aW5wdXQuc3ByZWFkc2hlZXRJZH0vdmFsdWVzLyR7ZW5jb2RlVVJJQ29tcG9uZW50KGlucHV0LnJhbmdlKX06YXBwZW5kYCxcbiAgICAgIHBhcmFtczoge1xuICAgICAgICB2YWx1ZUlucHV0T3B0aW9uOiB2YWx1ZUlucHV0T3B0aW9uLFxuICAgICAgICBpbnNlcnREYXRhT3B0aW9uOiBpbnNlcnREYXRhT3B0aW9uLFxuICAgICAgICBpbmNsdWRlVmFsdWVzSW5SZXNwb25zZTogJ3RydWUnXG4gICAgICB9LFxuICAgICAgZGF0YToge1xuICAgICAgICB2YWx1ZXM6IGlucHV0LnZhbHVlcyxcbiAgICAgICAgbWFqb3JEaW1lbnNpb246IG1ham9yRGltZW5zaW9uXG4gICAgICB9LFxuICAgICAgcmV0cmllczogM1xuICAgIH0pO1xuICAgIGNvbnN0IHVwZGF0ZXMgPSByZXNwb25zZS5kYXRhPy51cGRhdGVzO1xuICAgIGlmICghdXBkYXRlcykge1xuICAgICAgdGhyb3cgbmV3IG5hbmdvLkFjdGlvbkVycm9yKHtcbiAgICAgICAgdHlwZTogJ2ludmFsaWRfcmVzcG9uc2UnLFxuICAgICAgICBtZXNzYWdlOiAnSW52YWxpZCByZXNwb25zZSBmcm9tIEdvb2dsZSBTaGVldHMgQVBJOiBtaXNzaW5nIHVwZGF0ZXMgZGF0YSdcbiAgICAgIH0pO1xuICAgIH1cbiAgICByZXR1cm4ge1xuICAgICAgc3ByZWFkc2hlZXRJZDogcmVzcG9uc2UuZGF0YS5zcHJlYWRzaGVldElkIHx8IGlucHV0LnNwcmVhZHNoZWV0SWQsXG4gICAgICB0YWJsZVJhbmdlOiByZXNwb25zZS5kYXRhLnRhYmxlUmFuZ2UgfHwgJycsXG4gICAgICB1cGRhdGVkUmFuZ2U6IHVwZGF0ZXMudXBkYXRlZFJhbmdlIHx8ICcnLFxuICAgICAgdXBkYXRlZFJvd3M6IHVwZGF0ZXMudXBkYXRlZFJvd3MgfHwgMCxcbiAgICAgIHVwZGF0ZWRDb2x1bW5zOiB1cGRhdGVzLnVwZGF0ZWRDb2x1bW5zIHx8IDAsXG4gICAgICB1cGRhdGVkQ2VsbHM6IHVwZGF0ZXMudXBkYXRlZENlbGxzIHx8IDBcbiAgICB9O1xuICB9XG59O1xuZXhwb3J0IHR5cGUgTmFuZ29BY3Rpb25Mb2NhbCA9IFBhcmFtZXRlcnM8KHR5cGVvZiBhY3Rpb24pWydleGVjJ10+WzBdO1xuZXhwb3J0IGRlZmF1bHQgYWN0aW9uOyJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLGlCQUFrQjtBQUVsQixJQUFNLGNBQWMsYUFBRSxPQUFPO0FBQUEsRUFDM0IsZUFBZSxhQUFFLE9BQU8sRUFBRSxTQUFTLDhGQUE4RjtBQUFBLEVBQ2pJLE9BQU8sYUFBRSxPQUFPLEVBQUUsU0FBUyxvR0FBb0c7QUFBQSxFQUMvSCxRQUFRLGFBQUUsTUFBTSxhQUFFLElBQUksQ0FBQyxFQUFFLFNBQVMscUZBQXFGO0FBQUEsRUFDdkgsa0JBQWtCLGFBQUUsT0FBTyxFQUFFLFNBQVMsRUFBRSxTQUFTLHFPQUFxTztBQUFBLEVBQ3RSLGtCQUFrQixhQUFFLE9BQU8sRUFBRSxTQUFTLEVBQUUsU0FBUyw4R0FBOEc7QUFBQSxFQUMvSixnQkFBZ0IsYUFBRSxPQUFPLEVBQUUsU0FBUyxFQUFFLFNBQVMsb0hBQW9IO0FBQ3JLLENBQUM7QUFDRCxJQUFNLGVBQWUsYUFBRSxPQUFPO0FBQUEsRUFDNUIsZUFBZSxhQUFFLE9BQU87QUFBQSxFQUN4QixZQUFZLGFBQUUsT0FBTztBQUFBLEVBQ3JCLGNBQWMsYUFBRSxPQUFPO0FBQUEsRUFDdkIsYUFBYSxhQUFFLE9BQU87QUFBQSxFQUN0QixnQkFBZ0IsYUFBRSxPQUFPO0FBQUEsRUFDekIsY0FBYyxhQUFFLE9BQU87QUFDekIsQ0FBQztBQUNELElBQU0sU0FBUztBQUFBLEVBQ2IsTUFBTTtBQUFBLEVBQ04sYUFBYTtBQUFBLEVBQ2IsU0FBUztBQUFBLEVBQ1QsVUFBVTtBQUFBLElBQ1IsUUFBUTtBQUFBLElBQ1IsTUFBTTtBQUFBLElBQ04sT0FBTztBQUFBLEVBQ1Q7QUFBQSxFQUNBLE9BQU87QUFBQSxFQUNQLFFBQVE7QUFBQSxFQUNSLFFBQVEsQ0FBQyw4Q0FBOEM7QUFBQSxFQUN2RCxNQUFNLE9BQU8sT0FBTyxVQUFpRDtBQUNuRSxVQUFNLG1CQUFtQixNQUFNLG9CQUFvQjtBQUNuRCxVQUFNLG1CQUFtQixNQUFNLG9CQUFvQjtBQUNuRCxVQUFNLGlCQUFpQixNQUFNLGtCQUFrQjtBQUMvQyxVQUFNLFdBQVcsTUFBTSxNQUFNLEtBQUs7QUFBQTtBQUFBLE1BRWhDLFVBQVUsb0JBQW9CLE1BQU0sYUFBYSxXQUFXLG1CQUFtQixNQUFNLEtBQUssQ0FBQztBQUFBLE1BQzNGLFFBQVE7QUFBQSxRQUNOO0FBQUEsUUFDQTtBQUFBLFFBQ0EseUJBQXlCO0FBQUEsTUFDM0I7QUFBQSxNQUNBLE1BQU07QUFBQSxRQUNKLFFBQVEsTUFBTTtBQUFBLFFBQ2Q7QUFBQSxNQUNGO0FBQUEsTUFDQSxTQUFTO0FBQUEsSUFDWCxDQUFDO0FBQ0QsVUFBTSxVQUFVLFNBQVMsTUFBTTtBQUMvQixRQUFJLENBQUMsU0FBUztBQUNaLFlBQU0sSUFBSSxNQUFNLFlBQVk7QUFBQSxRQUMxQixNQUFNO0FBQUEsUUFDTixTQUFTO0FBQUEsTUFDWCxDQUFDO0FBQUEsSUFDSDtBQUNBLFdBQU87QUFBQSxNQUNMLGVBQWUsU0FBUyxLQUFLLGlCQUFpQixNQUFNO0FBQUEsTUFDcEQsWUFBWSxTQUFTLEtBQUssY0FBYztBQUFBLE1BQ3hDLGNBQWMsUUFBUSxnQkFBZ0I7QUFBQSxNQUN0QyxhQUFhLFFBQVEsZUFBZTtBQUFBLE1BQ3BDLGdCQUFnQixRQUFRLGtCQUFrQjtBQUFBLE1BQzFDLGNBQWMsUUFBUSxnQkFBZ0I7QUFBQSxJQUN4QztBQUFBLEVBQ0Y7QUFDRjtBQUVBLElBQU8sdUNBQVE7IiwKICAibmFtZXMiOiBbXQp9Cg==
