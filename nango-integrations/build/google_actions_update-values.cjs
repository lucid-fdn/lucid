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

// google/actions/update-values.ts
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
      baseUrlOverride: "https://sheets.googleapis.com",
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiZ29vZ2xlL2FjdGlvbnMvdXBkYXRlLXZhbHVlcy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiaW1wb3J0IHsgeiB9IGZyb20gJ3pvZCc7XG5pbXBvcnQgeyBjcmVhdGVBY3Rpb24gfSBmcm9tICduYW5nbyc7XG5jb25zdCBJbnB1dFNjaGVtYSA9IHoub2JqZWN0KHtcbiAgc3ByZWFkc2hlZXRJZDogei5zdHJpbmcoKS5kZXNjcmliZSgnVGhlIElEIG9mIHRoZSBzcHJlYWRzaGVldCB0byB1cGRhdGUuIEV4YW1wbGU6IFwiMWFiYzEyM2RlZjQ1NmdoaVwiJyksXG4gIHJhbmdlOiB6LnN0cmluZygpLmRlc2NyaWJlKCdUaGUgQTEgbm90YXRpb24gb2YgdGhlIHZhbHVlcyB0byB1cGRhdGUuIEV4YW1wbGU6IFwiU2hlZXQxIUExOkIyXCInKSxcbiAgdmFsdWVzOiB6LmFycmF5KHouYXJyYXkoei5hbnkoKSkpLmRlc2NyaWJlKCdUaGUgZGF0YSB0byB3cml0ZSwgYXMgYW4gYXJyYXkgb2YgYXJyYXlzLiBFYWNoIGlubmVyIGFycmF5IHJlcHJlc2VudHMgYSByb3cuIEV4YW1wbGU6IFtbXCJBMVwiLCBcIkIxXCJdLCBbXCJBMlwiLCBcIkIyXCJdXScpLFxuICB2YWx1ZUlucHV0T3B0aW9uOiB6LnVuaW9uKFt6LmxpdGVyYWwoJ1JBVycpLCB6LmxpdGVyYWwoJ1VTRVJfRU5URVJFRCcpXSkub3B0aW9uYWwoKS5kZXNjcmliZSgnSG93IHRoZSBpbnB1dCBkYXRhIHNob3VsZCBiZSBpbnRlcnByZXRlZC4gUkFXID0gdmFsdWVzIGFzLWlzLCBVU0VSX0VOVEVSRUQgPSBwYXJzZWQgYXMgaWYgdHlwZWQgaW50byB0aGUgVUkuIERlZmF1bHQ6IFVTRVJfRU5URVJFRCcpLFxuICBtYWpvckRpbWVuc2lvbjogei51bmlvbihbei5saXRlcmFsKCdST1dTJyksIHoubGl0ZXJhbCgnQ09MVU1OUycpXSkub3B0aW9uYWwoKS5kZXNjcmliZSgnVGhlIG1ham9yIGRpbWVuc2lvbiBvZiB0aGUgdmFsdWVzLiBST1dTID0gZWFjaCBpbm5lciBhcnJheSBpcyBhIHJvdywgQ09MVU1OUyA9IGVhY2ggaW5uZXIgYXJyYXkgaXMgYSBjb2x1bW4uIERlZmF1bHQ6IFJPV1MnKSxcbiAgaW5jbHVkZVZhbHVlc0luUmVzcG9uc2U6IHouYm9vbGVhbigpLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ0lmIHRydWUsIHRoZSByZXNwb25zZSBpbmNsdWRlcyB0aGUgdXBkYXRlZCBjZWxsIHZhbHVlcy4gRGVmYXVsdDogZmFsc2UnKVxufSk7XG5jb25zdCBPdXRwdXRTY2hlbWEgPSB6Lm9iamVjdCh7XG4gIHNwcmVhZHNoZWV0SWQ6IHouc3RyaW5nKCksXG4gIHVwZGF0ZWRSYW5nZTogei5zdHJpbmcoKSxcbiAgdXBkYXRlZFJvd3M6IHoubnVtYmVyKCksXG4gIHVwZGF0ZWRDb2x1bW5zOiB6Lm51bWJlcigpLFxuICB1cGRhdGVkQ2VsbHM6IHoubnVtYmVyKClcbn0pO1xuY29uc3QgYWN0aW9uID0ge1xuICB0eXBlOiBcImFjdGlvblwiLFxuICBkZXNjcmlwdGlvbjogJ1VwZGF0ZSB2YWx1ZXMgaW4gYSBzcHJlYWRzaGVldCByYW5nZScsXG4gIHZlcnNpb246ICcxLjAuMCcsXG4gIGVuZHBvaW50OiB7XG4gICAgbWV0aG9kOiAnUE9TVCcsXG4gICAgcGF0aDogJy9hY3Rpb25zL3VwZGF0ZS12YWx1ZXMnLFxuICAgIGdyb3VwOiAnU3ByZWFkc2hlZXRzJ1xuICB9LFxuICBpbnB1dDogSW5wdXRTY2hlbWEsXG4gIG91dHB1dDogT3V0cHV0U2NoZW1hLFxuICBzY29wZXM6IFsnaHR0cHM6Ly93d3cuZ29vZ2xlYXBpcy5jb20vYXV0aC9zcHJlYWRzaGVldHMnXSxcbiAgZXhlYzogYXN5bmMgKG5hbmdvLCBpbnB1dCk6IFByb21pc2U8ei5pbmZlcjx0eXBlb2YgT3V0cHV0U2NoZW1hPj4gPT4ge1xuICAgIGNvbnN0IHZhbHVlSW5wdXRPcHRpb24gPSBpbnB1dC52YWx1ZUlucHV0T3B0aW9uID8/ICdVU0VSX0VOVEVSRUQnO1xuICAgIGNvbnN0IG1ham9yRGltZW5zaW9uID0gaW5wdXQubWFqb3JEaW1lbnNpb24gPz8gJ1JPV1MnO1xuICAgIGNvbnN0IGluY2x1ZGVWYWx1ZXNJblJlc3BvbnNlID0gaW5wdXQuaW5jbHVkZVZhbHVlc0luUmVzcG9uc2UgPz8gZmFsc2U7XG5cbiAgICAvLyBodHRwczovL2RldmVsb3BlcnMuZ29vZ2xlLmNvbS9zaGVldHMvYXBpL3JlZmVyZW5jZS9yZXN0L3Y0L3NwcmVhZHNoZWV0cy52YWx1ZXMvdXBkYXRlXG4gICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBuYW5nby5wdXQoe1xuICAgICAgZW5kcG9pbnQ6IGAvdjQvc3ByZWFkc2hlZXRzLyR7aW5wdXQuc3ByZWFkc2hlZXRJZH0vdmFsdWVzLyR7ZW5jb2RlVVJJQ29tcG9uZW50KGlucHV0LnJhbmdlKX1gLFxuICAgICAgcGFyYW1zOiB7XG4gICAgICAgIHZhbHVlSW5wdXRPcHRpb24sXG4gICAgICAgIGluY2x1ZGVWYWx1ZXNJblJlc3BvbnNlOiBTdHJpbmcoaW5jbHVkZVZhbHVlc0luUmVzcG9uc2UpLFxuICAgICAgICByZXNwb25zZVZhbHVlUmVuZGVyT3B0aW9uOiAnVU5GT1JNQVRURURfVkFMVUUnXG4gICAgICB9LFxuICAgICAgZGF0YToge1xuICAgICAgICByYW5nZTogaW5wdXQucmFuZ2UsXG4gICAgICAgIG1ham9yRGltZW5zaW9uLFxuICAgICAgICB2YWx1ZXM6IGlucHV0LnZhbHVlc1xuICAgICAgfSxcbiAgICAgIHJldHJpZXM6IDNcbiAgICB9KTtcbiAgICBpZiAoIXJlc3BvbnNlLmRhdGEpIHtcbiAgICAgIHRocm93IG5ldyBuYW5nby5BY3Rpb25FcnJvcih7XG4gICAgICAgIHR5cGU6ICdhcGlfZXJyb3InLFxuICAgICAgICBtZXNzYWdlOiAnTm8gcmVzcG9uc2UgZGF0YSBmcm9tIEdvb2dsZSBTaGVldHMgQVBJJ1xuICAgICAgfSk7XG4gICAgfVxuICAgIGNvbnN0IHJlc3VsdCA9IHJlc3BvbnNlLmRhdGE7XG4gICAgcmV0dXJuIHtcbiAgICAgIHNwcmVhZHNoZWV0SWQ6IHJlc3VsdC5zcHJlYWRzaGVldElkLFxuICAgICAgdXBkYXRlZFJhbmdlOiByZXN1bHQudXBkYXRlZFJhbmdlLFxuICAgICAgdXBkYXRlZFJvd3M6IHJlc3VsdC51cGRhdGVkUm93cyxcbiAgICAgIHVwZGF0ZWRDb2x1bW5zOiByZXN1bHQudXBkYXRlZENvbHVtbnMsXG4gICAgICB1cGRhdGVkQ2VsbHM6IHJlc3VsdC51cGRhdGVkQ2VsbHNcbiAgICB9O1xuICB9XG59O1xuZXhwb3J0IHR5cGUgTmFuZ29BY3Rpb25Mb2NhbCA9IFBhcmFtZXRlcnM8KHR5cGVvZiBhY3Rpb24pWydleGVjJ10+WzBdO1xuZXhwb3J0IGRlZmF1bHQgYWN0aW9uOyJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLGlCQUFrQjtBQUVsQixJQUFNLGNBQWMsYUFBRSxPQUFPO0FBQUEsRUFDM0IsZUFBZSxhQUFFLE9BQU8sRUFBRSxTQUFTLGtFQUFrRTtBQUFBLEVBQ3JHLE9BQU8sYUFBRSxPQUFPLEVBQUUsU0FBUyxrRUFBa0U7QUFBQSxFQUM3RixRQUFRLGFBQUUsTUFBTSxhQUFFLE1BQU0sYUFBRSxJQUFJLENBQUMsQ0FBQyxFQUFFLFNBQVMsb0hBQW9IO0FBQUEsRUFDL0osa0JBQWtCLGFBQUUsTUFBTSxDQUFDLGFBQUUsUUFBUSxLQUFLLEdBQUcsYUFBRSxRQUFRLGNBQWMsQ0FBQyxDQUFDLEVBQUUsU0FBUyxFQUFFLFNBQVMsb0lBQW9JO0FBQUEsRUFDak8sZ0JBQWdCLGFBQUUsTUFBTSxDQUFDLGFBQUUsUUFBUSxNQUFNLEdBQUcsYUFBRSxRQUFRLFNBQVMsQ0FBQyxDQUFDLEVBQUUsU0FBUyxFQUFFLFNBQVMsNEhBQTRIO0FBQUEsRUFDbk4seUJBQXlCLGFBQUUsUUFBUSxFQUFFLFNBQVMsRUFBRSxTQUFTLHdFQUF3RTtBQUNuSSxDQUFDO0FBQ0QsSUFBTSxlQUFlLGFBQUUsT0FBTztBQUFBLEVBQzVCLGVBQWUsYUFBRSxPQUFPO0FBQUEsRUFDeEIsY0FBYyxhQUFFLE9BQU87QUFBQSxFQUN2QixhQUFhLGFBQUUsT0FBTztBQUFBLEVBQ3RCLGdCQUFnQixhQUFFLE9BQU87QUFBQSxFQUN6QixjQUFjLGFBQUUsT0FBTztBQUN6QixDQUFDO0FBQ0QsSUFBTSxTQUFTO0FBQUEsRUFDYixNQUFNO0FBQUEsRUFDTixhQUFhO0FBQUEsRUFDYixTQUFTO0FBQUEsRUFDVCxVQUFVO0FBQUEsSUFDUixRQUFRO0FBQUEsSUFDUixNQUFNO0FBQUEsSUFDTixPQUFPO0FBQUEsRUFDVDtBQUFBLEVBQ0EsT0FBTztBQUFBLEVBQ1AsUUFBUTtBQUFBLEVBQ1IsUUFBUSxDQUFDLDhDQUE4QztBQUFBLEVBQ3ZELE1BQU0sT0FBTyxPQUFPLFVBQWlEO0FBQ25FLFVBQU0sbUJBQW1CLE1BQU0sb0JBQW9CO0FBQ25ELFVBQU0saUJBQWlCLE1BQU0sa0JBQWtCO0FBQy9DLFVBQU0sMEJBQTBCLE1BQU0sMkJBQTJCO0FBR2pFLFVBQU0sV0FBVyxNQUFNLE1BQU0sSUFBSTtBQUFBLE1BQy9CLFVBQVUsb0JBQW9CLE1BQU0sYUFBYSxXQUFXLG1CQUFtQixNQUFNLEtBQUssQ0FBQztBQUFBLE1BQzNGLFFBQVE7QUFBQSxRQUNOO0FBQUEsUUFDQSx5QkFBeUIsT0FBTyx1QkFBdUI7QUFBQSxRQUN2RCwyQkFBMkI7QUFBQSxNQUM3QjtBQUFBLE1BQ0EsTUFBTTtBQUFBLFFBQ0osT0FBTyxNQUFNO0FBQUEsUUFDYjtBQUFBLFFBQ0EsUUFBUSxNQUFNO0FBQUEsTUFDaEI7QUFBQSxNQUNBLFNBQVM7QUFBQSxJQUNYLENBQUM7QUFDRCxRQUFJLENBQUMsU0FBUyxNQUFNO0FBQ2xCLFlBQU0sSUFBSSxNQUFNLFlBQVk7QUFBQSxRQUMxQixNQUFNO0FBQUEsUUFDTixTQUFTO0FBQUEsTUFDWCxDQUFDO0FBQUEsSUFDSDtBQUNBLFVBQU0sU0FBUyxTQUFTO0FBQ3hCLFdBQU87QUFBQSxNQUNMLGVBQWUsT0FBTztBQUFBLE1BQ3RCLGNBQWMsT0FBTztBQUFBLE1BQ3JCLGFBQWEsT0FBTztBQUFBLE1BQ3BCLGdCQUFnQixPQUFPO0FBQUEsTUFDdkIsY0FBYyxPQUFPO0FBQUEsSUFDdkI7QUFBQSxFQUNGO0FBQ0Y7QUFFQSxJQUFPLHdCQUFROyIsCiAgIm5hbWVzIjogW10KfQo=
