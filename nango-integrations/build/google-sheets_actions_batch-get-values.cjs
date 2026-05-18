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

// google-sheets/actions/batch-get-values.ts
var batch_get_values_exports = {};
__export(batch_get_values_exports, {
  default: () => batch_get_values_default
});
module.exports = __toCommonJS(batch_get_values_exports);
var import_zod = require("zod");
var InputSchema = import_zod.z.object({
  spreadsheetId: import_zod.z.string().describe('The ID of the spreadsheet to retrieve data from. Example: "1abc123xyz"'),
  ranges: import_zod.z.array(import_zod.z.string()).describe('The A1 notation or R1C1 notation of the ranges to retrieve values from. Example: ["Sheet1!A1:D5", "Sheet2!B2:C4"]'),
  majorDimension: import_zod.z.enum(["ROWS", "COLUMNS"]).optional().describe("The major dimension that results should use. Defaults to ROWS."),
  valueRenderOption: import_zod.z.enum(["FORMATTED_VALUE", "UNFORMATTED_VALUE", "FORMULA"]).optional().describe("How values should be rendered in the output."),
  dateTimeRenderOption: import_zod.z.enum(["SERIAL_NUMBER", "FORMATTED_STRING"]).optional().describe("How dates, times, and durations should be represented in the output.")
});
var ValueRangeSchema = import_zod.z.object({
  range: import_zod.z.string().describe("The range the values cover, in A1 notation."),
  majorDimension: import_zod.z.string().optional().describe("The major dimension of the values."),
  values: import_zod.z.array(import_zod.z.array(import_zod.z.any())).optional().describe("The data that was read. Array of arrays representing rows/columns, with each cell value being a string, number, boolean, or null.")
});
var OutputSchema = import_zod.z.object({
  spreadsheetId: import_zod.z.string().describe("The ID of the spreadsheet the data was retrieved from."),
  valueRanges: import_zod.z.array(ValueRangeSchema).describe("The values of the ranges requested.")
});
var action = {
  type: "action",
  description: "Get values from multiple ranges",
  version: "1.0.0",
  endpoint: {
    method: "GET",
    path: "/actions/batch-get-values",
    group: "Spreadsheets"
  },
  input: InputSchema,
  output: OutputSchema,
  scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  exec: async (nango, input) => {
    const params = {};
    if (input.ranges && input.ranges.length > 0) {
      params["ranges"] = input.ranges;
    }
    if (input.majorDimension) {
      params["majorDimension"] = input.majorDimension;
    }
    if (input.valueRenderOption) {
      params["valueRenderOption"] = input.valueRenderOption;
    }
    if (input.dateTimeRenderOption) {
      params["dateTimeRenderOption"] = input.dateTimeRenderOption;
    }
    const response = await nango.get({
      endpoint: `/v4/spreadsheets/${input.spreadsheetId}/values:batchGet`,
      params,
      retries: 3
    });
    if (!response.data) {
      throw new nango.ActionError({
        type: "not_found",
        message: "No data found for the specified ranges",
        spreadsheetId: input.spreadsheetId,
        ranges: input.ranges
      });
    }
    const valueRanges = response.data.valueRanges || [];
    return {
      spreadsheetId: response.data.spreadsheetId,
      valueRanges: valueRanges.map((range) => ({
        range: range.range,
        majorDimension: range.majorDimension,
        values: range.values
      }))
    };
  }
};
var batch_get_values_default = action;
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiZ29vZ2xlLXNoZWV0cy9hY3Rpb25zL2JhdGNoLWdldC12YWx1ZXMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImltcG9ydCB7IHogfSBmcm9tICd6b2QnO1xuaW1wb3J0IHsgY3JlYXRlQWN0aW9uIH0gZnJvbSAnbmFuZ28nO1xuY29uc3QgSW5wdXRTY2hlbWEgPSB6Lm9iamVjdCh7XG4gIHNwcmVhZHNoZWV0SWQ6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ1RoZSBJRCBvZiB0aGUgc3ByZWFkc2hlZXQgdG8gcmV0cmlldmUgZGF0YSBmcm9tLiBFeGFtcGxlOiBcIjFhYmMxMjN4eXpcIicpLFxuICByYW5nZXM6IHouYXJyYXkoei5zdHJpbmcoKSkuZGVzY3JpYmUoJ1RoZSBBMSBub3RhdGlvbiBvciBSMUMxIG5vdGF0aW9uIG9mIHRoZSByYW5nZXMgdG8gcmV0cmlldmUgdmFsdWVzIGZyb20uIEV4YW1wbGU6IFtcIlNoZWV0MSFBMTpENVwiLCBcIlNoZWV0MiFCMjpDNFwiXScpLFxuICBtYWpvckRpbWVuc2lvbjogei5lbnVtKFsnUk9XUycsICdDT0xVTU5TJ10pLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ1RoZSBtYWpvciBkaW1lbnNpb24gdGhhdCByZXN1bHRzIHNob3VsZCB1c2UuIERlZmF1bHRzIHRvIFJPV1MuJyksXG4gIHZhbHVlUmVuZGVyT3B0aW9uOiB6LmVudW0oWydGT1JNQVRURURfVkFMVUUnLCAnVU5GT1JNQVRURURfVkFMVUUnLCAnRk9STVVMQSddKS5vcHRpb25hbCgpLmRlc2NyaWJlKCdIb3cgdmFsdWVzIHNob3VsZCBiZSByZW5kZXJlZCBpbiB0aGUgb3V0cHV0LicpLFxuICBkYXRlVGltZVJlbmRlck9wdGlvbjogei5lbnVtKFsnU0VSSUFMX05VTUJFUicsICdGT1JNQVRURURfU1RSSU5HJ10pLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ0hvdyBkYXRlcywgdGltZXMsIGFuZCBkdXJhdGlvbnMgc2hvdWxkIGJlIHJlcHJlc2VudGVkIGluIHRoZSBvdXRwdXQuJylcbn0pO1xuY29uc3QgVmFsdWVSYW5nZVNjaGVtYSA9IHoub2JqZWN0KHtcbiAgcmFuZ2U6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ1RoZSByYW5nZSB0aGUgdmFsdWVzIGNvdmVyLCBpbiBBMSBub3RhdGlvbi4nKSxcbiAgbWFqb3JEaW1lbnNpb246IHouc3RyaW5nKCkub3B0aW9uYWwoKS5kZXNjcmliZSgnVGhlIG1ham9yIGRpbWVuc2lvbiBvZiB0aGUgdmFsdWVzLicpLFxuICB2YWx1ZXM6IHouYXJyYXkoei5hcnJheSh6LmFueSgpKSkub3B0aW9uYWwoKS5kZXNjcmliZSgnVGhlIGRhdGEgdGhhdCB3YXMgcmVhZC4gQXJyYXkgb2YgYXJyYXlzIHJlcHJlc2VudGluZyByb3dzL2NvbHVtbnMsIHdpdGggZWFjaCBjZWxsIHZhbHVlIGJlaW5nIGEgc3RyaW5nLCBudW1iZXIsIGJvb2xlYW4sIG9yIG51bGwuJylcbn0pO1xuY29uc3QgT3V0cHV0U2NoZW1hID0gei5vYmplY3Qoe1xuICBzcHJlYWRzaGVldElkOiB6LnN0cmluZygpLmRlc2NyaWJlKCdUaGUgSUQgb2YgdGhlIHNwcmVhZHNoZWV0IHRoZSBkYXRhIHdhcyByZXRyaWV2ZWQgZnJvbS4nKSxcbiAgdmFsdWVSYW5nZXM6IHouYXJyYXkoVmFsdWVSYW5nZVNjaGVtYSkuZGVzY3JpYmUoJ1RoZSB2YWx1ZXMgb2YgdGhlIHJhbmdlcyByZXF1ZXN0ZWQuJylcbn0pO1xuY29uc3QgYWN0aW9uID0ge1xuICB0eXBlOiBcImFjdGlvblwiLFxuICBkZXNjcmlwdGlvbjogJ0dldCB2YWx1ZXMgZnJvbSBtdWx0aXBsZSByYW5nZXMnLFxuICB2ZXJzaW9uOiAnMS4wLjAnLFxuICBlbmRwb2ludDoge1xuICAgIG1ldGhvZDogJ0dFVCcsXG4gICAgcGF0aDogJy9hY3Rpb25zL2JhdGNoLWdldC12YWx1ZXMnLFxuICAgIGdyb3VwOiAnU3ByZWFkc2hlZXRzJ1xuICB9LFxuICBpbnB1dDogSW5wdXRTY2hlbWEsXG4gIG91dHB1dDogT3V0cHV0U2NoZW1hLFxuICBzY29wZXM6IFsnaHR0cHM6Ly93d3cuZ29vZ2xlYXBpcy5jb20vYXV0aC9zcHJlYWRzaGVldHMucmVhZG9ubHknXSxcbiAgZXhlYzogYXN5bmMgKG5hbmdvLCBpbnB1dCk6IFByb21pc2U8ei5pbmZlcjx0eXBlb2YgT3V0cHV0U2NoZW1hPj4gPT4ge1xuICAgIGNvbnN0IHBhcmFtczogUmVjb3JkPHN0cmluZywgc3RyaW5nIHwgc3RyaW5nW10+ID0ge307XG4gICAgaWYgKGlucHV0LnJhbmdlcyAmJiBpbnB1dC5yYW5nZXMubGVuZ3RoID4gMCkge1xuICAgICAgcGFyYW1zWydyYW5nZXMnXSA9IGlucHV0LnJhbmdlcztcbiAgICB9XG4gICAgaWYgKGlucHV0Lm1ham9yRGltZW5zaW9uKSB7XG4gICAgICBwYXJhbXNbJ21ham9yRGltZW5zaW9uJ10gPSBpbnB1dC5tYWpvckRpbWVuc2lvbjtcbiAgICB9XG4gICAgaWYgKGlucHV0LnZhbHVlUmVuZGVyT3B0aW9uKSB7XG4gICAgICBwYXJhbXNbJ3ZhbHVlUmVuZGVyT3B0aW9uJ10gPSBpbnB1dC52YWx1ZVJlbmRlck9wdGlvbjtcbiAgICB9XG4gICAgaWYgKGlucHV0LmRhdGVUaW1lUmVuZGVyT3B0aW9uKSB7XG4gICAgICBwYXJhbXNbJ2RhdGVUaW1lUmVuZGVyT3B0aW9uJ10gPSBpbnB1dC5kYXRlVGltZVJlbmRlck9wdGlvbjtcbiAgICB9XG5cbiAgICAvLyBodHRwczovL2RldmVsb3BlcnMuZ29vZ2xlLmNvbS9zaGVldHMvYXBpL3JlZmVyZW5jZS9yZXN0L3Y0L3NwcmVhZHNoZWV0cy52YWx1ZXMvYmF0Y2hHZXRcbiAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IG5hbmdvLmdldCh7XG4gICAgICBlbmRwb2ludDogYC92NC9zcHJlYWRzaGVldHMvJHtpbnB1dC5zcHJlYWRzaGVldElkfS92YWx1ZXM6YmF0Y2hHZXRgLFxuICAgICAgcGFyYW1zLFxuICAgICAgcmV0cmllczogM1xuICAgIH0pO1xuICAgIGlmICghcmVzcG9uc2UuZGF0YSkge1xuICAgICAgdGhyb3cgbmV3IG5hbmdvLkFjdGlvbkVycm9yKHtcbiAgICAgICAgdHlwZTogJ25vdF9mb3VuZCcsXG4gICAgICAgIG1lc3NhZ2U6ICdObyBkYXRhIGZvdW5kIGZvciB0aGUgc3BlY2lmaWVkIHJhbmdlcycsXG4gICAgICAgIHNwcmVhZHNoZWV0SWQ6IGlucHV0LnNwcmVhZHNoZWV0SWQsXG4gICAgICAgIHJhbmdlczogaW5wdXQucmFuZ2VzXG4gICAgICB9KTtcbiAgICB9XG4gICAgY29uc3QgdmFsdWVSYW5nZXMgPSByZXNwb25zZS5kYXRhLnZhbHVlUmFuZ2VzIHx8IFtdO1xuICAgIHJldHVybiB7XG4gICAgICBzcHJlYWRzaGVldElkOiByZXNwb25zZS5kYXRhLnNwcmVhZHNoZWV0SWQsXG4gICAgICB2YWx1ZVJhbmdlczogdmFsdWVSYW5nZXMubWFwKChyYW5nZToge1xuICAgICAgICByYW5nZTogc3RyaW5nO1xuICAgICAgICBtYWpvckRpbWVuc2lvbj86IHN0cmluZztcbiAgICAgICAgdmFsdWVzPzogdW5rbm93bltdW107XG4gICAgICB9KSA9PiAoe1xuICAgICAgICByYW5nZTogcmFuZ2UucmFuZ2UsXG4gICAgICAgIG1ham9yRGltZW5zaW9uOiByYW5nZS5tYWpvckRpbWVuc2lvbixcbiAgICAgICAgdmFsdWVzOiByYW5nZS52YWx1ZXNcbiAgICAgIH0pKVxuICAgIH07XG4gIH1cbn07XG5leHBvcnQgdHlwZSBOYW5nb0FjdGlvbkxvY2FsID0gUGFyYW1ldGVyczwodHlwZW9mIGFjdGlvbilbJ2V4ZWMnXT5bMF07XG5leHBvcnQgZGVmYXVsdCBhY3Rpb247Il0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsaUJBQWtCO0FBRWxCLElBQU0sY0FBYyxhQUFFLE9BQU87QUFBQSxFQUMzQixlQUFlLGFBQUUsT0FBTyxFQUFFLFNBQVMsd0VBQXdFO0FBQUEsRUFDM0csUUFBUSxh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
