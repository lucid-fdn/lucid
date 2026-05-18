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

// google/actions/get-values.ts
var get_values_exports = {};
__export(get_values_exports, {
  default: () => get_values_default
});
module.exports = __toCommonJS(get_values_exports);
var import_zod = require("zod");
var InputSchema = import_zod.z.object({
  spreadsheetId: import_zod.z.string().describe('The ID of the spreadsheet to retrieve data from. Example: "1aBcD..."'),
  range: import_zod.z.string().describe('The A1 notation or R1C1 notation of the range to retrieve values from. Example: "Sheet1!A1:C10" or "Sheet1"')
});
var OutputSchema = import_zod.z.object({
  spreadsheetId: import_zod.z.string(),
  range: import_zod.z.string(),
  majorDimension: import_zod.z.enum(["ROWS", "COLUMNS"]),
  values: import_zod.z.any().describe("The data values in the range, as a 2D array where each inner array represents a row")
});
var action = {
  type: "action",
  description: "Get values from a spreadsheet range",
  version: "1.0.0",
  endpoint: {
    method: "POST",
    path: "/actions/get-values",
    group: "Sheets"
  },
  input: InputSchema,
  output: OutputSchema,
  scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  exec: async (nango, input) => {
    const response = await nango.get({
      baseUrlOverride: "https://sheets.googleapis.com",
      endpoint: `/v4/spreadsheets/${encodeURIComponent(input.spreadsheetId)}/values/${encodeURIComponent(input.range)}`,
      retries: 3
    });
    const data = response.data;
    const spreadsheetId = data.spreadsheetId || data.spreadsheetId || input.spreadsheetId;
    const range = data.range || input.range;
    const majorDimension = data.majorDimension || "ROWS";
    const values = data.values || [];
    return {
      spreadsheetId,
      range,
      majorDimension,
      values
    };
  }
};
var get_values_default = action;
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiZ29vZ2xlL2FjdGlvbnMvZ2V0LXZhbHVlcy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiaW1wb3J0IHsgeiB9IGZyb20gJ3pvZCc7XG5pbXBvcnQgeyBjcmVhdGVBY3Rpb24gfSBmcm9tICduYW5nbyc7XG5jb25zdCBJbnB1dFNjaGVtYSA9IHoub2JqZWN0KHtcbiAgc3ByZWFkc2hlZXRJZDogei5zdHJpbmcoKS5kZXNjcmliZSgnVGhlIElEIG9mIHRoZSBzcHJlYWRzaGVldCB0byByZXRyaWV2ZSBkYXRhIGZyb20uIEV4YW1wbGU6IFwiMWFCY0QuLi5cIicpLFxuICByYW5nZTogei5zdHJpbmcoKS5kZXNjcmliZSgnVGhlIEExIG5vdGF0aW9uIG9yIFIxQzEgbm90YXRpb24gb2YgdGhlIHJhbmdlIHRvIHJldHJpZXZlIHZhbHVlcyBmcm9tLiBFeGFtcGxlOiBcIlNoZWV0MSFBMTpDMTBcIiBvciBcIlNoZWV0MVwiJylcbn0pO1xuY29uc3QgT3V0cHV0U2NoZW1hID0gei5vYmplY3Qoe1xuICBzcHJlYWRzaGVldElkOiB6LnN0cmluZygpLFxuICByYW5nZTogei5zdHJpbmcoKSxcbiAgbWFqb3JEaW1lbnNpb246IHouZW51bShbJ1JPV1MnLCAnQ09MVU1OUyddKSxcbiAgdmFsdWVzOiB6LmFueSgpLmRlc2NyaWJlKCdUaGUgZGF0YSB2YWx1ZXMgaW4gdGhlIHJhbmdlLCBhcyBhIDJEIGFycmF5IHdoZXJlIGVhY2ggaW5uZXIgYXJyYXkgcmVwcmVzZW50cyBhIHJvdycpXG59KTtcbmNvbnN0IGFjdGlvbiA9IHtcbiAgdHlwZTogXCJhY3Rpb25cIixcbiAgZGVzY3JpcHRpb246ICdHZXQgdmFsdWVzIGZyb20gYSBzcHJlYWRzaGVldCByYW5nZScsXG4gIHZlcnNpb246ICcxLjAuMCcsXG4gIGVuZHBvaW50OiB7XG4gICAgbWV0aG9kOiAnUE9TVCcsXG4gICAgcGF0aDogJy9hY3Rpb25zL2dldC12YWx1ZXMnLFxuICAgIGdyb3VwOiAnU2hlZXRzJ1xuICB9LFxuICBpbnB1dDogSW5wdXRTY2hlbWEsXG4gIG91dHB1dDogT3V0cHV0U2NoZW1hLFxuICBzY29wZXM6IFsnaHR0cHM6Ly93d3cuZ29vZ2xlYXBpcy5jb20vYXV0aC9zcHJlYWRzaGVldHMucmVhZG9ubHknXSxcbiAgZXhlYzogYXN5bmMgKG5hbmdvLCBpbnB1dCk6IFByb21pc2U8ei5pbmZlcjx0eXBlb2YgT3V0cHV0U2NoZW1hPj4gPT4ge1xuICAgIC8vIGh0dHBzOi8vZGV2ZWxvcGVycy5nb29nbGUuY29tL3NoZWV0cy9hcGkvcmVmZXJlbmNlL3Jlc3QvdjQvc3ByZWFkc2hlZXRzLnZhbHVlcy9nZXRcbiAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IG5hbmdvLmdldCh7XG4gICAgICBlbmRwb2ludDogYC92NC9zcHJlYWRzaGVldHMvJHtlbmNvZGVVUklDb21wb25lbnQoaW5wdXQuc3ByZWFkc2hlZXRJZCl9L3ZhbHVlcy8ke2VuY29kZVVSSUNvbXBvbmVudChpbnB1dC5yYW5nZSl9YCxcbiAgICAgIHJldHJpZXM6IDNcbiAgICB9KTtcbiAgICBjb25zdCBkYXRhID0gcmVzcG9uc2UuZGF0YTtcblxuICAgIC8vIEdvb2dsZSBTaGVldHMgQVBJIHJldHVybnMgY2FtZWxDYXNlIGZpZWxkIG5hbWVzXG4gICAgY29uc3Qgc3ByZWFkc2hlZXRJZCA9IGRhdGEuc3ByZWFkc2hlZXRJZCB8fCBkYXRhLnNwcmVhZHNoZWV0SWQgfHwgaW5wdXQuc3ByZWFkc2hlZXRJZDtcbiAgICBjb25zdCByYW5nZSA9IGRhdGEucmFuZ2UgfHwgaW5wdXQucmFuZ2U7XG4gICAgY29uc3QgbWFqb3JEaW1lbnNpb24gPSBkYXRhLm1ham9yRGltZW5zaW9uIHx8ICdST1dTJztcbiAgICBjb25zdCB2YWx1ZXMgPSBkYXRhLnZhbHVlcyB8fCBbXTtcbiAgICByZXR1cm4ge1xuICAgICAgc3ByZWFkc2hlZXRJZDogc3ByZWFkc2hlZXRJZCxcbiAgICAgIHJhbmdlOiByYW5nZSxcbiAgICAgIG1ham9yRGltZW5zaW9uOiBtYWpvckRpbWVuc2lvbixcbiAgICAgIHZhbHVlczogdmFsdWVzXG4gICAgfTtcbiAgfVxufTtcbmV4cG9ydCB0eXBlIE5hbmdvQWN0aW9uTG9jYWwgPSBQYXJhbWV0ZXJzPCh0eXBlb2YgYWN0aW9uKVsnZXhlYyddPlswXTtcbmV4cG9ydCBkZWZhdWx0IGFjdGlvbjsiXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxpQkFBa0I7QUFFbEIsSUFBTSxjQUFjLGFBQUUsT0FBTztBQUFBLEVBQzNCLGVBQWUsYUFBRSxPQUFPLEVBQUUsU0FBUyxzRUFBc0U7QUFBQSxFQUN6RyxPQUFPLGFBQUUsT0FBTyxFQUFFLFNBQVMsNkdBQTZHO0FBQzFJLENBQUM7QUFDRCxJQUFNLGVBQWUsYUFBRSxPQUFPO0FBQUEsRUFDNUIsZUFBZSxhQUFFLE9BQU87QUFBQSxFQUN4QixPQUFPLGFBQUUsT0FBTztBQUFBLEVBQ2hCLGdCQUFnQixhQUFFLEtBQUssQ0FBQyxRQUFRLFNBQVMsQ0FBQztBQUFBLEVBQzFDLFFBQVEsYUFBRSxJQUFJLEVBQUUsU0FBUyxxRkFBcUY7QUFDaEgsQ0FBQztBQUNELElBQU0sU0FBUztBQUFBLEVBQ2IsTUFBTTtBQUFBLEVBQ04sYUFBYTtBQUFBLEVBQ2IsU0FBUztBQUFBLEVBQ1QsVUFBVTtBQUFBLElBQ1IsUUFBUTtBQUFBLElBQ1IsTUFBTTtBQUFBLElBQ04sT0FBTztBQUFBLEVBQ1Q7QUFBQSxFQUNBLE9BQU87QUFBQSxFQUNQLFFBQVE7QUFBQSxFQUNSLFFBQVEsQ0FBQyx1REFBdUQ7QUFBQSxFQUNoRSxNQUFNLE9BQU8sT0FBTyxVQUFpRDtBQUVuRSxVQUFNLFdBQVcsTUFBTSxNQUFNLElBQUk7QUFBQSxNQUMvQixVQUFVLG9CQUFvQixtQkFBbUIsTUFBTSxhQUFhLENBQUMsV0FBVyxtQkFBbUIsTUFBTSxLQUFLLENBQUM7QUFBQSxNQUMvRyxTQUFTO0FBQUEsSUFDWCxDQUFDO0FBQ0QsVUFBTSxPQUFPLFNBQVM7QUFHdEIsVUFBTSxnQkFBZ0IsS0FBSyxpQkFBaUIsS0FBSyxpQkFBaUIsTUFBTTtBQUN4RSxVQUFNLFFBQVEsS0FBSyxTQUFTLE1BQU07QUFDbEMsVUFBTSxpQkFBaUIsS0FBSyxrQkFBa0I7QUFDOUMsVUFBTSxTQUFTLEtBQUssVUFBVSxDQUFDO0FBQy9CLFdBQU87QUFBQSxNQUNMO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsSUFDRjtBQUFBLEVBQ0Y7QUFDRjtBQUVBLElBQU8scUJBQVE7IiwKICAibmFtZXMiOiBbXQp9Cg==
