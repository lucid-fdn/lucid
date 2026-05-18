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

// google-sheets/actions/append-rows.ts
var append_rows_exports = {};
__export(append_rows_exports, {
  default: () => append_rows_default
});
module.exports = __toCommonJS(append_rows_exports);
var z = __toESM(require("zod"), 1);
var inputSchema = z.object({
  spreadsheet_id: z.string().describe("The Google Sheets spreadsheet ID"),
  range: z.string().optional().describe('A1 notation range to append to (default: "Sheet1")'),
  values: z.array(z.array(z.unknown())).describe("Rows to append (array of arrays)")
});
var outputSchema = z.object({
  spreadsheet_id: z.string(),
  updated_range: z.string(),
  updated_rows: z.number(),
  updated_cells: z.number()
});
var action = {
  type: "action",
  description: "Append rows to a Google Sheets spreadsheet",
  version: "1.0.0",
  endpoint: {
    method: "POST",
    path: "/google-sheets/append",
    group: "Data"
  },
  input: inputSchema,
  output: outputSchema,
  exec: async (nango, input) => {
    const range = input.range || "Sheet1";
    const response = await nango.proxy({
      baseUrlOverride: "https://sheets.googleapis.com",
      method: "POST",
      endpoint: `/v4/spreadsheets/${input.spreadsheet_id}/values/${encodeURIComponent(range)}:append`,
      params: {
        valueInputOption: "USER_ENTERED",
        insertDataOption: "INSERT_ROWS"
      },
      data: {
        values: input.values
      }
    });
    if (response.data?.error) {
      throw new Error(`Google Sheets error: ${response.data.error.message}`);
    }
    const updates = response.data?.updates || {};
    return {
      spreadsheet_id: input.spreadsheet_id,
      updated_range: updates.updatedRange || range,
      updated_rows: updates.updatedRows || input.values.length,
      updated_cells: updates.updatedCells || 0
    };
  }
};
var append_rows_default = action;
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiZ29vZ2xlLXNoZWV0cy9hY3Rpb25zL2FwcGVuZC1yb3dzLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyJpbXBvcnQgeyBjcmVhdGVBY3Rpb24gfSBmcm9tICduYW5nbyc7XG5pbXBvcnQgKiBhcyB6IGZyb20gJ3pvZCc7XG5jb25zdCBpbnB1dFNjaGVtYSA9IHoub2JqZWN0KHtcbiAgc3ByZWFkc2hlZXRfaWQ6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ1RoZSBHb29nbGUgU2hlZXRzIHNwcmVhZHNoZWV0IElEJyksXG4gIHJhbmdlOiB6LnN0cmluZygpLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ0ExIG5vdGF0aW9uIHJhbmdlIHRvIGFwcGVuZCB0byAoZGVmYXVsdDogXCJTaGVldDFcIiknKSxcbiAgdmFsdWVzOiB6LmFycmF5KHouYXJyYXkoei51bmtub3duKCkpKS5kZXNjcmliZSgnUm93cyB0byBhcHBlbmQgKGFycmF5IG9mIGFycmF5cyknKVxufSk7XG5jb25zdCBvdXRwdXRTY2hlbWEgPSB6Lm9iamVjdCh7XG4gIHNwcmVhZHNoZWV0X2lkOiB6LnN0cmluZygpLFxuICB1cGRhdGVkX3JhbmdlOiB6LnN0cmluZygpLFxuICB1cGRhdGVkX3Jvd3M6IHoubnVtYmVyKCksXG4gIHVwZGF0ZWRfY2VsbHM6IHoubnVtYmVyKClcbn0pO1xuY29uc3QgYWN0aW9uID0ge1xuICB0eXBlOiBcImFjdGlvblwiLFxuICBkZXNjcmlwdGlvbjogJ0FwcGVuZCByb3dzIHRvIGEgR29vZ2xlIFNoZWV0cyBzcHJlYWRzaGVldCcsXG4gIHZlcnNpb246ICcxLjAuMCcsXG4gIGVuZHBvaW50OiB7XG4gICAgbWV0aG9kOiAnUE9TVCcsXG4gICAgcGF0aDogJy9nb29nbGUtc2hlZXRzL2FwcGVuZCcsXG4gICAgZ3JvdXA6ICdEYXRhJ1xuICB9LFxuICBpbnB1dDogaW5wdXRTY2hlbWEsXG4gIG91dHB1dDogb3V0cHV0U2NoZW1hLFxuICBleGVjOiBhc3luYyAobmFuZ28sIGlucHV0KSA9PiB7XG4gICAgY29uc3QgcmFuZ2UgPSBpbnB1dC5yYW5nZSB8fCAnU2hlZXQxJztcbiAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IG5hbmdvLnByb3h5KHtcbiAgICAgIGJhc2VVcmxPdmVycmlkZTogJ2h0dHBzOi8vc2hlZXRzLmdvb2dsZWFwaXMuY29tJyxcbiAgICAgIG1ldGhvZDogJ1BPU1QnLFxuICAgICAgZW5kcG9pbnQ6IGAvdjQvc3ByZWFkc2hlZXRzLyR7aW5wdXQuc3ByZWFkc2hlZXRfaWR9L3ZhbHVlcy8ke2VuY29kZVVSSUNvbXBvbmVudChyYW5nZSl9OmFwcGVuZGAsXG4gICAgICBwYXJhbXM6IHtcbiAgICAgICAgdmFsdWVJbnB1dE9wdGlvbjogJ1VTRVJfRU5URVJFRCcsXG4gICAgICAgIGluc2VydERhdGFPcHRpb246ICdJTlNFUlRfUk9XUydcbiAgICAgIH0sXG4gICAgICBkYXRhOiB7XG4gICAgICAgIHZhbHVlczogaW5wdXQudmFsdWVzXG4gICAgICB9XG4gICAgfSk7XG4gICAgaWYgKHJlc3BvbnNlLmRhdGE/LmVycm9yKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoYEdvb2dsZSBTaGVldHMgZXJyb3I6ICR7cmVzcG9uc2UuZGF0YS5lcnJvci5tZXNzYWdlfWApO1xuICAgIH1cbiAgICBjb25zdCB1cGRhdGVzID0gcmVzcG9uc2UuZGF0YT8udXBkYXRlcyB8fCB7fTtcbiAgICByZXR1cm4ge1xuICAgICAgc3ByZWFkc2hlZXRfaWQ6IGlucHV0LnNwcmVhZHNoZWV0X2lkLFxuICAgICAgdXBkYXRlZF9yYW5nZTogdXBkYXRlcy51cGRhdGVkUmFuZ2UgfHwgcmFuZ2UsXG4gICAgICB1cGRhdGVkX3Jvd3M6IHVwZGF0ZXMudXBkYXRlZFJvd3MgfHwgaW5wdXQudmFsdWVzLmxlbmd0aCxcbiAgICAgIHVwZGF0ZWRfY2VsbHM6IHVwZGF0ZXMudXBkYXRlZENlbGxzIHx8IDBcbiAgICB9O1xuICB9XG59O1xuZXhwb3J0IGRlZmF1bHQgYWN0aW9uOyJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFDQSxRQUFtQjtBQUNuQixJQUFNLGNBQWdCLFNBQU87QUFBQSxFQUMzQixnQkFBa0IsU0FBTyxFQUFFLFNBQVMsa0NBQWtDO0FBQUEsRUFDdEUsT0FBUyxTQUFPLEVBQUUsU0FBUyxFQUFFLFNBQVMsb0RBQW9EO0FBQUEsRUFDMUYsUUFBVSxRQUFRLFFBQVEsVUFBUSxDQUFDLENBQUMsRUFBRSxTQUFTLGtDQUFrQztBQUNuRixDQUFDO0FBQ0QsSUFBTSxlQUFpQixTQUFPO0FBQUEsRUFDNUIsZ0JBQWtCLFNBQU87QUFBQSxFQUN6QixlQUFpQixTQUFPO0FBQUEsRUFDeEIsY0FBZ0IsU0FBTztBQUFBLEVBQ3ZCLGVBQWlCLFNBQU87QUFDMUIsQ0FBQztBQUNELElBQU0sU0FBUztBQUFBLEVBQ2IsTUFBTTtBQUFBLEVBQ04sYUFBYTtBQUFBLEVBQ2IsU0FBUztBQUFBLEVBQ1QsVUFBVTtBQUFBLElBQ1IsUUFBUTtBQUFBLElBQ1IsTUFBTTtBQUFBLElBQ04sT0FBTztBQUFBLEVBQ1Q7QUFBQSxFQUNBLE9BQU87QUFBQSxFQUNQLFFBQVE7QUFBQSxFQUNSLE1BQU0sT0FBTyxPQUFPLFVBQVU7QUFDNUIsVUFBTSxRQUFRLE1BQU0sU0FBUztBQUM3QixVQUFNLFdBQVcsTUFBTSxNQUFNLE1BQU07QUFBQSxNQUNqQyxpQkFBaUI7QUFBQSxNQUNqQixRQUFRO0FBQUEsTUFDUixVQUFVLG9CQUFvQixNQUFNLGNBQWMsV0FBVyxtQkFBbUIsS0FBSyxDQUFDO0FBQUEsTUFDdEYsUUFBUTtBQUFBLFFBQ04sa0JBQWtCO0FBQUEsUUFDbEIsa0JBQWtCO0FBQUEsTUFDcEI7QUFBQSxNQUNBLE1BQU07QUFBQSxRQUNKLFFBQVEsTUFBTTtBQUFBLE1BQ2hCO0FBQUEsSUFDRixDQUFDO0FBQ0QsUUFBSSxTQUFTLE1BQU0sT0FBTztBQUN4QixZQUFNLElBQUksTUFBTSx3QkFBd0IsU0FBUyxLQUFLLE1BQU0sT0FBTyxFQUFFO0FBQUEsSUFDdkU7QUFDQSxVQUFNLFVBQVUsU0FBUyxNQUFNLFdBQVcsQ0FBQztBQUMzQyxXQUFPO0FBQUEsTUFDTCxnQkFBZ0IsTUFBTTtBQUFBLE1BQ3RCLGVBQWUsUUFBUSxnQkFBZ0I7QUFBQSxNQUN2QyxjQUFjLFFBQVEsZUFBZSxNQUFNLE9BQU87QUFBQSxNQUNsRCxlQUFlLFFBQVEsZ0JBQWdCO0FBQUEsSUFDekM7QUFBQSxFQUNGO0FBQ0Y7QUFDQSxJQUFPLHNCQUFROyIsCiAgIm5hbWVzIjogW10KfQo=
