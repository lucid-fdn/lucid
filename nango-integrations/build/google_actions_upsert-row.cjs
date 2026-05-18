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

// google/actions/upsert-row.ts
var upsert_row_exports = {};
__export(upsert_row_exports, {
  default: () => upsert_row_default
});
module.exports = __toCommonJS(upsert_row_exports);
var import_zod = require("zod");
var InputSchema = import_zod.z.object({
  spreadsheetId: import_zod.z.string().describe('The ID of the spreadsheet to update. Example: "1aBcD..."'),
  range: import_zod.z.string().describe('The A1 notation of the range to search for existing data and append to. Example: "Sheet1!A1:E" or "Sheet1"'),
  values: import_zod.z.array(import_zod.z.string()).describe('The row values to upsert. Example: ["Name", "Email", "Phone"]'),
  keyColumn: import_zod.z.number().optional().describe("The column index (0-based) to use as the key for matching existing rows. If not provided, always appends."),
  keyValue: import_zod.z.string().optional().describe("The value to match in the key column for updating an existing row. Required if key_column is provided.")
});
var OutputSchema = import_zod.z.object({
  success: import_zod.z.boolean(),
  operation: import_zod.z.enum(["appended", "updated"]),
  spreadsheetId: import_zod.z.string(),
  updatedRange: import_zod.z.string(),
  updatedRows: import_zod.z.number()
});
var action = {
  type: "action",
  description: "Append or update a row of values in a Google Sheet",
  version: "1.0.0",
  endpoint: {
    method: "POST",
    path: "/actions/upsert-row",
    group: "Sheets"
  },
  input: InputSchema,
  output: OutputSchema,
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  exec: async (nango, input) => {
    const {
      spreadsheetId,
      range,
      values,
      keyColumn,
      keyValue
    } = input;
    if (keyColumn !== void 0 && !keyValue) {
      throw new nango.ActionError({
        type: "invalid_input",
        message: "key_value is required when key_column is specified"
      });
    }
    let rowIndex = null;
    if (keyColumn !== void 0 && keyValue) {
      const readResponse = await nango.get({
        baseUrlOverride: "https://sheets.googleapis.com",
        endpoint: `/v4/spreadsheets/${spreadsheetId}/values/${range}`,
        retries: 3
      });
      if (readResponse.data && readResponse.data.values) {
        const rows = readResponse.data.values;
        rowIndex = rows.findIndex((row) => row[keyColumn] === keyValue);
      }
    }
    if (rowIndex !== null && rowIndex >= 0) {
      const sheetName = range.includes("!") ? range.split("!")[0] : range;
      const rowNumber = rowIndex + 1;
      const startCol = "A";
      const endCol = String.fromCharCode(65 + values.length - 1);
      const updateRange = `${sheetName}!${startCol}${rowNumber}:${endCol}${rowNumber}`;
      const updateResponse = await nango.put({
        baseUrlOverride: "https://sheets.googleapis.com",
        endpoint: `/v4/spreadsheets/${spreadsheetId}/values/${updateRange}`,
        params: {
          valueInputOption: "USER_ENTERED"
        },
        data: {
          range: updateRange,
          majorDimension: "ROWS",
          values: [values]
        },
        retries: 3
      });
      return {
        success: true,
        operation: "updated",
        spreadsheetId: updateResponse.data.spreadsheetId,
        updatedRange: updateResponse.data.updatedRange,
        updatedRows: updateResponse.data.updatedRows
      };
    } else {
      const appendResponse = await nango.post({
        baseUrlOverride: "https://sheets.googleapis.com",
        endpoint: `/v4/spreadsheets/${spreadsheetId}/values/${range}:append`,
        params: {
          valueInputOption: "USER_ENTERED",
          insertDataOption: "INSERT_ROWS"
        },
        data: {
          range,
          majorDimension: "ROWS",
          values: [values]
        },
        retries: 3
      });
      return {
        success: true,
        operation: "appended",
        spreadsheetId: appendResponse.data.spreadsheetId,
        updatedRange: appendResponse.data.updates?.updatedRange || "",
        updatedRows: appendResponse.data.updates?.updatedRows || 1
      };
    }
  }
};
var upsert_row_default = action;
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiZ29vZ2xlL2FjdGlvbnMvdXBzZXJ0LXJvdy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiaW1wb3J0IHsgeiB9IGZyb20gJ3pvZCc7XG5pbXBvcnQgeyBjcmVhdGVBY3Rpb24gfSBmcm9tICduYW5nbyc7XG5jb25zdCBJbnB1dFNjaGVtYSA9IHoub2JqZWN0KHtcbiAgc3ByZWFkc2hlZXRJZDogei5zdHJpbmcoKS5kZXNjcmliZSgnVGhlIElEIG9mIHRoZSBzcHJlYWRzaGVldCB0byB1cGRhdGUuIEV4YW1wbGU6IFwiMWFCY0QuLi5cIicpLFxuICByYW5nZTogei5zdHJpbmcoKS5kZXNjcmliZSgnVGhlIEExIG5vdGF0aW9uIG9mIHRoZSByYW5nZSB0byBzZWFyY2ggZm9yIGV4aXN0aW5nIGRhdGEgYW5kIGFwcGVuZCB0by4gRXhhbXBsZTogXCJTaGVldDEhQTE6RVwiIG9yIFwiU2hlZXQxXCInKSxcbiAgdmFsdWVzOiB6LmFycmF5KHouc3RyaW5nKCkpLmRlc2NyaWJlKCdUaGUgcm93IHZhbHVlcyB0byB1cHNlcnQuIEV4YW1wbGU6IFtcIk5hbWVcIiwgXCJFbWFpbFwiLCBcIlBob25lXCJdJyksXG4gIGtleUNvbHVtbjogei5udW1iZXIoKS5vcHRpb25hbCgpLmRlc2NyaWJlKCdUaGUgY29sdW1uIGluZGV4ICgwLWJhc2VkKSB0byB1c2UgYXMgdGhlIGtleSBmb3IgbWF0Y2hpbmcgZXhpc3Rpbmcgcm93cy4gSWYgbm90IHByb3ZpZGVkLCBhbHdheXMgYXBwZW5kcy4nKSxcbiAga2V5VmFsdWU6IHouc3RyaW5nKCkub3B0aW9uYWwoKS5kZXNjcmliZSgnVGhlIHZhbHVlIHRvIG1hdGNoIGluIHRoZSBrZXkgY29sdW1uIGZvciB1cGRhdGluZyBhbiBleGlzdGluZyByb3cuIFJlcXVpcmVkIGlmIGtleV9jb2x1bW4gaXMgcHJvdmlkZWQuJylcbn0pO1xuY29uc3QgT3V0cHV0U2NoZW1hID0gei5vYmplY3Qoe1xuICBzdWNjZXNzOiB6LmJvb2xlYW4oKSxcbiAgb3BlcmF0aW9uOiB6LmVudW0oWydhcHBlbmRlZCcsICd1cGRhdGVkJ10pLFxuICBzcHJlYWRzaGVldElkOiB6LnN0cmluZygpLFxuICB1cGRhdGVkUmFuZ2U6IHouc3RyaW5nKCksXG4gIHVwZGF0ZWRSb3dzOiB6Lm51bWJlcigpXG59KTtcbmNvbnN0IGFjdGlvbiA9IHtcbiAgdHlwZTogXCJhY3Rpb25cIixcbiAgZGVzY3JpcHRpb246ICdBcHBlbmQgb3IgdXBkYXRlIGEgcm93IG9mIHZhbHVlcyBpbiBhIEdvb2dsZSBTaGVldCcsXG4gIHZlcnNpb246ICcxLjAuMCcsXG4gIGVuZHBvaW50OiB7XG4gICAgbWV0aG9kOiAnUE9TVCcsXG4gICAgcGF0aDogJy9hY3Rpb25zL3Vwc2VydC1yb3cnLFxuICAgIGdyb3VwOiAnU2hlZXRzJ1xuICB9LFxuICBpbnB1dDogSW5wdXRTY2hlbWEsXG4gIG91dHB1dDogT3V0cHV0U2NoZW1hLFxuICBzY29wZXM6IFsnaHR0cHM6Ly93d3cuZ29vZ2xlYXBpcy5jb20vYXV0aC9zcHJlYWRzaGVldHMnXSxcbiAgZXhlYzogYXN5bmMgKG5hbmdvLCBpbnB1dCk6IFByb21pc2U8ei5pbmZlcjx0eXBlb2YgT3V0cHV0U2NoZW1hPj4gPT4ge1xuICAgIGNvbnN0IHtcbiAgICAgIHNwcmVhZHNoZWV0SWQsXG4gICAgICByYW5nZSxcbiAgICAgIHZhbHVlcyxcbiAgICAgIGtleUNvbHVtbixcbiAgICAgIGtleVZhbHVlXG4gICAgfSA9IGlucHV0O1xuXG4gICAgLy8gSWYga2V5X2NvbHVtbiBpcyBwcm92aWRlZCBidXQga2V5X3ZhbHVlIGlzIG1pc3NpbmcsIGVycm9yXG4gICAgaWYgKGtleUNvbHVtbiAhPT0gdW5kZWZpbmVkICYmICFrZXlWYWx1ZSkge1xuICAgICAgdGhyb3cgbmV3IG5hbmdvLkFjdGlvbkVycm9yKHtcbiAgICAgICAgdHlwZTogJ2ludmFsaWRfaW5wdXQnLFxuICAgICAgICBtZXNzYWdlOiAna2V5X3ZhbHVlIGlzIHJlcXVpcmVkIHdoZW4ga2V5X2NvbHVtbiBpcyBzcGVjaWZpZWQnXG4gICAgICB9KTtcbiAgICB9XG5cbiAgICAvLyBJZiB3ZSBoYXZlIGEga2V5X2NvbHVtbiwgd2UgbmVlZCB0byBzZWFyY2ggZm9yIHRoZSByb3cgZmlyc3RcbiAgICBsZXQgcm93SW5kZXg6IG51bWJlciB8IG51bGwgPSBudWxsO1xuICAgIGlmIChrZXlDb2x1bW4gIT09IHVuZGVmaW5lZCAmJiBrZXlWYWx1ZSkge1xuICAgICAgLy8gUmVhZCB0aGUgZXhpc3RpbmcgZGF0YSB0byBmaW5kIHRoZSByb3dcbiAgICAgIC8vIGh0dHBzOi8vZGV2ZWxvcGVycy5nb29nbGUuY29tL3NoZWV0cy9hcGkvcmVmZXJlbmNlL3Jlc3QvdjQvc3ByZWFkc2hlZXRzLnZhbHVlcy9nZXRcbiAgICAgIGNvbnN0IHJlYWRSZXNwb25zZSA9IGF3YWl0IG5hbmdvLmdldCh7XG4gICAgICAgIGVuZHBvaW50OiBgL3Y0L3NwcmVhZHNoZWV0cy8ke3NwcmVhZHNoZWV0SWR9L3ZhbHVlcy8ke3JhbmdlfWAsXG4gICAgICAgIHJldHJpZXM6IDNcbiAgICAgIH0pO1xuICAgICAgaWYgKHJlYWRSZXNwb25zZS5kYXRhICYmIHJlYWRSZXNwb25zZS5kYXRhLnZhbHVlcykge1xuICAgICAgICBjb25zdCByb3dzOiBzdHJpbmdbXVtdID0gcmVhZFJlc3BvbnNlLmRhdGEudmFsdWVzO1xuICAgICAgICByb3dJbmRleCA9IHJvd3MuZmluZEluZGV4KHJvdyA9PiByb3dba2V5Q29sdW1uXSA9PT0ga2V5VmFsdWUpO1xuICAgICAgfVxuICAgIH1cbiAgICBpZiAocm93SW5kZXggIT09IG51bGwgJiYgcm93SW5kZXggPj0gMCkge1xuICAgICAgLy8gVXBkYXRlIGV4aXN0aW5nIHJvd1xuICAgICAgLy8gV2UgbmVlZCB0byBjb25zdHJ1Y3QgdGhlIHNwZWNpZmljIGNlbGwgcmFuZ2UgZm9yIHRoaXMgcm93XG4gICAgICAvLyBFeHRyYWN0IHNoZWV0IG5hbWUgZnJvbSByYW5nZSAoZS5nLiwgXCJTaGVldDEhQTE6RVwiIC0+IFwiU2hlZXQxXCIpXG4gICAgICBjb25zdCBzaGVldE5hbWUgPSByYW5nZS5pbmNsdWRlcygnIScpID8gcmFuZ2Uuc3BsaXQoJyEnKVswXSA6IHJhbmdlO1xuICAgICAgLy8gQ2FsY3VsYXRlIHRoZSByb3cgbnVtYmVyIChyb3dJbmRleCBpcyAwLWJhc2VkIGluIHZhbHVlcyBhcnJheSwgYnV0IHNoZWV0cyBhcmUgMS1iYXNlZClcbiAgICAgIGNvbnN0IHJvd051bWJlciA9IHJvd0luZGV4ICsgMTtcbiAgICAgIC8vIENvbnN0cnVjdCByYW5nZSBsaWtlIFwiU2hlZXQxIUEzOkUzXCIgZm9yIHJvdyAzXG4gICAgICBjb25zdCBzdGFydENvbCA9ICdBJztcbiAgICAgIGNvbnN0IGVuZENvbCA9IFN0cmluZy5mcm9tQ2hhckNvZGUoNjUgKyB2YWx1ZXMubGVuZ3RoIC0gMSk7IC8vIEEgKyAobGVuZ3RoIC0gMSlcbiAgICAgIGNvbnN0IHVwZGF0ZVJhbmdlID0gYCR7c2hlZXROYW1lfSEke3N0YXJ0Q29sfSR7cm93TnVtYmVyfToke2VuZENvbH0ke3Jvd051bWJlcn1gO1xuXG4gICAgICAvLyBodHRwczovL2RldmVsb3BlcnMuZ29vZ2xlLmNvbS9zaGVldHMvYXBpL3JlZmVyZW5jZS9yZXN0L3Y0L3NwcmVhZHNoZWV0cy52YWx1ZXMvdXBkYXRlXG4gICAgICBjb25zdCB1cGRhdGVSZXNwb25zZSA9IGF3YWl0IG5hbmdvLnB1dCh7XG4gICAgICAgIGVuZHBvaW50OiBgL3Y0L3NwcmVhZHNoZWV0cy8ke3NwcmVhZHNoZWV0SWR9L3ZhbHVlcy8ke3VwZGF0ZVJhbmdlfWAsXG4gICAgICAgIHBhcmFtczoge1xuICAgICAgICAgIHZhbHVlSW5wdXRPcHRpb246ICdVU0VSX0VOVEVSRUQnXG4gICAgICAgIH0sXG4gICAgICAgIGRhdGE6IHtcbiAgICAgICAgICByYW5nZTogdXBkYXRlUmFuZ2UsXG4gICAgICAgICAgbWFqb3JEaW1lbnNpb246ICdST1dTJyxcbiAgICAgICAgICB2YWx1ZXM6IFt2YWx1ZXNdXG4gICAgICAgIH0sXG4gICAgICAgIHJldHJpZXM6IDNcbiAgICAgIH0pO1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgb3BlcmF0aW9uOiAndXBkYXRlZCcsXG4gICAgICAgIHNwcmVhZHNoZWV0SWQ6IHVwZGF0ZVJlc3BvbnNlLmRhdGEuc3ByZWFkc2hlZXRJZCxcbiAgICAgICAgdXBkYXRlZFJhbmdlOiB1cGRhdGVSZXNwb25zZS5kYXRhLnVwZGF0ZWRSYW5nZSxcbiAgICAgICAgdXBkYXRlZFJvd3M6IHVwZGF0ZVJlc3BvbnNlLmRhdGEudXBkYXRlZFJvd3NcbiAgICAgIH07XG4gICAgfSBlbHNlIHtcbiAgICAgIC8vIEFwcGVuZCBuZXcgcm93XG4gICAgICAvLyBodHRwczovL2RldmVsb3BlcnMuZ29vZ2xlLmNvbS9zaGVldHMvYXBpL3JlZmVyZW5jZS9yZXN0L3Y0L3NwcmVhZHNoZWV0cy52YWx1ZXMvYXBwZW5kXG4gICAgICBjb25zdCBhcHBlbmRSZXNwb25zZSA9IGF3YWl0IG5hbmdvLnBvc3Qoe1xuICAgICAgICBlbmRwb2ludDogYC92NC9zcHJlYWRzaGVldHMvJHtzcHJlYWRzaGVldElkfS92YWx1ZXMvJHtyYW5nZX06YXBwZW5kYCxcbiAgICAgICAgcGFyYW1zOiB7XG4gICAgICAgICAgdmFsdWVJbnB1dE9wdGlvbjogJ1VTRVJfRU5URVJFRCcsXG4gICAgICAgICAgaW5zZXJ0RGF0YU9wdGlvbjogJ0lOU0VSVF9ST1dTJ1xuICAgICAgICB9LFxuICAgICAgICBkYXRhOiB7XG4gICAgICAgICAgcmFuZ2U6IHJhbmdlLFxuICAgICAgICAgIG1ham9yRGltZW5zaW9uOiAnUk9XUycsXG4gICAgICAgICAgdmFsdWVzOiBbdmFsdWVzXVxuICAgICAgICB9LFxuICAgICAgICByZXRyaWVzOiAzXG4gICAgICB9KTtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgIG9wZXJhdGlvbjogJ2FwcGVuZGVkJyxcbiAgICAgICAgc3ByZWFkc2hlZXRJZDogYXBwZW5kUmVzcG9uc2UuZGF0YS5zcHJlYWRzaGVldElkLFxuICAgICAgICB1cGRhdGVkUmFuZ2U6IGFwcGVuZFJlc3BvbnNlLmRhdGEudXBkYXRlcz8udXBkYXRlZFJhbmdlIHx8ICcnLFxuICAgICAgICB1cGRhdGVkUm93czogYXBwZW5kUmVzcG9uc2UuZGF0YS51cGRhdGVzPy51cGRhdGVkUm93cyB8fCAxXG4gICAgICB9O1xuICAgIH1cbiAgfVxufTtcbmV4cG9ydCB0eXBlIE5hbmdvQWN0aW9uTG9jYWwgPSBQYXJhbWV0ZXJzPCh0eXBlb2YgYWN0aW9uKVsnZXhlYyddPlswXTtcbmV4cG9ydCBkZWZhdWx0IGFjdGlvbjsiXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxpQkFBa0I7QUFFbEIsSUFBTSxjQUFjLGFBQUUsT0FBTztBQUFBLEVBQzNCLGVBQWUsYUFBRSxPQUFPLEVBQUUsU0FBUywwREFBMEQ7QUFBQSxFQUM3RixPQUFPLGFBQUUsT0FBTyxFQUFFLFNBQVMsNEdBQTRHO0FBQUEsRUFDdkksUUFBUSxhQUFFLE1BQU0sYUFBRSxPQUFPLENBQUMsRUFBRSxTQUFTLCtEQUErRDtBQUFBLEVBQ3BHLFdBQVcsYUFBRSxPQUFPLEVBQUUsU0FBUyxFQUFFLFNBQVMsMkdBQTJHO0FBQUEsRUFDckosVUFBVSxhQUFFLE9BQU8sRUFBRSxTQUFTLEVBQUUsU0FBUyx3R0FBd0c7QUFDbkosQ0FBQztBQUNELElBQU0sZUFBZSxhQUFFLE9BQU87QUFBQSxFQUM1QixTQUFTLGFBQUUsUUFBUTtBQUFBLEVBQ25CLFdBQVcsYUFBRSxLQUFLLENBQUMsWUFBWSxTQUFTLENBQUM7QUFBQSxFQUN6QyxlQUFlLGFBQUUsT0FBTztBQUFBLEVBQ3hCLGNBQWMsYUFBRSxPQUFPO0FBQUEsRUFDdkIsYUFBYSxhQUFFLE9BQU87QUFDeEIsQ0FBQztBQUNELElBQU0sU0FBUztBQUFBLEVB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
