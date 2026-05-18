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

// google-sheets/actions/create-spreadsheet-row.ts
var create_spreadsheet_row_exports = {};
__export(create_spreadsheet_row_exports, {
  default: () => create_spreadsheet_row_default
});
module.exports = __toCommonJS(create_spreadsheet_row_exports);
var import_zod = require("zod");
var InputSchema = import_zod.z.object({
  spreadsheetId: import_zod.z.string().describe('The ID of the spreadsheet. Example: "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms"'),
  sheetId: import_zod.z.number().describe("The ID of the sheet (can be found via the API). Example: 687284948"),
  sheetName: import_zod.z.string().describe('The name of the sheet for A1 notation. Example: "Sheet1"'),
  rowIndex: import_zod.z.number().describe("The index where to insert the row (0-based, where 0 is the first row). Example: 5"),
  values: import_zod.z.array(import_zod.z.string()).describe('Array of values to insert in the new row. Example: ["John", "Doe", "john@example.com"]')
});
var OutputSchema = import_zod.z.object({
  spreadsheetId: import_zod.z.string(),
  sheetId: import_zod.z.number(),
  rowIndex: import_zod.z.number(),
  values: import_zod.z.array(import_zod.z.string()),
  updatedRange: import_zod.z.string()
});
var action = {
  type: "action",
  description: "Insert a new row at a given index in a Google Sheet",
  version: "1.0.0",
  endpoint: {
    method: "POST",
    path: "/actions/create-spreadsheet-row",
    group: "Spreadsheets"
  },
  input: InputSchema,
  output: OutputSchema,
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  exec: async (nango, input) => {
    await nango.post({
      endpoint: `/v4/spreadsheets/${input.spreadsheetId}:batchUpdate`,
      data: {
        requests: [{
          insertDimension: {
            range: {
              sheetId: input.sheetId,
              dimension: "ROWS",
              startIndex: input.rowIndex,
              endIndex: input.rowIndex + 1
            },
            inheritFromBefore: false
          }
        }]
      },
      retries: 3
    });
    const endColumn = input.values.length > 0 ? String.fromCharCode(65 + Math.min(input.values.length - 1, 25)) : "A";
    const range = `${input.sheetName}!A${input.rowIndex + 1}:${endColumn}${input.rowIndex + 1}`;
    const updateResponse = await nango.put({
      endpoint: `/v4/spreadsheets/${input.spreadsheetId}/values/${encodeURIComponent(range)}`,
      params: {
        valueInputOption: "USER_ENTERED"
      },
      data: {
        majorDimension: "ROWS",
        values: [input.values]
      },
      retries: 3
    });
    return {
      spreadsheetId: input.spreadsheetId,
      sheetId: input.sheetId,
      rowIndex: input.rowIndex,
      values: input.values,
      updatedRange: updateResponse.data?.updatedRange || range
    };
  }
};
var create_spreadsheet_row_default = action;
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiZ29vZ2xlLXNoZWV0cy9hY3Rpb25zL2NyZWF0ZS1zcHJlYWRzaGVldC1yb3cudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImltcG9ydCB7IHogfSBmcm9tICd6b2QnO1xuaW1wb3J0IHsgY3JlYXRlQWN0aW9uIH0gZnJvbSAnbmFuZ28nO1xuY29uc3QgSW5wdXRTY2hlbWEgPSB6Lm9iamVjdCh7XG4gIHNwcmVhZHNoZWV0SWQ6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ1RoZSBJRCBvZiB0aGUgc3ByZWFkc2hlZXQuIEV4YW1wbGU6IFwiMUJ4aU1WczBYUkE1bkZNZEt2QmRCWmpnbVVVcXB0bGJzNzRPZ3ZFMnVwbXNcIicpLFxuICBzaGVldElkOiB6Lm51bWJlcigpLmRlc2NyaWJlKCdUaGUgSUQgb2YgdGhlIHNoZWV0IChjYW4gYmUgZm91bmQgdmlhIHRoZSBBUEkpLiBFeGFtcGxlOiA2ODcyODQ5NDgnKSxcbiAgc2hlZXROYW1lOiB6LnN0cmluZygpLmRlc2NyaWJlKCdUaGUgbmFtZSBvZiB0aGUgc2hlZXQgZm9yIEExIG5vdGF0aW9uLiBFeGFtcGxlOiBcIlNoZWV0MVwiJyksXG4gIHJvd0luZGV4OiB6Lm51bWJlcigpLmRlc2NyaWJlKCdUaGUgaW5kZXggd2hlcmUgdG8gaW5zZXJ0IHRoZSByb3cgKDAtYmFzZWQsIHdoZXJlIDAgaXMgdGhlIGZpcnN0IHJvdykuIEV4YW1wbGU6IDUnKSxcbiAgdmFsdWVzOiB6LmFycmF5KHouc3RyaW5nKCkpLmRlc2NyaWJlKCdBcnJheSBvZiB2YWx1ZXMgdG8gaW5zZXJ0IGluIHRoZSBuZXcgcm93LiBFeGFtcGxlOiBbXCJKb2huXCIsIFwiRG9lXCIsIFwiam9obkBleGFtcGxlLmNvbVwiXScpXG59KTtcbmNvbnN0IE91dHB1dFNjaGVtYSA9IHoub2JqZWN0KHtcbiAgc3ByZWFkc2hlZXRJZDogei5zdHJpbmcoKSxcbiAgc2hlZXRJZDogei5udW1iZXIoKSxcbiAgcm93SW5kZXg6IHoubnVtYmVyKCksXG4gIHZhbHVlczogei5hcnJheSh6LnN0cmluZygpKSxcbiAgdXBkYXRlZFJhbmdlOiB6LnN0cmluZygpXG59KTtcbmNvbnN0IGFjdGlvbiA9IHtcbiAgdHlwZTogXCJhY3Rpb25cIixcbiAgZGVzY3JpcHRpb246ICdJbnNlcnQgYSBuZXcgcm93IGF0IGEgZ2l2ZW4gaW5kZXggaW4gYSBHb29nbGUgU2hlZXQnLFxuICB2ZXJzaW9uOiAnMS4wLjAnLFxuICBlbmRwb2ludDoge1xuICAgIG1ldGhvZDogJ1BPU1QnLFxuICAgIHBhdGg6ICcvYWN0aW9ucy9jcmVhdGUtc3ByZWFkc2hlZXQtcm93JyxcbiAgICBncm91cDogJ1NwcmVhZHNoZWV0cydcbiAgfSxcbiAgaW5wdXQ6IElucHV0U2NoZW1hLFxuICBvdXRwdXQ6IE91dHB1dFNjaGVtYSxcbiAgc2NvcGVzOiBbJ2h0dHBzOi8vd3d3Lmdvb2dsZWFwaXMuY29tL2F1dGgvc3ByZWFkc2hlZXRzJ10sXG4gIGV4ZWM6IGFzeW5jIChuYW5nbywgaW5wdXQpOiBQcm9taXNlPHouaW5mZXI8dHlwZW9mIE91dHB1dFNjaGVtYT4+ID0+IHtcbiAgICAvLyBTdGVwIDE6IEluc2VydCBhIG5ldyByb3cgYXQgdGhlIHNwZWNpZmllZCBpbmRleFxuICAgIC8vIGh0dHBzOi8vZGV2ZWxvcGVycy5nb29nbGUuY29tL3NoZWV0cy9hcGkvcmVmZXJlbmNlL3Jlc3QvdjQvc3ByZWFkc2hlZXRzL3JlcXVlc3QjSW5zZXJ0RGltZW5zaW9uUmVxdWVzdFxuICAgIGF3YWl0IG5hbmdvLnBvc3Qoe1xuICAgICAgZW5kcG9pbnQ6IGAvdjQvc3ByZWFkc2hlZXRzLyR7aW5wdXQuc3ByZWFkc2hlZXRJZH06YmF0Y2hVcGRhdGVgLFxuICAgICAgZGF0YToge1xuICAgICAgICByZXF1ZXN0czogW3tcbiAgICAgICAgICBpbnNlcnREaW1lbnNpb246IHtcbiAgICAgICAgICAgIHJhbmdlOiB7XG4gICAgICAgICAgICAgIHNoZWV0SWQ6IGlucHV0LnNoZWV0SWQsXG4gICAgICAgICAgICAgIGRpbWVuc2lvbjogJ1JPV1MnLFxuICAgICAgICAgICAgICBzdGFydEluZGV4OiBpbnB1dC5yb3dJbmRleCxcbiAgICAgICAgICAgICAgZW5kSW5kZXg6IGlucHV0LnJvd0luZGV4ICsgMVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIGluaGVyaXRGcm9tQmVmb3JlOiBmYWxzZVxuICAgICAgICAgIH1cbiAgICAgICAgfV1cbiAgICAgIH0sXG4gICAgICByZXRyaWVzOiAzXG4gICAgfSk7XG5cbiAgICAvLyBTdGVwIDI6IFVwZGF0ZSB0aGUgdmFsdWVzIGluIHRoZSBuZXdseSBpbnNlcnRlZCByb3dcbiAgICAvLyBodHRwczovL2RldmVsb3BlcnMuZ29vZ2xlLmNvbS9zaGVldHMvYXBpL3JlZmVyZW5jZS9yZXN0L3Y0L3NwcmVhZHNoZWV0cy52YWx1ZXMvdXBkYXRlXG4gICAgLy8gQnVpbGQgcmFuZ2UgbGlrZSBcIlNoZWV0MSFBNTpDNVwiIHdoZXJlIHJvd19pbmRleD00ICgwLWJhc2VkKSAtPiByb3cgNSAoMS1iYXNlZClcbiAgICBjb25zdCBlbmRDb2x1bW4gPSBpbnB1dC52YWx1ZXMubGVuZ3RoID4gMCA/IFN0cmluZy5mcm9tQ2hhckNvZGUoNjUgKyBNYXRoLm1pbihpbnB1dC52YWx1ZXMubGVuZ3RoIC0gMSwgMjUpKSA6ICdBJztcbiAgICBjb25zdCByYW5nZSA9IGAke2lucHV0LnNoZWV0TmFtZX0hQSR7aW5wdXQucm93SW5kZXggKyAxfToke2VuZENvbHVtbn0ke2lucHV0LnJvd0luZGV4ICsgMX1gO1xuICAgIGNvbnN0IHVwZGF0ZVJlc3BvbnNlID0gYXdhaXQgbmFuZ28ucHV0KHtcbiAgICAgIGVuZHBvaW50OiBgL3Y0L3NwcmVhZHNoZWV0cy8ke2lucHV0LnNwcmVhZHNoZWV0SWR9L3ZhbHVlcy8ke2VuY29kZVVSSUNvbXBvbmVudChyYW5nZSl9YCxcbiAgICAgIHBhcmFtczoge1xuICAgICAgICB2YWx1ZUlucHV0T3B0aW9uOiAnVVNFUl9FTlRFUkVEJ1xuICAgICAgfSxcbiAgICAgIGRhdGE6IHtcbiAgICAgICAgbWFqb3JEaW1lbnNpb246ICdST1dTJyxcbiAgICAgICAgdmFsdWVzOiBbaW5wdXQudmFsdWVzXVxuICAgICAgfSxcbiAgICAgIHJldHJpZXM6IDNcbiAgICB9KTtcbiAgICByZXR1cm4ge1xuICAgICAgc3ByZWFkc2hlZXRJZDogaW5wdXQuc3ByZWFkc2hlZXRJZCxcbiAgICAgIHNoZWV0SWQ6IGlucHV0LnNoZWV0SWQsXG4gICAgICByb3dJbmRleDogaW5wdXQucm93SW5kZXgsXG4gICAgICB2YWx1ZXM6IGlucHV0LnZhbHVlcyxcbiAgICAgIHVwZGF0ZWRSYW5nZTogdXBkYXRlUmVzcG9uc2UuZGF0YT8udXBkYXRlZFJhbmdlIHx8IHJhbmdlXG4gICAgfTtcbiAgfVxufTtcbmV4cG9ydCB0eXBlIE5hbmdvQWN0aW9uTG9jYWwgPSBQYXJhbWV0ZXJzPCh0eXBlb2YgYWN0aW9uKVsnZXhlYyddPlswXTtcbmV4cG9ydCBkZWZhdWx0IGFjdGlvbjsiXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxpQkFBa0I7QUFFbEIsSUFBTSxjQUFjLGFBQUUsT0FBTztBQUFBLEVBQzNCLGVBQWUsYUFBRSxPQUFPLEVBQUUsU0FBUyxvRkFBb0Y7QUFBQSxFQUN2SCxTQUFTLGFBQUUsT0FBTyxFQUFFLFNBQVMsb0VBQW9FO0FBQUEsRUFDakcsV0FBVyxhQUFFLE9BQU8sRUFBRSxTQUFTLDBEQUEwRDtBQUFBLEVBQ3pGLFVBQVUsYUFBRSxPQUFPLEVBQUUsU0FBUyxtRkFBbUY7QUFBQSxFQUNqSCxRQUFRLGFBQUUsTUFBTSxhQUFFLE9BQU8sQ0FBQyxFQUFFLFNBQVMsd0ZBQXdGO0FBQy9ILENBQUM7QUFDRCxJQUFNLGVBQWUsYUFBRSxPQUFPO0FBQUEsRUFDNUIsZUFBZSxhQUFFLE9BQU87QUFBQSxFQUN4QixTQUFTLGFBQUUsT0FBTztBQUFBLEVBQ2xCLFVBQVUsYUFBRSxPQUFPO0FBQUEsRUFDbkIsUUFBUSxhQUFFLE1BQU0sYUFBRSxPQUFPLENBQUM7QUFBQSxFQUMxQixjQUFjLGFBQUUsT0FBTztBQUN6QixDQUFDO0FBQ0QsSUFBTSxTQUFTO0FBQUEsRUFDYixNQUFNO0FBQUEsRUFDTixhQUFhO0FBQUEsRUFDYixTQUFTO0FBQUEsRUFDVCxVQUFVO0FBQUEsSUFDUixRQUFRO0FBQUEsSUFDUixNQUFNO0FBQUEsSUFDTixPQUFPO0FBQUEsRUFDVDtBQUFBLEVBQ0EsT0FBTztBQUFBLEVBQ1AsUUFBUTtBQUFBLEVBQ1IsUUFBUSxDQUFDLDhDQUE4QztBQUFBLEVBQ3ZELE1BQU0sT0FBTyxPQUFPLFVBQWlEO0FBR25FLFVBQU0sTUFBTSxLQUFLO0FBQUEsTUFDZixVQUFVLG9CQUFvQixNQUFNLGFBQWE7QUFBQSxNQUNqRCxNQUFNO0FBQUEsUUFDSixVQUFVLENBQUM7QUFBQSxVQUNULGlCQUFpQjtBQUFBLFlBQ2YsT0FBTztBQUFBLGNBQ0wsU0FBUyxNQUFNO0FBQUEsY0FDZixXQUFXO0FBQUEsY0FDWCxZQUFZLE1BQU07QUFBQSxjQUNsQixVQUFVLE1BQU0sV0FBVztBQUFBLFlBQzdCO0FBQUEsWUFDQSxtQkFBbUI7QUFBQSxVQUNyQjtBQUFBLFFBQ0YsQ0FBQztBQUFBLE1BQ0g7QUFBQSxNQUNBLFNBQVM7QUFBQSxJQUNYLENBQUM7QUFLRCxVQUFNLFlBQVksTUFBTSxPQUFPLFNBQVMsSUFBSSxPQUFPLGFBQWEsS0FBSyxLQUFLLElBQUksTUFBTSxPQUFPLFNBQVMsR0FBRyxFQUFFLENBQUMsSUFBSTtBQUM5RyxVQUFNLFFBQVEsR0FBRyxNQUFNLFNBQVMsS0FBSyxNQUFNLFdBQVcsQ0FBQyxJQUFJLFNBQVMsR0FBRyxNQUFNLFdBQVcsQ0FBQztBQUN6RixVQUFNLGlCQUFpQixNQUFNLE1BQU0sSUFBSTtBQUFBLE1BQ3JDLFVBQVUsb0JBQW9CLE1BQU0sYUFBYSxXQUFXLG1CQUFtQixLQUFLLENBQUM7QUFBQSxNQUNyRixRQUFRO0FBQUEsUUFDTixrQkFBa0I7QUFBQSxNQUNwQjtBQUFBLE1BQ0EsTUFBTTtBQUFBLFFBQ0osZ0JBQWdCO0FBQUEsUUFDaEIsUUFBUSxDQUFDLE1BQU0sTUFBTTtBQUFBLE1BQ3ZCO0FBQUEsTUFDQSxTQUFTO0FBQUEsSUFDWCxDQUFDO0FBQ0QsV0FBTztBQUFBLE1BQ0wsZUFBZSxNQUFNO0FBQUEsTUFDckIsU0FBUyxNQUFNO0FBQUEsTUFDZixVQUFVLE1BQU07QUFBQSxNQUNoQixRQUFRLE1BQU07QUFBQSxNQUNkLGNBQWMsZUFBZSxNQUFNLGdCQUFnQjtBQUFBLElBQ3JEO0FBQUEsRUFDRjtBQUNGO0FBRUEsSUFBTyxpQ0FBUTsiLAogICJuYW1lcyI6IFtdCn0K
