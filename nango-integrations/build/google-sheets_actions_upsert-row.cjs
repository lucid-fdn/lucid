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

// google-sheets/actions/upsert-row.ts
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiZ29vZ2xlLXNoZWV0cy9hY3Rpb25zL3Vwc2VydC1yb3cudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImltcG9ydCB7IHogfSBmcm9tICd6b2QnO1xuaW1wb3J0IHsgY3JlYXRlQWN0aW9uIH0gZnJvbSAnbmFuZ28nO1xuY29uc3QgSW5wdXRTY2hlbWEgPSB6Lm9iamVjdCh7XG4gIHNwcmVhZHNoZWV0SWQ6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ1RoZSBJRCBvZiB0aGUgc3ByZWFkc2hlZXQgdG8gdXBkYXRlLiBFeGFtcGxlOiBcIjFhQmNELi4uXCInKSxcbiAgcmFuZ2U6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ1RoZSBBMSBub3RhdGlvbiBvZiB0aGUgcmFuZ2UgdG8gc2VhcmNoIGZvciBleGlzdGluZyBkYXRhIGFuZCBhcHBlbmQgdG8uIEV4YW1wbGU6IFwiU2hlZXQxIUExOkVcIiBvciBcIlNoZWV0MVwiJyksXG4gIHZhbHVlczogei5hcnJheSh6LnN0cmluZygpKS5kZXNjcmliZSgnVGhlIHJvdyB2YWx1ZXMgdG8gdXBzZXJ0LiBFeGFtcGxlOiBbXCJOYW1lXCIsIFwiRW1haWxcIiwgXCJQaG9uZVwiXScpLFxuICBrZXlDb2x1bW46IHoubnVtYmVyKCkub3B0aW9uYWwoKS5kZXNjcmliZSgnVGhlIGNvbHVtbiBpbmRleCAoMC1iYXNlZCkgdG8gdXNlIGFzIHRoZSBrZXkgZm9yIG1hdGNoaW5nIGV4aXN0aW5nIHJvd3MuIElmIG5vdCBwcm92aWRlZCwgYWx3YXlzIGFwcGVuZHMuJyksXG4gIGtleVZhbHVlOiB6LnN0cmluZygpLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ1RoZSB2YWx1ZSB0byBtYXRjaCBpbiB0aGUga2V5IGNvbHVtbiBmb3IgdXBkYXRpbmcgYW4gZXhpc3Rpbmcgcm93LiBSZXF1aXJlZCBpZiBrZXlfY29sdW1uIGlzIHByb3ZpZGVkLicpXG59KTtcbmNvbnN0IE91dHB1dFNjaGVtYSA9IHoub2JqZWN0KHtcbiAgc3VjY2Vzczogei5ib29sZWFuKCksXG4gIG9wZXJhdGlvbjogei5lbnVtKFsnYXBwZW5kZWQnLCAndXBkYXRlZCddKSxcbiAgc3ByZWFkc2hlZXRJZDogei5zdHJpbmcoKSxcbiAgdXBkYXRlZFJhbmdlOiB6LnN0cmluZygpLFxuICB1cGRhdGVkUm93czogei5udW1iZXIoKVxufSk7XG5jb25zdCBhY3Rpb24gPSB7XG4gIHR5cGU6IFwiYWN0aW9uXCIsXG4gIGRlc2NyaXB0aW9uOiAnQXBwZW5kIG9yIHVwZGF0ZSBhIHJvdyBvZiB2YWx1ZXMgaW4gYSBHb29nbGUgU2hlZXQnLFxuICB2ZXJzaW9uOiAnMS4wLjAnLFxuICBlbmRwb2ludDoge1xuICAgIG1ldGhvZDogJ1BPU1QnLFxuICAgIHBhdGg6ICcvYWN0aW9ucy91cHNlcnQtcm93JyxcbiAgICBncm91cDogJ1NoZWV0cydcbiAgfSxcbiAgaW5wdXQ6IElucHV0U2NoZW1hLFxuICBvdXRwdXQ6IE91dHB1dFNjaGVtYSxcbiAgc2NvcGVzOiBbJ2h0dHBzOi8vd3d3Lmdvb2dsZWFwaXMuY29tL2F1dGgvc3ByZWFkc2hlZXRzJ10sXG4gIGV4ZWM6IGFzeW5jIChuYW5nbywgaW5wdXQpOiBQcm9taXNlPHouaW5mZXI8dHlwZW9mIE91dHB1dFNjaGVtYT4+ID0+IHtcbiAgICBjb25zdCB7XG4gICAgICBzcHJlYWRzaGVldElkLFxuICAgICAgcmFuZ2UsXG4gICAgICB2YWx1ZXMsXG4gICAgICBrZXlDb2x1bW4sXG4gICAgICBrZXlWYWx1ZVxuICAgIH0gPSBpbnB1dDtcblxuICAgIC8vIElmIGtleV9jb2x1bW4gaXMgcHJvdmlkZWQgYnV0IGtleV92YWx1ZSBpcyBtaXNzaW5nLCBlcnJvclxuICAgIGlmIChrZXlDb2x1bW4gIT09IHVuZGVmaW5lZCAmJiAha2V5VmFsdWUpIHtcbiAgICAgIHRocm93IG5ldyBuYW5nby5BY3Rpb25FcnJvcih7XG4gICAgICAgIHR5cGU6ICdpbnZhbGlkX2lucHV0JyxcbiAgICAgICAgbWVzc2FnZTogJ2tleV92YWx1ZSBpcyByZXF1aXJlZCB3aGVuIGtleV9jb2x1bW4gaXMgc3BlY2lmaWVkJ1xuICAgICAgfSk7XG4gICAgfVxuXG4gICAgLy8gSWYgd2UgaGF2ZSBhIGtleV9jb2x1bW4sIHdlIG5lZWQgdG8gc2VhcmNoIGZvciB0aGUgcm93IGZpcnN0XG4gICAgbGV0IHJvd0luZGV4OiBudW1iZXIgfCBudWxsID0gbnVsbDtcbiAgICBpZiAoa2V5Q29sdW1uICE9PSB1bmRlZmluZWQgJiYga2V5VmFsdWUpIHtcbiAgICAgIC8vIFJlYWQgdGhlIGV4aXN0aW5nIGRhdGEgdG8gZmluZCB0aGUgcm93XG4gICAgICAvLyBodHRwczovL2RldmVsb3BlcnMuZ29vZ2xlLmNvbS9zaGVldHMvYXBpL3JlZmVyZW5jZS9yZXN0L3Y0L3NwcmVhZHNoZWV0cy52YWx1ZXMvZ2V0XG4gICAgICBjb25zdCByZWFkUmVzcG9uc2UgPSBhd2FpdCBuYW5nby5nZXQoe1xuICAgICAgICBlbmRwb2ludDogYC92NC9zcHJlYWRzaGVldHMvJHtzcHJlYWRzaGVldElkfS92YWx1ZXMvJHtyYW5nZX1gLFxuICAgICAgICByZXRyaWVzOiAzXG4gICAgICB9KTtcbiAgICAgIGlmIChyZWFkUmVzcG9uc2UuZGF0YSAmJiByZWFkUmVzcG9uc2UuZGF0YS52YWx1ZXMpIHtcbiAgICAgICAgY29uc3Qgcm93czogc3RyaW5nW11bXSA9IHJlYWRSZXNwb25zZS5kYXRhLnZhbHVlcztcbiAgICAgICAgcm93SW5kZXggPSByb3dzLmZpbmRJbmRleChyb3cgPT4gcm93W2tleUNvbHVtbl0gPT09IGtleVZhbHVlKTtcbiAgICAgIH1cbiAgICB9XG4gICAgaWYgKHJvd0luZGV4ICE9PSBudWxsICYmIHJvd0luZGV4ID49IDApIHtcbiAgICAgIC8vIFVwZGF0ZSBleGlzdGluZyByb3dcbiAgICAgIC8vIFdlIG5lZWQgdG8gY29uc3RydWN0IHRoZSBzcGVjaWZpYyBjZWxsIHJhbmdlIGZvciB0aGlzIHJvd1xuICAgICAgLy8gRXh0cmFjdCBzaGVldCBuYW1lIGZyb20gcmFuZ2UgKGUuZy4sIFwiU2hlZXQxIUExOkVcIiAtPiBcIlNoZWV0MVwiKVxuICAgICAgY29uc3Qgc2hlZXROYW1lID0gcmFuZ2UuaW5jbHVkZXMoJyEnKSA/IHJhbmdlLnNwbGl0KCchJylbMF0gOiByYW5nZTtcbiAgICAgIC8vIENhbGN1bGF0ZSB0aGUgcm93IG51bWJlciAocm93SW5kZXggaXMgMC1iYXNlZCBpbiB2YWx1ZXMgYXJyYXksIGJ1dCBzaGVldHMgYXJlIDEtYmFzZWQpXG4gICAgICBjb25zdCByb3dOdW1iZXIgPSByb3dJbmRleCArIDE7XG4gICAgICAvLyBDb25zdHJ1Y3QgcmFuZ2UgbGlrZSBcIlNoZWV0MSFBMzpFM1wiIGZvciByb3cgM1xuICAgICAgY29uc3Qgc3RhcnRDb2wgPSAnQSc7XG4gICAgICBjb25zdCBlbmRDb2wgPSBTdHJpbmcuZnJvbUNoYXJDb2RlKDY1ICsgdmFsdWVzLmxlbmd0aCAtIDEpOyAvLyBBICsgKGxlbmd0aCAtIDEpXG4gICAgICBjb25zdCB1cGRhdGVSYW5nZSA9IGAke3NoZWV0TmFtZX0hJHtzdGFydENvbH0ke3Jvd051bWJlcn06JHtlbmRDb2x9JHtyb3dOdW1iZXJ9YDtcblxuICAgICAgLy8gaHR0cHM6Ly9kZXZlbG9wZXJzLmdvb2dsZS5jb20vc2hlZXRzL2FwaS9yZWZlcmVuY2UvcmVzdC92NC9zcHJlYWRzaGVldHMudmFsdWVzL3VwZGF0ZVxuICAgICAgY29uc3QgdXBkYXRlUmVzcG9uc2UgPSBhd2FpdCBuYW5nby5wdXQoe1xuICAgICAgICBlbmRwb2ludDogYC92NC9zcHJlYWRzaGVldHMvJHtzcHJlYWRzaGVldElkfS92YWx1ZXMvJHt1cGRhdGVSYW5nZX1gLFxuICAgICAgICBwYXJhbXM6IHtcbiAgICAgICAgICB2YWx1ZUlucHV0T3B0aW9uOiAnVVNFUl9FTlRFUkVEJ1xuICAgICAgICB9LFxuICAgICAgICBkYXRhOiB7XG4gICAgICAgICAgcmFuZ2U6IHVwZGF0ZVJhbmdlLFxuICAgICAgICAgIG1ham9yRGltZW5zaW9uOiAnUk9XUycsXG4gICAgICAgICAgdmFsdWVzOiBbdmFsdWVzXVxuICAgICAgICB9LFxuICAgICAgICByZXRyaWVzOiAzXG4gICAgICB9KTtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgIG9wZXJhdGlvbjogJ3VwZGF0ZWQnLFxuICAgICAgICBzcHJlYWRzaGVldElkOiB1cGRhdGVSZXNwb25zZS5kYXRhLnNwcmVhZHNoZWV0SWQsXG4gICAgICAgIHVwZGF0ZWRSYW5nZTogdXBkYXRlUmVzcG9uc2UuZGF0YS51cGRhdGVkUmFuZ2UsXG4gICAgICAgIHVwZGF0ZWRSb3dzOiB1cGRhdGVSZXNwb25zZS5kYXRhLnVwZGF0ZWRSb3dzXG4gICAgICB9O1xuICAgIH0gZWxzZSB7XG4gICAgICAvLyBBcHBlbmQgbmV3IHJvd1xuICAgICAgLy8gaHR0cHM6Ly9kZXZlbG9wZXJzLmdvb2dsZS5jb20vc2hlZXRzL2FwaS9yZWZlcmVuY2UvcmVzdC92NC9zcHJlYWRzaGVldHMudmFsdWVzL2FwcGVuZFxuICAgICAgY29uc3QgYXBwZW5kUmVzcG9uc2UgPSBhd2FpdCBuYW5nby5wb3N0KHtcbiAgICAgICAgZW5kcG9pbnQ6IGAvdjQvc3ByZWFkc2hlZXRzLyR7c3ByZWFkc2hlZXRJZH0vdmFsdWVzLyR7cmFuZ2V9OmFwcGVuZGAsXG4gICAgICAgIHBhcmFtczoge1xuICAgICAgICAgIHZhbHVlSW5wdXRPcHRpb246ICdVU0VSX0VOVEVSRUQnLFxuICAgICAgICAgIGluc2VydERhdGFPcHRpb246ICdJTlNFUlRfUk9XUydcbiAgICAgICAgfSxcbiAgICAgICAgZGF0YToge1xuICAgICAgICAgIHJhbmdlOiByYW5nZSxcbiAgICAgICAgICBtYWpvckRpbWVuc2lvbjogJ1JPV1MnLFxuICAgICAgICAgIHZhbHVlczogW3ZhbHVlc11cbiAgICAgICAgfSxcbiAgICAgICAgcmV0cmllczogM1xuICAgICAgfSk7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICBvcGVyYXRpb246ICdhcHBlbmRlZCcsXG4gICAgICAgIHNwcmVhZHNoZWV0SWQ6IGFwcGVuZFJlc3BvbnNlLmRhdGEuc3ByZWFkc2hlZXRJZCxcbiAgICAgICAgdXBkYXRlZFJhbmdlOiBhcHBlbmRSZXNwb25zZS5kYXRhLnVwZGF0ZXM/LnVwZGF0ZWRSYW5nZSB8fCAnJyxcbiAgICAgICAgdXBkYXRlZFJvd3M6IGFwcGVuZFJlc3BvbnNlLmRhdGEudXBkYXRlcz8udXBkYXRlZFJvd3MgfHwgMVxuICAgICAgfTtcbiAgICB9XG4gIH1cbn07XG5leHBvcnQgdHlwZSBOYW5nb0FjdGlvbkxvY2FsID0gUGFyYW1ldGVyczwodHlwZW9mIGFjdGlvbilbJ2V4ZWMnXT5bMF07XG5leHBvcnQgZGVmYXVsdCBhY3Rpb247Il0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsaUJBQWtCO0FBRWxCLElBQU0sY0FBYyxhQUFFLE9BQU87QUFBQSxFQUMzQixlQUFlLGFBQUUsT0FBTyxFQUFFLFNBQVMsMERBQTBEO0FBQUEsRUFDN0YsT0FBTyxhQUFFLE9BQU8sRUFBRSxTQUFTLDRHQUE0RztBQUFBLEVBQ3ZJLFFBQVEsYUFBRSxNQUFNLGFBQUUsT0FBTyxDQUFDLEVBQUUsU0FBUywrREFBK0Q7QUFBQSxFQUNwRyxXQUFXLGFBQUUsT0FBTyxFQUFFLFNBQVMsRUFBRSxTQUFTLDJHQUEyRztBQUFBLEVBQ3JKLFVBQVUsYUFBRSxPQUFPLEVBQUUsU0FBUyxFQUFFLFNBQVMsd0dBQXdHO0FBQ25KLENBQUM7QUFDRCxJQUFNLGVBQWUsYUFBRSxPQUFPO0FBQUEsRUFDNUIsU0FBUyxhQUFFLFFBQVE7QUFBQSxFQUNuQixXQUFXLGFBQUUsS0FBSyxDQUFDLFlBQVksU0FBUyxDQUFDO0FBQUEsRUFDekMsZUFBZSxhQUFFLE9BQU87QUFBQSxFQUN4QixjQUFjLGFBQUUsT0FBTztBQUFBLEVBQ3ZCLGFBQWEsYUFBRSxPQUFPO0FBQ3hCLENBQUM7QUFDRCxJQUFNLFNBQVM7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
