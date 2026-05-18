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

// notion/actions/archive-page.ts
var archive_page_exports = {};
__export(archive_page_exports, {
  default: () => archive_page_default
});
module.exports = __toCommonJS(archive_page_exports);
var import_zod = require("zod");
var InputSchema = import_zod.z.object({
  page_id: import_zod.z.string().describe('The ID of the page to archive. Example: "2b6ce298-3121-80ae-bfe1-f8984b993639"')
});
var OutputSchema = import_zod.z.object({
  id: import_zod.z.string(),
  object: import_zod.z.string(),
  archived: import_zod.z.boolean()
});
var action = {
  type: "action",
  description: "Moves a page to trash by setting archived to true.",
  version: "1.0.0",
  endpoint: {
    method: "POST",
    path: "/pages/archive",
    group: "Pages"
  },
  input: InputSchema,
  output: OutputSchema,
  scopes: [],
  exec: async (nango, input) => {
    const config = {
      // https://developers.notion.com/reference/patch-page
      endpoint: `v1/pages/${input.page_id}`,
      data: {
        archived: true
      },
      retries: 3
    };
    const response = await nango.patch(config);
    const data = response.data;
    return {
      id: data.id,
      object: data.object,
      archived: data.archived
    };
  }
};
var archive_page_default = action;
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsibm90aW9uL2FjdGlvbnMvYXJjaGl2ZS1wYWdlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyJpbXBvcnQgeyB6IH0gZnJvbSAnem9kJztcbmltcG9ydCB7IGNyZWF0ZUFjdGlvbiB9IGZyb20gJ25hbmdvJztcbmltcG9ydCB0eXBlIHsgUHJveHlDb25maWd1cmF0aW9uIH0gZnJvbSAnbmFuZ28nO1xuY29uc3QgSW5wdXRTY2hlbWEgPSB6Lm9iamVjdCh7XG4gIHBhZ2VfaWQ6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ1RoZSBJRCBvZiB0aGUgcGFnZSB0byBhcmNoaXZlLiBFeGFtcGxlOiBcIjJiNmNlMjk4LTMxMjEtODBhZS1iZmUxLWY4OTg0Yjk5MzYzOVwiJylcbn0pO1xuY29uc3QgT3V0cHV0U2NoZW1hID0gei5vYmplY3Qoe1xuICBpZDogei5zdHJpbmcoKSxcbiAgb2JqZWN0OiB6LnN0cmluZygpLFxuICBhcmNoaXZlZDogei5ib29sZWFuKClcbn0pO1xuY29uc3QgYWN0aW9uID0ge1xuICB0eXBlOiBcImFjdGlvblwiLFxuICBkZXNjcmlwdGlvbjogJ01vdmVzIGEgcGFnZSB0byB0cmFzaCBieSBzZXR0aW5nIGFyY2hpdmVkIHRvIHRydWUuJyxcbiAgdmVyc2lvbjogJzEuMC4wJyxcbiAgZW5kcG9pbnQ6IHtcbiAgICBtZXRob2Q6ICdQT1NUJyxcbiAgICBwYXRoOiAnL3BhZ2VzL2FyY2hpdmUnLFxuICAgIGdyb3VwOiAnUGFnZXMnXG4gIH0sXG4gIGlucHV0OiBJbnB1dFNjaGVtYSxcbiAgb3V0cHV0OiBPdXRwdXRTY2hlbWEsXG4gIHNjb3BlczogW10sXG4gIGV4ZWM6IGFzeW5jIChuYW5nbywgaW5wdXQpOiBQcm9taXNlPHouaW5mZXI8dHlwZW9mIE91dHB1dFNjaGVtYT4+ID0+IHtcbiAgICBjb25zdCBjb25maWc6IFByb3h5Q29uZmlndXJhdGlvbiA9IHtcbiAgICAgIC8vIGh0dHBzOi8vZGV2ZWxvcGVycy5ub3Rpb24uY29tL3JlZmVyZW5jZS9wYXRjaC1wYWdlXG4gICAgICBlbmRwb2ludDogYHYxL3BhZ2VzLyR7aW5wdXQucGFnZV9pZH1gLFxuICAgICAgZGF0YToge1xuICAgICAgICBhcmNoaXZlZDogdHJ1ZVxuICAgICAgfSxcbiAgICAgIHJldHJpZXM6IDNcbiAgICB9O1xuICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgbmFuZ28ucGF0Y2goY29uZmlnKTtcbiAgICBjb25zdCBkYXRhID0gcmVzcG9uc2UuZGF0YTtcbiAgICByZXR1cm4ge1xuICAgICAgaWQ6IGRhdGEuaWQsXG4gICAgICBvYmplY3Q6IGRhdGEub2JqZWN0LFxuICAgICAgYXJjaGl2ZWQ6IGRhdGEuYXJjaGl2ZWRcbiAgICB9O1xuICB9XG59O1xuZXhwb3J0IHR5cGUgTmFuZ29BY3Rpb25Mb2NhbCA9IFBhcmFtZXRlcnM8KHR5cGVvZiBhY3Rpb24pWydleGVjJ10+WzBdO1xuZXhwb3J0IGRlZmF1bHQgYWN0aW9uOyJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLGlCQUFrQjtBQUdsQixJQUFNLGNBQWMsYUFBRSxPQUFPO0FBQUEsRUFDM0IsU0FBUyxhQUFFLE9BQU8sRUFBRSxTQUFTLGdGQUFnRjtBQUMvRyxDQUFDO0FBQ0QsSUFBTSxlQUFlLGFBQUUsT0FBTztBQUFBLEVBQzVCLElBQUksYUFBRSxPQUFPO0FBQUEsRUFDYixRQUFRLGFBQUUsT0FBTztBQUFBLEVBQ2pCLFVBQVUsYUFBRSxRQUFRO0FBQ3RCLENBQUM7QUFDRCxJQUFNLFNBQVM7QUFBQSxFQUNiLE1BQU07QUFBQSxFQUNOLGFBQWE7QUFBQSxFQUNiLFNBQVM7QUFBQSxFQUNULFVBQVU7QUFBQSxJQUNSLFFBQVE7QUFBQSxJQUNSLE1BQU07QUFBQSxJQUNOLE9BQU87QUFBQSxFQUNUO0FBQUEsRUFDQSxPQUFPO0FBQUEsRUFDUCxRQUFRO0FBQUEsRUFDUixRQUFRLENBQUM7QUFBQSxFQUNULE1BQU0sT0FBTyxPQUFPLFVBQWlEO0FBQ25FLFVBQU0sU0FBNkI7QUFBQTtBQUFBLE1BRWpDLFVBQVUsWUFBWSxNQUFNLE9BQU87QUFBQSxNQUNuQyxNQUFNO0FBQUEsUUFDSixVQUFVO0FBQUEsTUFDWjtBQUFBLE1BQ0EsU0FBUztBQUFBLElBQ1g7QUFDQSxVQUFNLFdBQVcsTUFBTSxNQUFNLE1BQU0sTUFBTTtBQUN6QyxVQUFNLE9BQU8sU0FBUztBQUN0QixXQUFPO0FBQUEsTUFDTCxJQUFJLEtBQUs7QUFBQSxNQUNULFFBQVEsS0FBSztBQUFBLE1BQ2IsVUFBVSxLQUFLO0FBQUEsSUFDakI7QUFBQSxFQUNGO0FBQ0Y7QUFFQSxJQUFPLHVCQUFROyIsCiAgIm5hbWVzIjogW10KfQo=
