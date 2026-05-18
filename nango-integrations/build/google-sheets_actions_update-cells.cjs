"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
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
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// google-sheets/actions/update-cells.ts
var update_cells_exports = {};
__export(update_cells_exports, {
  default: () => update_cells_default
});
module.exports = __toCommonJS(update_cells_exports);
var z = __toESM(require("zod"), 1);
var inputSchema = z.object({
  spreadsheet_id: z.string().describe("The Google Sheets spreadsheet ID"),
  range: z.string().describe('A1 notation range to update (e.g. "Sheet1!A1:C3")'),
  values: z.array(z.array(z.unknown())).describe("New values (array of arrays matching the range dimensions)")
});
var outputSchema = z.object({
  spreadsheet_id: z.string(),
  updated_range: z.string(),
  updated_rows: z.number(),
  updated_cells: z.number()
});
var action = {
  type: "action",
  description: "Update specific cells in a Google Sheets spreadsheet",
  version: "1.0.0",
  endpoint: {
    method: "PUT",
    path: "/google-sheets/update",
    group: "Data"
  },
  input: inputSchema,
  output: outputSchema,
  exec: async (nango, input) => {
    const response = await nango.proxy({
      baseUrlOverride: "https://sheets.googleapis.com",
      method: "PUT",
      endpoint: `/v4/spreadsheets/${input.spreadsheet_id}/values/${encodeURIComponent(input.range)}`,
      params: {
        valueInputOption: "USER_ENTERED"
      },
      data: {
        range: input.range,
        values: input.values
      }
    });
    if (response.data?.error) {
      throw new Error(`Google Sheets error: ${response.data.error.message}`);
    }
    return {
      spreadsheet_id: input.spreadsheet_id,
      updated_range: response.data?.updatedRange || input.range,
      updated_rows: response.data?.updatedRows || 0,
      updated_cells: response.data?.updatedCells || 0
    };
  }
};
var update_cells_default = action;
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiZ29vZ2xlLXNoZWV0cy9hY3Rpb25zL3VwZGF0ZS1jZWxscy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiaW1wb3J0IHsgY3JlYXRlQWN0aW9uIH0gZnJvbSAnbmFuZ28nO1xuaW1wb3J0ICogYXMgeiBmcm9tICd6b2QnO1xuY29uc3QgaW5wdXRTY2hlbWEgPSB6Lm9iamVjdCh7XG4gIHNwcmVhZHNoZWV0X2lkOiB6LnN0cmluZygpLmRlc2NyaWJlKCdUaGUgR29vZ2xlIFNoZWV0cyBzcHJlYWRzaGVldCBJRCcpLFxuICByYW5nZTogei5zdHJpbmcoKS5kZXNjcmliZSgnQTEgbm90YXRpb24gcmFuZ2UgdG8gdXBkYXRlIChlLmcuIFwiU2hlZXQxIUExOkMzXCIpJyksXG4gIHZhbHVlczogei5hcnJheSh6LmFycmF5KHoudW5rbm93bigpKSkuZGVzY3JpYmUoJ05ldyB2YWx1ZXMgKGFycmF5IG9mIGFycmF5cyBtYXRjaGluZyB0aGUgcmFuZ2UgZGltZW5zaW9ucyknKVxufSk7XG5jb25zdCBvdXRwdXRTY2hlbWEgPSB6Lm9iamVjdCh7XG4gIHNwcmVhZHNoZWV0X2lkOiB6LnN0cmluZygpLFxuICB1cGRhdGVkX3JhbmdlOiB6LnN0cmluZygpLFxuICB1cGRhdGVkX3Jvd3M6IHoubnVtYmVyKCksXG4gIHVwZGF0ZWRfY2VsbHM6IHoubnVtYmVyKClcbn0pO1xuY29uc3QgYWN0aW9uID0ge1xuICB0eXBlOiBcImFjdGlvblwiLFxuICBkZXNjcmlwdGlvbjogJ1VwZGF0ZSBzcGVjaWZpYyBjZWxscyBpbiBhIEdvb2dsZSBTaGVldHMgc3ByZWFkc2hlZXQnLFxuICB2ZXJzaW9uOiAnMS4wLjAnLFxuICBlbmRwb2ludDoge1xuICAgIG1ldGhvZDogJ1BVVCcsXG4gICAgcGF0aDogJy9nb29nbGUtc2hlZXRzL3VwZGF0ZScsXG4gICAgZ3JvdXA6ICdEYXRhJ1xuICB9LFxuICBpbnB1dDogaW5wdXRTY2hlbWEsXG4gIG91dHB1dDogb3V0cHV0U2NoZW1hLFxuICBleGVjOiBhc3luYyAobmFuZ28sIGlucHV0KSA9PiB7XG4gICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBuYW5nby5wcm94eSh7XG4gICAgICBiYXNlVXJsT3ZlcnJpZGU6ICdodHRwczovL3NoZWV0cy5nb29nbGVhcGlzLmNvbScsXG4gICAgICBtZXRob2Q6ICdQVVQnLFxuICAgICAgZW5kcG9pbnQ6IGAvdjQvc3ByZWFkc2hlZXRzLyR7aW5wdXQuc3ByZWFkc2hlZXRfaWR9L3ZhbHVlcy8ke2VuY29kZVVSSUNvbXBvbmVudChpbnB1dC5yYW5nZSl9YCxcbiAgICAgIHBhcmFtczoge1xuICAgICAgICB2YWx1ZUlucHV0T3B0aW9uOiAnVVNFUl9FTlRFUkVEJ1xuICAgICAgfSxcbiAgICAgIGRhdGE6IHtcbiAgICAgICAgcmFuZ2U6IGlucHV0LnJhbmdlLFxuICAgICAgICB2YWx1ZXM6IGlucHV0LnZhbHVlc1xuICAgICAgfVxuICAgIH0pO1xuICAgIGlmIChyZXNwb25zZS5kYXRhPy5lcnJvcikge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKGBHb29nbGUgU2hlZXRzIGVycm9yOiAke3Jlc3BvbnNlLmRhdGEuZXJyb3IubWVzc2FnZX1gKTtcbiAgICB9XG4gICAgcmV0dXJuIHtcbiAgICAgIHNwcmVhZHNoZWV0X2lkOiBpbnB1dC5zcHJlYWRzaGVldF9pZCxcbiAgICAgIHVwZGF0ZWRfcmFuZ2U6IHJlc3BvbnNlLmRhdGE/LnVwZGF0ZWRSYW5nZSB8fCBpbnB1dC5yYW5nZSxcbiAgICAgIHVwZGF0ZWRfcm93czogcmVzcG9uc2UuZGF0YT8udXBkYXRlZFJvd3MgfHwgMCxcbiAgICAgIHVwZGF0ZWRfY2VsbHM6IHJlc3BvbnNlLmRhdGE/LnVwZGF0ZWRDZWxscyB8fCAwXG4gICAgfTtcbiAgfVxufTtcbmV4cG9ydCBkZWZhdWx0IGFjdGlvbjsiXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQ0EsUUFBbUI7QUFDbkIsSUFBTSxjQUFnQixTQUFPO0FBQUEsRUFDM0IsZ0JBQWtCLFNBQU8sRUFBRSxTQUFTLGtDQUFrQztBQUFBLEVBQ3RFLE9BQVMsU0FBTyxFQUFFLFNBQVMsbURBQW1EO0FBQUEsRUFDOUUsUUFBVSxRQUFRLFFBQVEsVUFBUSxDQUFDLENBQUMsRUFBRSxTQUFTLDREQUE0RDtBQUM3RyxDQUFDO0FBQ0QsSUFBTSxlQUFpQixTQUFPO0FBQUEsRUFDNUIsZ0JBQWtCLFNBQU87QUFBQSxFQUN6QixlQUFpQixTQUFPO0FBQUEsRUFDeEIsY0FBZ0IsU0FBTztBQUFBLEVBQ3ZCLGVBQWlCLFNBQU87QUFDMUIsQ0FBQztBQUNELElBQU0sU0FBUztBQUFBLEVBQ2IsTUFBTTtBQUFBLEVBQ04sYUFBYTtBQUFBLEVBQ2IsU0FBUztBQUFBLEVBQ1QsVUFBVTtBQUFBLElBQ1IsUUFBUTtBQUFBLElBQ1IsTUFBTTtBQUFBLElBQ04sT0FBTztBQUFBLEVBQ1Q7QUFBQSxFQUNBLE9BQU87QUFBQSxFQUNQLFFBQVE7QUFBQSxFQUNSLE1BQU0sT0FBTyxPQUFPLFVBQVU7QUFDNUIsVUFBTSxXQUFXLE1BQU0sTUFBTSxNQUFNO0FBQUEsTUFDakMsaUJBQWlCO0FBQUEsTUFDakIsUUFBUTtBQUFBLE1BQ1IsVUFBVSxvQkFBb0IsTUFBTSxjQUFjLFdBQVcsbUJBQW1CLE1BQU0sS0FBSyxDQUFDO0FBQUEsTUFDNUYsUUFBUTtBQUFBLFFBQ04sa0JBQWtCO0FBQUEsTUFDcEI7QUFBQSxNQUNBLE1BQU07QUFBQSxRQUNKLE9BQU8sTUFBTTtBQUFBLFFBQ2IsUUFBUSxNQUFNO0FBQUEsTUFDaEI7QUFBQSxJQUNGLENBQUM7QUFDRCxRQUFJLFNBQVMsTUFBTSxPQUFPO0FBQ3hCLFlBQU0sSUFBSSxNQUFNLHdCQUF3QixTQUFTLEtBQUssTUFBTSxPQUFPLEVBQUU7QUFBQSxJQUN2RTtBQUNBLFdBQU87QUFBQSxNQUNMLGdCQUFnQixNQUFNO0FBQUEsTUFDdEIsZUFBZSxTQUFTLE1BQU0sZ0JBQWdCLE1BQU07QUFBQSxNQUNwRCxjQUFjLFNBQVMsTUFBTSxlQUFlO0FBQUEsTUFDNUMsZUFBZSxTQUFTLE1BQU0sZ0JBQWdCO0FBQUEsSUFDaEQ7QUFBQSxFQUNGO0FBQ0Y7QUFDQSxJQUFPLHVCQUFROyIsCiAgIm5hbWVzIjogW10KfQo=
