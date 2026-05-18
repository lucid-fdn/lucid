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

// notion/actions/append-block-children.ts
var append_block_children_exports = {};
__export(append_block_children_exports, {
  default: () => append_block_children_default
});
module.exports = __toCommonJS(append_block_children_exports);
var import_zod = require("zod");
var InputSchema = import_zod.z.object({
  block_id: import_zod.z.string().describe('The ID of the block or page to append to. Example: "2b6ce298-3121-80ae-bfe1-f8984b993639"'),
  children: import_zod.z.array(import_zod.z.any()).describe("Array of block objects to append (max 100)."),
  after: import_zod.z.string().optional().describe("Block ID to insert after.")
});
var OutputSchema = import_zod.z.object({
  object: import_zod.z.string(),
  results: import_zod.z.array(import_zod.z.any())
});
var action = {
  type: "action",
  description: "Adds new child blocks to a page or block (max 100 blocks).",
  version: "1.0.0",
  endpoint: {
    method: "PATCH",
    path: "/blocks/append",
    group: "Blocks"
  },
  input: InputSchema,
  output: OutputSchema,
  scopes: [],
  exec: async (nango, input) => {
    const config = {
      // https://developers.notion.com/reference/patch-block-children
      endpoint: `v1/blocks/${input.block_id}/children`,
      data: {
        children: input.children,
        ...input.after && {
          after: input.after
        }
      },
      retries: 3
    };
    const response = await nango.patch(config);
    const data = response.data;
    return {
      object: data.object,
      results: data.results
    };
  }
};
var append_block_children_default = action;
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsibm90aW9uL2FjdGlvbnMvYXBwZW5kLWJsb2NrLWNoaWxkcmVuLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyJpbXBvcnQgeyB6IH0gZnJvbSAnem9kJztcbmltcG9ydCB7IGNyZWF0ZUFjdGlvbiB9IGZyb20gJ25hbmdvJztcbmltcG9ydCB0eXBlIHsgUHJveHlDb25maWd1cmF0aW9uIH0gZnJvbSAnbmFuZ28nO1xuY29uc3QgSW5wdXRTY2hlbWEgPSB6Lm9iamVjdCh7XG4gIGJsb2NrX2lkOiB6LnN0cmluZygpLmRlc2NyaWJlKCdUaGUgSUQgb2YgdGhlIGJsb2NrIG9yIHBhZ2UgdG8gYXBwZW5kIHRvLiBFeGFtcGxlOiBcIjJiNmNlMjk4LTMxMjEtODBhZS1iZmUxLWY4OTg0Yjk5MzYzOVwiJyksXG4gIGNoaWxkcmVuOiB6LmFycmF5KHouYW55KCkpLmRlc2NyaWJlKCdBcnJheSBvZiBibG9jayBvYmplY3RzIHRvIGFwcGVuZCAobWF4IDEwMCkuJyksXG4gIGFmdGVyOiB6LnN0cmluZygpLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ0Jsb2NrIElEIHRvIGluc2VydCBhZnRlci4nKVxufSk7XG5jb25zdCBPdXRwdXRTY2hlbWEgPSB6Lm9iamVjdCh7XG4gIG9iamVjdDogei5zdHJpbmcoKSxcbiAgcmVzdWx0czogei5hcnJheSh6LmFueSgpKVxufSk7XG5jb25zdCBhY3Rpb24gPSB7XG4gIHR5cGU6IFwiYWN0aW9uXCIsXG4gIGRlc2NyaXB0aW9uOiAnQWRkcyBuZXcgY2hpbGQgYmxvY2tzIHRvIGEgcGFnZSBvciBibG9jayAobWF4IDEwMCBibG9ja3MpLicsXG4gIHZlcnNpb246ICcxLjAuMCcsXG4gIGVuZHBvaW50OiB7XG4gICAgbWV0aG9kOiAnUEFUQ0gnLFxuICAgIHBhdGg6ICcvYmxvY2tzL2FwcGVuZCcsXG4gICAgZ3JvdXA6ICdCbG9ja3MnXG4gIH0sXG4gIGlucHV0OiBJbnB1dFNjaGVtYSxcbiAgb3V0cHV0OiBPdXRwdXRTY2hlbWEsXG4gIHNjb3BlczogW10sXG4gIGV4ZWM6IGFzeW5jIChuYW5nbywgaW5wdXQpOiBQcm9taXNlPHouaW5mZXI8dHlwZW9mIE91dHB1dFNjaGVtYT4+ID0+IHtcbiAgICBjb25zdCBjb25maWc6IFByb3h5Q29uZmlndXJhdGlvbiA9IHtcbiAgICAgIC8vIGh0dHBzOi8vZGV2ZWxvcGVycy5ub3Rpb24uY29tL3JlZmVyZW5jZS9wYXRjaC1ibG9jay1jaGlsZHJlblxuICAgICAgZW5kcG9pbnQ6IGB2MS9ibG9ja3MvJHtpbnB1dC5ibG9ja19pZH0vY2hpbGRyZW5gLFxuICAgICAgZGF0YToge1xuICAgICAgICBjaGlsZHJlbjogaW5wdXQuY2hpbGRyZW4sXG4gICAgICAgIC4uLihpbnB1dC5hZnRlciAmJiB7XG4gICAgICAgICAgYWZ0ZXI6IGlucHV0LmFmdGVyXG4gICAgICAgIH0pXG4gICAgICB9LFxuICAgICAgcmV0cmllczogM1xuICAgIH07XG4gICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBuYW5nby5wYXRjaChjb25maWcpO1xuICAgIGNvbnN0IGRhdGEgPSByZXNwb25zZS5kYXRhO1xuICAgIHJldHVybiB7XG4gICAgICBvYmplY3Q6IGRhdGEub2JqZWN0LFxuICAgICAgcmVzdWx0czogZGF0YS5yZXN1bHRzXG4gICAgfTtcbiAgfVxufTtcbmV4cG9ydCB0eXBlIE5hbmdvQWN0aW9uTG9jYWwgPSBQYXJhbWV0ZXJzPCh0eXBlb2YgYWN0aW9uKVsnZXhlYyddPlswXTtcbmV4cG9ydCBkZWZhdWx0IGFjdGlvbjsiXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxpQkFBa0I7QUFHbEIsSUFBTSxjQUFjLGFBQUUsT0FBTztBQUFBLEVBQzNCLFVBQVUsYUFBRSxPQUFPLEVBQUUsU0FBUywyRkFBMkY7QUFBQSxFQUN6SCxVQUFVLGFBQUUsTUFBTSxhQUFFLElBQUksQ0FBQyxFQUFFLFNBQVMsNkNBQTZDO0FBQUEsRUFDakYsT0FBTyxhQUFFLE9BQU8sRUFBRSxTQUFTLEVBQUUsU0FBUywyQkFBMkI7QUFDbkUsQ0FBQztBQUNELElBQU0sZUFBZSxhQUFFLE9BQU87QUFBQSxFQUM1QixRQUFRLGFBQUUsT0FBTztBQUFBLEVBQ2pCLFNBQVMsYUFBRSxNQUFNLGFBQUUsSUFBSSxDQUFDO0FBQzFCLENBQUM7QUFDRCxJQUFNLFNBQVM7QUFBQSxFQUNiLE1BQU07QUFBQSxFQUNOLGFBQWE7QUFBQSxFQUNiLFNBQVM7QUFBQSxFQUNULFVBQVU7QUFBQSxJQUNSLFFBQVE7QUFBQSxJQUNSLE1BQU07QUFBQSxJQUNOLE9BQU87QUFBQSxFQUNUO0FBQUEsRUFDQSxPQUFPO0FBQUEsRUFDUCxRQUFRO0FBQUEsRUFDUixRQUFRLENBQUM7QUFBQSxFQUNULE1BQU0sT0FBTyxPQUFPLFVBQWlEO0FBQ25FLFVBQU0sU0FBNkI7QUFBQTtBQUFBLE1BRWpDLFVBQVUsYUFBYSxNQUFNLFFBQVE7QUFBQSxNQUNyQyxNQUFNO0FBQUEsUUFDSixVQUFVLE1BQU07QUFBQSxRQUNoQixHQUFJLE1BQU0sU0FBUztBQUFBLFVBQ2pCLE9BQU8sTUFBTTtBQUFBLFFBQ2Y7QUFBQSxNQUNGO0FBQUEsTUFDQSxTQUFTO0FBQUEsSUFDWDtBQUNBLFVBQU0sV0FBVyxNQUFNLE1BQU0sTUFBTSxNQUFNO0FBQ3pDLFVBQU0sT0FBTyxTQUFTO0FBQ3RCLFdBQU87QUFBQSxNQUNMLFFBQVEsS0FBSztBQUFBLE1BQ2IsU0FBUyxLQUFLO0FBQUEsSUFDaEI7QUFBQSxFQUNGO0FBQ0Y7QUFFQSxJQUFPLGdDQUFROyIsCiAgIm5hbWVzIjogW10KfQo=
