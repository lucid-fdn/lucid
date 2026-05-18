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

// notion/actions/retrieve-block-children.ts
var retrieve_block_children_exports = {};
__export(retrieve_block_children_exports, {
  default: () => retrieve_block_children_default
});
module.exports = __toCommonJS(retrieve_block_children_exports);
var import_zod = require("zod");
var InputSchema = import_zod.z.object({
  block_id: import_zod.z.string().describe('The ID of the block or page. Example: "2b6ce298-3121-80ae-bfe1-f8984b993639"'),
  page_size: import_zod.z.number().optional().describe("Number of results to return (max 100)."),
  cursor: import_zod.z.string().optional().describe("Pagination cursor from previous response.")
});
var OutputSchema = import_zod.z.object({
  object: import_zod.z.string(),
  results: import_zod.z.array(import_zod.z.any()),
  has_more: import_zod.z.boolean(),
  next_cursor: import_zod.z.union([import_zod.z.string(), import_zod.z.null()])
});
var action = {
  type: "action",
  description: "Gets paginated list of child blocks within a block or page.",
  version: "1.0.0",
  endpoint: {
    method: "GET",
    path: "/blocks/children",
    group: "Blocks"
  },
  input: InputSchema,
  output: OutputSchema,
  scopes: [],
  exec: async (nango, input) => {
    const config = {
      // https://developers.notion.com/reference/get-block-children
      endpoint: `v1/blocks/${input.block_id}/children`,
      params: {
        ...input.page_size && {
          page_size: input.page_size
        },
        ...input.cursor && {
          start_cursor: input.cursor
        }
      },
      retries: 3
    };
    const response = await nango.get(config);
    const data = response.data;
    return {
      object: data.object,
      results: data.results,
      has_more: data.has_more,
      next_cursor: data.next_cursor ?? null
    };
  }
};
var retrieve_block_children_default = action;
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsibm90aW9uL2FjdGlvbnMvcmV0cmlldmUtYmxvY2stY2hpbGRyZW4udHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImltcG9ydCB7IHogfSBmcm9tICd6b2QnO1xuaW1wb3J0IHsgY3JlYXRlQWN0aW9uIH0gZnJvbSAnbmFuZ28nO1xuaW1wb3J0IHR5cGUgeyBQcm94eUNvbmZpZ3VyYXRpb24gfSBmcm9tICduYW5nbyc7XG5jb25zdCBJbnB1dFNjaGVtYSA9IHoub2JqZWN0KHtcbiAgYmxvY2tfaWQ6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ1RoZSBJRCBvZiB0aGUgYmxvY2sgb3IgcGFnZS4gRXhhbXBsZTogXCIyYjZjZTI5OC0zMTIxLTgwYWUtYmZlMS1mODk4NGI5OTM2MzlcIicpLFxuICBwYWdlX3NpemU6IHoubnVtYmVyKCkub3B0aW9uYWwoKS5kZXNjcmliZSgnTnVtYmVyIG9mIHJlc3VsdHMgdG8gcmV0dXJuIChtYXggMTAwKS4nKSxcbiAgY3Vyc29yOiB6LnN0cmluZygpLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ1BhZ2luYXRpb24gY3Vyc29yIGZyb20gcHJldmlvdXMgcmVzcG9uc2UuJylcbn0pO1xuY29uc3QgT3V0cHV0U2NoZW1hID0gei5vYmplY3Qoe1xuICBvYmplY3Q6IHouc3RyaW5nKCksXG4gIHJlc3VsdHM6IHouYXJyYXkoei5hbnkoKSksXG4gIGhhc19tb3JlOiB6LmJvb2xlYW4oKSxcbiAgbmV4dF9jdXJzb3I6IHoudW5pb24oW3ouc3RyaW5nKCksIHoubnVsbCgpXSlcbn0pO1xuY29uc3QgYWN0aW9uID0ge1xuICB0eXBlOiBcImFjdGlvblwiLFxuICBkZXNjcmlwdGlvbjogJ0dldHMgcGFnaW5hdGVkIGxpc3Qgb2YgY2hpbGQgYmxvY2tzIHdpdGhpbiBhIGJsb2NrIG9yIHBhZ2UuJyxcbiAgdmVyc2lvbjogJzEuMC4wJyxcbiAgZW5kcG9pbnQ6IHtcbiAgICBtZXRob2Q6ICdHRVQnLFxuICAgIHBhdGg6ICcvYmxvY2tzL2NoaWxkcmVuJyxcbiAgICBncm91cDogJ0Jsb2NrcydcbiAgfSxcbiAgaW5wdXQ6IElucHV0U2NoZW1hLFxuICBvdXRwdXQ6IE91dHB1dFNjaGVtYSxcbiAgc2NvcGVzOiBbXSxcbiAgZXhlYzogYXN5bmMgKG5hbmdvLCBpbnB1dCk6IFByb21pc2U8ei5pbmZlcjx0eXBlb2YgT3V0cHV0U2NoZW1hPj4gPT4ge1xuICAgIGNvbnN0IGNvbmZpZzogUHJveHlDb25maWd1cmF0aW9uID0ge1xuICAgICAgLy8gaHR0cHM6Ly9kZXZlbG9wZXJzLm5vdGlvbi5jb20vcmVmZXJlbmNlL2dldC1ibG9jay1jaGlsZHJlblxuICAgICAgZW5kcG9pbnQ6IGB2MS9ibG9ja3MvJHtpbnB1dC5ibG9ja19pZH0vY2hpbGRyZW5gLFxuICAgICAgcGFyYW1zOiB7XG4gICAgICAgIC4uLihpbnB1dC5wYWdlX3NpemUgJiYge1xuICAgICAgICAgIHBhZ2Vfc2l6ZTogaW5wdXQucGFnZV9zaXplXG4gICAgICAgIH0pLFxuICAgICAgICAuLi4oaW5wdXQuY3Vyc29yICYmIHtcbiAgICAgICAgICBzdGFydF9jdXJzb3I6IGlucHV0LmN1cnNvclxuICAgICAgICB9KVxuICAgICAgfSxcbiAgICAgIHJldHJpZXM6IDNcbiAgICB9O1xuICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgbmFuZ28uZ2V0KGNvbmZpZyk7XG4gICAgY29uc3QgZGF0YSA9IHJlc3BvbnNlLmRhdGE7XG4gICAgcmV0dXJuIHtcbiAgICAgIG9iamVjdDogZGF0YS5vYmplY3QsXG4gICAgICByZXN1bHRzOiBkYXRhLnJlc3VsdHMsXG4gICAgICBoYXNfbW9yZTogZGF0YS5oYXNfbW9yZSxcbiAgICAgIG5leHRfY3Vyc29yOiBkYXRhLm5leHRfY3Vyc29yID8/IG51bGxcbiAgICB9O1xuICB9XG59O1xuZXhwb3J0IHR5cGUgTmFuZ29BY3Rpb25Mb2NhbCA9IFBhcmFtZXRlcnM8KHR5cGVvZiBhY3Rpb24pWydleGVjJ10+WzBdO1xuZXhwb3J0IGRlZmF1bHQgYWN0aW9uOyJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLGlCQUFrQjtBQUdsQixJQUFNLGNBQWMsYUFBRSxPQUFPO0FBQUEsRUFDM0IsVUFBVSxhQUFFLE9BQU8sRUFBRSxTQUFTLDhFQUE4RTtBQUFBLEVBQzVHLFdBQVcsYUFBRSxPQUFPLEVBQUUsU0FBUyxFQUFFLFNBQVMsd0NBQXdDO0FBQUEsRUFDbEYsUUFBUSxhQUFFLE9BQU8sRUFBRSxTQUFTLEVBQUUsU0FBUywyQ0FBMkM7QUFDcEYsQ0FBQztBQUNELElBQU0sZUFBZSxhQUFFLE9BQU87QUFBQSxFQUM1QixRQUFRLGFBQUUsT0FBTztBQUFBLEVBQ2pCLFNBQVMsYUFBRSxNQUFNLGFBQUUsSUFBSSxDQUFDO0FBQUEsRUFDeEIsVUFBVSxhQUFFLFFBQVE7QUFBQSxFQUNwQixhQUFhLGFBQUUsTUFBTSxDQUFDLGFBQUUsT0FBTyxHQUFHLGFBQUUsS0FBSyxDQUFDLENBQUM7QUFDN0MsQ0FBQztBQUNELElBQU0sU0FBUztBQUFBLEVBQ2IsTUFBTTtBQUFBLEVBQ04sYUFBYTtBQUFBLEVBQ2IsU0FBUztBQUFBLEVBQ1QsVUFBVTtBQUFBLElBQ1IsUUFBUTtBQUFBLElBQ1IsTUFBTTtBQUFBLElBQ04sT0FBTztBQUFBLEVBQ1Q7QUFBQSxFQUNBLE9BQU87QUFBQSxFQUNQLFFBQVE7QUFBQSxFQUNSLFFBQVEsQ0FBQztBQUFBLEVBQ1QsTUFBTSxPQUFPLE9BQU8sVUFBaUQ7QUFDbkUsVUFBTSxTQUE2QjtBQUFBO0FBQUEsTUFFakMsVUFBVSxhQUFhLE1BQU0sUUFBUTtBQUFBLE1BQ3JDLFFBQVE7QUFBQSxRQUNOLEdBQUksTUFBTSxhQUFhO0FBQUEsVUFDckIsV0FBVyxNQUFNO0FBQUEsUUFDbkI7QUFBQSxRQUNBLEdBQUksTUFBTSxVQUFVO0FBQUEsVUFDbEIsY0FBYyxNQUFNO0FBQUEsUUFDdEI7QUFBQSxNQUNGO0FBQUEsTUFDQSxTQUFTO0FBQUEsSUFDWDtBQUNBLFVBQU0sV0FBVyxNQUFNLE1BQU0sSUFBSSxNQUFNO0FBQ3ZDLFVBQU0sT0FBTyxTQUFTO0FBQ3RCLFdBQU87QUFBQSxNQUNMLFFBQVEsS0FBSztBQUFBLE1BQ2IsU0FBUyxLQUFLO0FBQUEsTUFDZCxVQUFVLEtBQUs7QUFBQSxNQUNmLGFBQWEsS0FBSyxlQUFlO0FBQUEsSUFDbkM7QUFBQSxFQUNGO0FBQ0Y7QUFFQSxJQUFPLGtDQUFROyIsCiAgIm5hbWVzIjogW10KfQo=
