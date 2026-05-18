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

// google-sheets/actions/get-values.ts
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiZ29vZ2xlLXNoZWV0cy9hY3Rpb25zL2dldC12YWx1ZXMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImltcG9ydCB7IHogfSBmcm9tICd6b2QnO1xuaW1wb3J0IHsgY3JlYXRlQWN0aW9uIH0gZnJvbSAnbmFuZ28nO1xuY29uc3QgSW5wdXRTY2hlbWEgPSB6Lm9iamVjdCh7XG4gIHNwcmVhZHNoZWV0SWQ6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ1RoZSBJRCBvZiB0aGUgc3ByZWFkc2hlZXQgdG8gcmV0cmlldmUgZGF0YSBmcm9tLiBFeGFtcGxlOiBcIjFhQmNELi4uXCInKSxcbiAgcmFuZ2U6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ1RoZSBBMSBub3RhdGlvbiBvciBSMUMxIG5vdGF0aW9uIG9mIHRoZSByYW5nZSB0byByZXRyaWV2ZSB2YWx1ZXMgZnJvbS4gRXhhbXBsZTogXCJTaGVldDEhQTE6QzEwXCIgb3IgXCJTaGVldDFcIicpXG59KTtcbmNvbnN0IE91dHB1dFNjaGVtYSA9IHoub2JqZWN0KHtcbiAgc3ByZWFkc2hlZXRJZDogei5zdHJpbmcoKSxcbiAgcmFuZ2U6IHouc3RyaW5nKCksXG4gIG1ham9yRGltZW5zaW9uOiB6LmVudW0oWydST1dTJywgJ0NPTFVNTlMnXSksXG4gIHZhbHVlczogei5hbnkoKS5kZXNjcmliZSgnVGhlIGRhdGEgdmFsdWVzIGluIHRoZSByYW5nZSwgYXMgYSAyRCBhcnJheSB3aGVyZSBlYWNoIGlubmVyIGFycmF5IHJlcHJlc2VudHMgYSByb3cnKVxufSk7XG5jb25zdCBhY3Rpb24gPSB7XG4gIHR5cGU6IFwiYWN0aW9uXCIsXG4gIGRlc2NyaXB0aW9uOiAnR2V0IHZhbHVlcyBmcm9tIGEgc3ByZWFkc2hlZXQgcmFuZ2UnLFxuICB2ZXJzaW9uOiAnMS4wLjAnLFxuICBlbmRwb2ludDoge1xuICAgIG1ldGhvZDogJ1BPU1QnLFxuICAgIHBhdGg6ICcvYWN0aW9ucy9nZXQtdmFsdWVzJyxcbiAgICBncm91cDogJ1NoZWV0cydcbiAgfSxcbiAgaW5wdXQ6IElucHV0U2NoZW1hLFxuICBvdXRwdXQ6IE91dHB1dFNjaGVtYSxcbiAgc2NvcGVzOiBbJ2h0dHBzOi8vd3d3Lmdvb2dsZWFwaXMuY29tL2F1dGgvc3ByZWFkc2hlZXRzLnJlYWRvbmx5J10sXG4gIGV4ZWM6IGFzeW5jIChuYW5nbywgaW5wdXQpOiBQcm9taXNlPHouaW5mZXI8dHlwZW9mIE91dHB1dFNjaGVtYT4+ID0+IHtcbiAgICAvLyBodHRwczovL2RldmVsb3BlcnMuZ29vZ2xlLmNvbS9zaGVldHMvYXBpL3JlZmVyZW5jZS9yZXN0L3Y0L3NwcmVhZHNoZWV0cy52YWx1ZXMvZ2V0XG4gICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBuYW5nby5nZXQoe1xuICAgICAgZW5kcG9pbnQ6IGAvdjQvc3ByZWFkc2hlZXRzLyR7ZW5jb2RlVVJJQ29tcG9uZW50KGlucHV0LnNwcmVhZHNoZWV0SWQpfS92YWx1ZXMvJHtlbmNvZGVVUklDb21wb25lbnQoaW5wdXQucmFuZ2UpfWAsXG4gICAgICByZXRyaWVzOiAzXG4gICAgfSk7XG4gICAgY29uc3QgZGF0YSA9IHJlc3BvbnNlLmRhdGE7XG5cbiAgICAvLyBHb29nbGUgU2hlZXRzIEFQSSByZXR1cm5zIGNhbWVsQ2FzZSBmaWVsZCBuYW1lc1xuICAgIGNvbnN0IHNwcmVhZHNoZWV0SWQgPSBkYXRhLnNwcmVhZHNoZWV0SWQgfHwgZGF0YS5zcHJlYWRzaGVldElkIHx8IGlucHV0LnNwcmVhZHNoZWV0SWQ7XG4gICAgY29uc3QgcmFuZ2UgPSBkYXRhLnJhbmdlIHx8IGlucHV0LnJhbmdlO1xuICAgIGNvbnN0IG1ham9yRGltZW5zaW9uID0gZGF0YS5tYWpvckRpbWVuc2lvbiB8fCAnUk9XUyc7XG4gICAgY29uc3QgdmFsdWVzID0gZGF0YS52YWx1ZXMgfHwgW107XG4gICAgcmV0dXJuIHtcbiAgICAgIHNwcmVhZHNoZWV0SWQ6IHNwcmVhZHNoZWV0SWQsXG4gICAgICByYW5nZTogcmFuZ2UsXG4gICAgICBtYWpvckRpbWVuc2lvbjogbWFqb3JEaW1lbnNpb24sXG4gICAgICB2YWx1ZXM6IHZhbHVlc1xuICAgIH07XG4gIH1cbn07XG5leHBvcnQgdHlwZSBOYW5nb0FjdGlvbkxvY2FsID0gUGFyYW1ldGVyczwodHlwZW9mIGFjdGlvbilbJ2V4ZWMnXT5bMF07XG5leHBvcnQgZGVmYXVsdCBhY3Rpb247Il0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsaUJBQWtCO0FBRWxCLElBQU0sY0FBYyxhQUFFLE9BQU87QUFBQSxFQUMzQixlQUFlLGFBQUUsT0FBTyxFQUFFLFNBQVMsc0VBQXNFO0FBQUEsRUFDekcsT0FBTyxhQUFFLE9BQU8sRUFBRSxTQUFTLDZHQUE2RztBQUMxSSxDQUFDO0FBQ0QsSUFBTSxlQUFlLGFBQUUsT0FBTztBQUFBLEVBQzVCLGVBQWUsYUFBRSxPQUFPO0FBQUEsRUFDeEIsT0FBTyxhQUFFLE9BQU87QUFBQSxFQUNoQixnQkFBZ0IsYUFBRSxLQUFLLENBQUMsUUFBUSxTQUFTLENBQUM7QUFBQSxFQUMxQyxRQUFRLGFBQUUsSUFBSSxFQUFFLFNBQVMscUZBQXFGO0FBQ2hILENBQUM7QUFDRCxJQUFNLFNBQVM7QUFBQSxFQUNiLE1BQU07QUFBQSxFQUNOLGFBQWE7QUFBQSxFQUNiLFNBQVM7QUFBQSxFQUNULFVBQVU7QUFBQSxJQUNSLFFBQVE7QUFBQSxJQUNSLE1BQU07QUFBQSxJQUNOLE9BQU87QUFBQSxFQUNUO0FBQUEsRUFDQSxPQUFPO0FBQUEsRUFDUCxRQUFRO0FBQUEsRUFDUixRQUFRLENBQUMsdURBQXVEO0FBQUEsRUFDaEUsTUFBTSxPQUFPLE9BQU8sVUFBaUQ7QUFFbkUsVUFBTSxXQUFXLE1BQU0sTUFBTSxJQUFJO0FBQUEsTUFDL0IsVUFBVSxvQkFBb0IsbUJBQW1CLE1BQU0sYUFBYSxDQUFDLFdBQVcsbUJBQW1CLE1BQU0sS0FBSyxDQUFDO0FBQUEsTUFDL0csU0FBUztBQUFBLElBQ1gsQ0FBQztBQUNELFVBQU0sT0FBTyxTQUFTO0FBR3RCLFVBQU0sZ0JBQWdCLEtBQUssaUJBQWlCLEtBQUssaUJBQWlCLE1BQU07QUFDeEUsVUFBTSxRQUFRLEtBQUssU0FBUyxNQUFNO0FBQ2xDLFVBQU0saUJBQWlCLEtBQUssa0JBQWtCO0FBQzlDLFVBQU0sU0FBUyxLQUFLLFVBQVUsQ0FBQztBQUMvQixXQUFPO0FBQUEsTUFDTDtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLElBQ0Y7QUFBQSxFQUNGO0FBQ0Y7QUFFQSxJQUFPLHFCQUFROyIsCiAgIm5hbWVzIjogW10KfQo=
