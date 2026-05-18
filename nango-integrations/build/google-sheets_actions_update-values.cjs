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

// google-sheets/actions/update-values.ts
var update_values_exports = {};
__export(update_values_exports, {
  default: () => update_values_default
});
module.exports = __toCommonJS(update_values_exports);
var import_zod = require("zod");
var InputSchema = import_zod.z.object({
  spreadsheetId: import_zod.z.string().describe('The ID of the spreadsheet to update. Example: "1abc123def456ghi"'),
  range: import_zod.z.string().describe('The A1 notation of the values to update. Example: "Sheet1!A1:B2"'),
  values: import_zod.z.array(import_zod.z.array(import_zod.z.any())).describe('The data to write, as an array of arrays. Each inner array represents a row. Example: [["A1", "B1"], ["A2", "B2"]]'),
  valueInputOption: import_zod.z.union([import_zod.z.literal("RAW"), import_zod.z.literal("USER_ENTERED")]).optional().describe("How the input data should be interpreted. RAW = values as-is, USER_ENTERED = parsed as if typed into the UI. Default: USER_ENTERED"),
  majorDimension: import_zod.z.union([import_zod.z.literal("ROWS"), import_zod.z.literal("COLUMNS")]).optional().describe("The major dimension of the values. ROWS = each inner array is a row, COLUMNS = each inner array is a column. Default: ROWS"),
  includeValuesInResponse: import_zod.z.boolean().optional().describe("If true, the response includes the updated cell values. Default: false")
});
var OutputSchema = import_zod.z.object({
  spreadsheetId: import_zod.z.string(),
  updatedRange: import_zod.z.string(),
  updatedRows: import_zod.z.number(),
  updatedColumns: import_zod.z.number(),
  updatedCells: import_zod.z.number()
});
var action = {
  type: "action",
  description: "Update values in a spreadsheet range",
  version: "1.0.0",
  endpoint: {
    method: "POST",
    path: "/actions/update-values",
    group: "Spreadsheets"
  },
  input: InputSchema,
  output: OutputSchema,
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  exec: async (nango, input) => {
    const valueInputOption = input.valueInputOption ?? "USER_ENTERED";
    const majorDimension = input.majorDimension ?? "ROWS";
    const includeValuesInResponse = input.includeValuesInResponse ?? false;
    const response = await nango.put({
      endpoint: `/v4/spreadsheets/${input.spreadsheetId}/values/${encodeURIComponent(input.range)}`,
      params: {
        valueInputOption,
        includeValuesInResponse: String(includeValuesInResponse),
        responseValueRenderOption: "UNFORMATTED_VALUE"
      },
      data: {
        range: input.range,
        majorDimension,
        values: input.values
      },
      retries: 3
    });
    if (!response.data) {
      throw new nango.ActionError({
        type: "api_error",
        message: "No response data from Google Sheets API"
      });
    }
    const result = response.data;
    return {
      spreadsheetId: result.spreadsheetId,
      updatedRange: result.updatedRange,
      updatedRows: result.updatedRows,
      updatedColumns: result.updatedColumns,
      updatedCells: result.updatedCells
    };
  }
};
var update_values_default = action;
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiZ29vZ2xlLXNoZWV0cy9hY3Rpb25zL3VwZGF0ZS12YWx1ZXMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImltcG9ydCB7IHogfSBmcm9tICd6b2QnO1xuaW1wb3J0IHsgY3JlYXRlQWN0aW9uIH0gZnJvbSAnbmFuZ28nO1xuY29uc3QgSW5wdXRTY2hlbWEgPSB6Lm9iamVjdCh7XG4gIHNwcmVhZHNoZWV0SWQ6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ1RoZSBJRCBvZiB0aGUgc3ByZWFkc2hlZXQgdG8gdXBkYXRlLiBFeGFtcGxlOiBcIjFhYmMxMjNkZWY0NTZnaGlcIicpLFxuICByYW5nZTogei5zdHJpbmcoKS5kZXNjcmliZSgnVGhlIEExIG5vdGF0aW9uIG9mIHRoZSB2YWx1ZXMgdG8gdXBkYXRlLiBFeGFtcGxlOiBcIlNoZWV0MSFBMTpCMlwiJyksXG4gIHZhbHVlczogei5hcnJheSh6LmFycmF5KHouYW55KCkpKS5kZXNjcmliZSgnVGhlIGRhdGEgdG8gd3JpdGUsIGFzIGFuIGFycmF5IG9mIGFycmF5cy4gRWFjaCBpbm5lciBhcnJheSByZXByZXNlbnRzIGEgcm93LiBFeGFtcGxlOiBbW1wiQTFcIiwgXCJCMVwiXSwgW1wiQTJcIiwgXCJCMlwiXV0nKSxcbiAgdmFsdWVJbnB1dE9wdGlvbjogei51bmlvbihbei5saXRlcmFsKCdSQVcnKSwgei5saXRlcmFsKCdVU0VSX0VOVEVSRUQnKV0pLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ0hvdyB0aGUgaW5wdXQgZGF0YSBzaG91bGQgYmUgaW50ZXJwcmV0ZWQuIFJBVyA9IHZhbHVlcyBhcy1pcywgVVNFUl9FTlRFUkVEID0gcGFyc2VkIGFzIGlmIHR5cGVkIGludG8gdGhlIFVJLiBEZWZhdWx0OiBVU0VSX0VOVEVSRUQnKSxcbiAgbWFqb3JEaW1lbnNpb246IHoudW5pb24oW3oubGl0ZXJhbCgnUk9XUycpLCB6LmxpdGVyYWwoJ0NPTFVNTlMnKV0pLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ1RoZSBtYWpvciBkaW1lbnNpb24gb2YgdGhlIHZhbHVlcy4gUk9XUyA9IGVhY2ggaW5uZXIgYXJyYXkgaXMgYSByb3csIENPTFVNTlMgPSBlYWNoIGlubmVyIGFycmF5IGlzIGEgY29sdW1uLiBEZWZhdWx0OiBST1dTJyksXG4gIGluY2x1ZGVWYWx1ZXNJblJlc3BvbnNlOiB6LmJvb2xlYW4oKS5vcHRpb25hbCgpLmRlc2NyaWJlKCdJZiB0cnVlLCB0aGUgcmVzcG9uc2UgaW5jbHVkZXMgdGhlIHVwZGF0ZWQgY2VsbCB2YWx1ZXMuIERlZmF1bHQ6IGZhbHNlJylcbn0pO1xuY29uc3QgT3V0cHV0U2NoZW1hID0gei5vYmplY3Qoe1xuICBzcHJlYWRzaGVldElkOiB6LnN0cmluZygpLFxuICB1cGRhdGVkUmFuZ2U6IHouc3RyaW5nKCksXG4gIHVwZGF0ZWRSb3dzOiB6Lm51bWJlcigpLFxuICB1cGRhdGVkQ29sdW1uczogei5udW1iZXIoKSxcbiAgdXBkYXRlZENlbGxzOiB6Lm51bWJlcigpXG59KTtcbmNvbnN0IGFjdGlvbiA9IHtcbiAgdHlwZTogXCJhY3Rpb25cIixcbiAgZGVzY3JpcHRpb246ICdVcGRhdGUgdmFsdWVzIGluIGEgc3ByZWFkc2hlZXQgcmFuZ2UnLFxuICB2ZXJzaW9uOiAnMS4wLjAnLFxuICBlbmRwb2ludDoge1xuICAgIG1ldGhvZDogJ1BPU1QnLFxuICAgIHBhdGg6ICcvYWN0aW9ucy91cGRhdGUtdmFsdWVzJyxcbiAgICBncm91cDogJ1NwcmVhZHNoZWV0cydcbiAgfSxcbiAgaW5wdXQ6IElucHV0U2NoZW1hLFxuICBvdXRwdXQ6IE91dHB1dFNjaGVtYSxcbiAgc2NvcGVzOiBbJ2h0dHBzOi8vd3d3Lmdvb2dsZWFwaXMuY29tL2F1dGgvc3ByZWFkc2hlZXRzJ10sXG4gIGV4ZWM6IGFzeW5jIChuYW5nbywgaW5wdXQpOiBQcm9taXNlPHouaW5mZXI8dHlwZW9mIE91dHB1dFNjaGVtYT4+ID0+IHtcbiAgICBjb25zdCB2YWx1ZUlucHV0T3B0aW9uID0gaW5wdXQudmFsdWVJbnB1dE9wdGlvbiA/PyAnVVNFUl9FTlRFUkVEJztcbiAgICBjb25zdCBtYWpvckRpbWVuc2lvbiA9IGlucHV0Lm1ham9yRGltZW5zaW9uID8/ICdST1dTJztcbiAgICBjb25zdCBpbmNsdWRlVmFsdWVzSW5SZXNwb25zZSA9IGlucHV0LmluY2x1ZGVWYWx1ZXNJblJlc3BvbnNlID8/IGZhbHNlO1xuXG4gICAgLy8gaHR0cHM6Ly9kZXZlbG9wZXJzLmdvb2dsZS5jb20vc2hlZXRzL2FwaS9yZWZlcmVuY2UvcmVzdC92NC9zcHJlYWRzaGVldHMudmFsdWVzL3VwZGF0ZVxuICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgbmFuZ28ucHV0KHtcbiAgICAgIGVuZHBvaW50OiBgL3Y0L3NwcmVhZHNoZWV0cy8ke2lucHV0LnNwcmVhZHNoZWV0SWR9L3ZhbHVlcy8ke2VuY29kZVVSSUNvbXBvbmVudChpbnB1dC5yYW5nZSl9YCxcbiAgICAgIHBhcmFtczoge1xuICAgICAgICB2YWx1ZUlucHV0T3B0aW9uLFxuICAgICAgICBpbmNsdWRlVmFsdWVzSW5SZXNwb25zZTogU3RyaW5nKGluY2x1ZGVWYWx1ZXNJblJlc3BvbnNlKSxcbiAgICAgICAgcmVzcG9uc2VWYWx1ZVJlbmRlck9wdGlvbjogJ1VORk9STUFUVEVEX1ZBTFVFJ1xuICAgICAgfSxcbiAgICAgIGRhdGE6IHtcbiAgICAgICAgcmFuZ2U6IGlucHV0LnJhbmdlLFxuICAgICAgICBtYWpvckRpbWVuc2lvbixcbiAgICAgICAgdmFsdWVzOiBpbnB1dC52YWx1ZXNcbiAgICAgIH0sXG4gICAgICByZXRyaWVzOiAzXG4gICAgfSk7XG4gICAgaWYgKCFyZXNwb25zZS5kYXRhKSB7XG4gICAgICB0aHJvdyBuZXcgbmFuZ28uQWN0aW9uRXJyb3Ioe1xuICAgICAgICB0eXBlOiAnYXBpX2Vycm9yJyxcbiAgICAgICAgbWVzc2FnZTogJ05vIHJlc3BvbnNlIGRhdGEgZnJvbSBHb29nbGUgU2hlZXRzIEFQSSdcbiAgICAgIH0pO1xuICAgIH1cbiAgICBjb25zdCByZXN1bHQgPSByZXNwb25zZS5kYXRhO1xuICAgIHJldHVybiB7XG4gICAgICBzcHJlYWRzaGVldElkOiByZXN1bHQuc3ByZWFkc2hlZXRJZCxcbiAgICAgIHVwZGF0ZWRSYW5nZTogcmVzdWx0LnVwZGF0ZWRSYW5nZSxcbiAgICAgIHVwZGF0ZWRSb3dzOiByZXN1bHQudXBkYXRlZFJvd3MsXG4gICAgICB1cGRhdGVkQ29sdW1uczogcmVzdWx0LnVwZGF0ZWRDb2x1bW5zLFxuICAgICAgdXBkYXRlZENlbGxzOiByZXN1bHQudXBkYXRlZENlbGxzXG4gICAgfTtcbiAgfVxufTtcbmV4cG9ydCB0eXBlIE5hbmdvQWN0aW9uTG9jYWwgPSBQYXJhbWV0ZXJzPCh0eXBlb2YgYWN0aW9uKVsnZXhlYyddPlswXTtcbmV4cG9ydCBkZWZhdWx0IGFjdGlvbjsiXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxpQkFBa0I7QUFFbEIsSUFBTSxjQUFjLGFBQUUsT0FBTztBQUFBLEVBQzNCLGVBQWUsYUFBRSxPQUFPLEVBQUUsU0FBUyxrRUFBa0U7QUFBQSxFQUNyRyxPQUFPLGFBQUUsT0FBTyxFQUFFLFNBQVMsa0VBQWtFO0FBQUEsRUFDN0YsUUFBUSxhQUFFLE1BQU0sYUFBRSxNQUFNLGFBQUUsSUFBSSxDQUFDLENBQUMsRUFBRSxTQUFTLG9IQUFvSDtBQUFBLEVBQy9KLGtCQUFrQixhQUFFLE1BQU0sQ0FBQyxhQUFFLFFBQVEsS0FBSyxHQUFHLGFBQUUsUUFBUSxjQUFjLENBQUMsQ0FBQyxFQUFFLFNBQVMsRUFBRSxTQUFTLG9JQUFvSTtBQUFBLEVBQ2pPLGdCQUFnQixhQUFFLE1BQU0sQ0FBQyxhQUFFLFFBQVEsTUFBTSxHQUFHLGFBQUUsUUFBUSxTQUFTLENBQUMsQ0FBQyxFQUFFLFNBQVMsRUFBRSxTQUFTLDRIQUE0SDtBQUFBLEVBQ25OLHlCQUF5QixhQUFFLFFBQVEsRUFBRSxTQUFTLEVBQUUsU0FBUyx3RUFBd0U7QUFDbkksQ0FBQztBQUNELElBQU0sZUFBZSxhQUFFLE9BQU87QUFBQSxFQUM1QixlQUFlLGFBQUUsT0FBTztBQUFBLEVBQ3hCLGNBQWMsYUFBRSxPQUFPO0FBQUEsRUFDdkIsYUFBYSxhQUFFLE9BQU87QUFBQSxFQUN0QixnQkFBZ0IsYUFBRSxPQUFPO0FBQUEsRUFDekIsY0FBYyxhQUFFLE9BQU87QUFDekIsQ0FBQztBQUNELElBQU0sU0FBUztBQUFBLEVBQ2IsTUFBTTtBQUFBLEVBQ04sYUFBYTtBQUFBLEVBQ2IsU0FBUztBQUFBLEVBQ1QsVUFBVTtBQUFBLElBQ1IsUUFBUTtBQUFBLElBQ1IsTUFBTTtBQUFBLElBQ04sT0FBTztBQUFBLEVBQ1Q7QUFBQSxFQUNBLE9BQU87QUFBQSxFQUNQLFFBQVE7QUFBQSxFQUNSLFFBQVEsQ0FBQyw4Q0FBOEM7QUFBQSxFQUN2RCxNQUFNLE9BQU8sT0FBTyxVQUFpRDtBQUNuRSxVQUFNLG1CQUFtQixNQUFNLG9CQUFvQjtBQUNuRCxVQUFNLGlCQUFpQixNQUFNLGtCQUFrQjtBQUMvQyxVQUFNLDBCQUEwQixNQUFNLDJCQUEyQjtBQUdqRSxVQUFNLFdBQVcsTUFBTSxNQUFNLElBQUk7QUFBQSxNQUMvQixVQUFVLG9CQUFvQixNQUFNLGFBQWEsV0FBVyxtQkFBbUIsTUFBTSxLQUFLLENBQUM7QUFBQSxNQUMzRixRQUFRO0FBQUEsUUFDTjtBQUFBLFFBQ0EseUJBQXlCLE9BQU8sdUJBQXVCO0FBQUEsUUFDdkQsMkJBQTJCO0FBQUEsTUFDN0I7QUFBQSxNQUNBLE1BQU07QUFBQSxRQUNKLE9BQU8sTUFBTTtBQUFBLFFBQ2I7QUFBQSxRQUNBLFFBQVEsTUFBTTtBQUFBLE1BQ2hCO0FBQUEsTUFDQSxTQUFTO0FBQUEsSUFDWCxDQUFDO0FBQ0QsUUFBSSxDQUFDLFNBQVMsTUFBTTtBQUNsQixZQUFNLElBQUksTUFBTSxZQUFZO0FBQUEsUUFDMUIsTUFBTTtBQUFBLFFBQ04sU0FBUztBQUFBLE1BQ1gsQ0FBQztBQUFBLElBQ0g7QUFDQSxVQUFNLFNBQVMsU0FBUztBQUN4QixXQUFPO0FBQUEsTUFDTCxlQUFlLE9BQU87QUFBQSxNQUN0QixjQUFjLE9BQU87QUFBQSxNQUNyQixhQUFhLE9BQU87QUFBQSxNQUNwQixnQkFBZ0IsT0FBTztBQUFBLE1BQ3ZCLGNBQWMsT0FBTztBQUFBLElBQ3ZCO0FBQUEsRUFDRjtBQUNGO0FBRUEsSUFBTyx3QkFBUTsiLAogICJuYW1lcyI6IFtdCn0K
