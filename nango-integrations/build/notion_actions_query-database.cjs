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

// notion/actions/query-database.ts
var query_database_exports = {};
__export(query_database_exports, {
  default: () => query_database_default
});
module.exports = __toCommonJS(query_database_exports);
var import_zod = require("zod");
var InputSchema = import_zod.z.object({
  database_id: import_zod.z.string().describe('The ID of the database to query. Example: "2b6ce298-3121-8079-a497-d3eca16d875c"'),
  filter: import_zod.z.any().optional().describe("Filter conditions for the query."),
  sorts: import_zod.z.array(import_zod.z.any()).optional().describe("Sort criteria for the results."),
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
  description: "Retrieves filtered and sorted pages from a database with pagination.",
  version: "1.0.0",
  endpoint: {
    method: "POST",
    path: "/databases/query",
    group: "Databases"
  },
  input: InputSchema,
  output: OutputSchema,
  scopes: [],
  exec: async (nango, input) => {
    const config = {
      // https://developers.notion.com/reference/post-database-query
      endpoint: `v1/databases/${input.database_id}/query`,
      data: {
        ...input.filter && {
          filter: input.filter
        },
        ...input.sorts && {
          sorts: input.sorts
        },
        ...input.page_size && {
          page_size: input.page_size
        },
        ...input.cursor && {
          start_cursor: input.cursor
        }
      },
      retries: 3
    };
    const response = await nango.post(config);
    const data = response.data;
    return {
      object: data.object,
      results: data.results,
      has_more: data.has_more,
      next_cursor: data.next_cursor ?? null
    };
  }
};
var query_database_default = action;
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsibm90aW9uL2FjdGlvbnMvcXVlcnktZGF0YWJhc2UudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImltcG9ydCB7IHogfSBmcm9tICd6b2QnO1xuaW1wb3J0IHsgY3JlYXRlQWN0aW9uIH0gZnJvbSAnbmFuZ28nO1xuaW1wb3J0IHR5cGUgeyBQcm94eUNvbmZpZ3VyYXRpb24gfSBmcm9tICduYW5nbyc7XG5jb25zdCBJbnB1dFNjaGVtYSA9IHoub2JqZWN0KHtcbiAgZGF0YWJhc2VfaWQ6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ1RoZSBJRCBvZiB0aGUgZGF0YWJhc2UgdG8gcXVlcnkuIEV4YW1wbGU6IFwiMmI2Y2UyOTgtMzEyMS04MDc5LWE0OTctZDNlY2ExNmQ4NzVjXCInKSxcbiAgZmlsdGVyOiB6LmFueSgpLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ0ZpbHRlciBjb25kaXRpb25zIGZvciB0aGUgcXVlcnkuJyksXG4gIHNvcnRzOiB6LmFycmF5KHouYW55KCkpLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ1NvcnQgY3JpdGVyaWEgZm9yIHRoZSByZXN1bHRzLicpLFxuICBwYWdlX3NpemU6IHoubnVtYmVyKCkub3B0aW9uYWwoKS5kZXNjcmliZSgnTnVtYmVyIG9mIHJlc3VsdHMgdG8gcmV0dXJuIChtYXggMTAwKS4nKSxcbiAgY3Vyc29yOiB6LnN0cmluZygpLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ1BhZ2luYXRpb24gY3Vyc29yIGZyb20gcHJldmlvdXMgcmVzcG9uc2UuJylcbn0pO1xuY29uc3QgT3V0cHV0U2NoZW1hID0gei5vYmplY3Qoe1xuICBvYmplY3Q6IHouc3RyaW5nKCksXG4gIHJlc3VsdHM6IHouYXJyYXkoei5hbnkoKSksXG4gIGhhc19tb3JlOiB6LmJvb2xlYW4oKSxcbiAgbmV4dF9jdXJzb3I6IHoudW5pb24oW3ouc3RyaW5nKCksIHoubnVsbCgpXSlcbn0pO1xuY29uc3QgYWN0aW9uID0ge1xuICB0eXBlOiBcImFjdGlvblwiLFxuICBkZXNjcmlwdGlvbjogJ1JldHJpZXZlcyBmaWx0ZXJlZCBhbmQgc29ydGVkIHBhZ2VzIGZyb20gYSBkYXRhYmFzZSB3aXRoIHBhZ2luYXRpb24uJyxcbiAgdmVyc2lvbjogJzEuMC4wJyxcbiAgZW5kcG9pbnQ6IHtcbiAgICBtZXRob2Q6ICdQT1NUJyxcbiAgICBwYXRoOiAnL2RhdGFiYXNlcy9xdWVyeScsXG4gICAgZ3JvdXA6ICdEYXRhYmFzZXMnXG4gIH0sXG4gIGlucHV0OiBJbnB1dFNjaGVtYSxcbiAgb3V0cHV0OiBPdXRwdXRTY2hlbWEsXG4gIHNjb3BlczogW10sXG4gIGV4ZWM6IGFzeW5jIChuYW5nbywgaW5wdXQpOiBQcm9taXNlPHouaW5mZXI8dHlwZW9mIE91dHB1dFNjaGVtYT4+ID0+IHtcbiAgICBjb25zdCBjb25maWc6IFByb3h5Q29uZmlndXJhdGlvbiA9IHtcbiAgICAgIC8vIGh0dHBzOi8vZGV2ZWxvcGVycy5ub3Rpb24uY29tL3JlZmVyZW5jZS9wb3N0LWRhdGFiYXNlLXF1ZXJ5XG4gICAgICBlbmRwb2ludDogYHYxL2RhdGFiYXNlcy8ke2lucHV0LmRhdGFiYXNlX2lkfS9xdWVyeWAsXG4gICAgICBkYXRhOiB7XG4gICAgICAgIC4uLihpbnB1dC5maWx0ZXIgJiYge1xuICAgICAgICAgIGZpbHRlcjogaW5wdXQuZmlsdGVyXG4gICAgICAgIH0pLFxuICAgICAgICAuLi4oaW5wdXQuc29ydHMgJiYge1xuICAgICAgICAgIHNvcnRzOiBpbnB1dC5zb3J0c1xuICAgICAgICB9KSxcbiAgICAgICAgLi4uKGlucHV0LnBhZ2Vfc2l6ZSAmJiB7XG4gICAgICAgICAgcGFnZV9zaXplOiBpbnB1dC5wYWdlX3NpemVcbiAgICAgICAgfSksXG4gICAgICAgIC4uLihpbnB1dC5jdXJzb3IgJiYge1xuICAgICAgICAgIHN0YXJ0X2N1cnNvcjogaW5wdXQuY3Vyc29yXG4gICAgICAgIH0pXG4gICAgICB9LFxuICAgICAgcmV0cmllczogM1xuICAgIH07XG4gICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBuYW5nby5wb3N0KGNvbmZpZyk7XG4gICAgY29uc3QgZGF0YSA9IHJlc3BvbnNlLmRhdGE7XG4gICAgcmV0dXJuIHtcbiAgICAgIG9iamVjdDogZGF0YS5vYmplY3QsXG4gICAgICByZXN1bHRzOiBkYXRhLnJlc3VsdHMsXG4gICAgICBoYXNfbW9yZTogZGF0YS5oYXNfbW9yZSxcbiAgICAgIG5leHRfY3Vyc29yOiBkYXRhLm5leHRfY3Vyc29yID8/IG51bGxcbiAgICB9O1xuICB9XG59O1xuZXhwb3J0IHR5cGUgTmFuZ29BY3Rpb25Mb2NhbCA9IFBhcmFtZXRlcnM8KHR5cGVvZiBhY3Rpb24pWydleGVjJ10+WzBdO1xuZXhwb3J0IGRlZmF1bHQgYWN0aW9uOyJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLGlCQUFrQjtBQUdsQixJQUFNLGNBQWMsYUFBRSxPQUFPO0FBQUEsRUFDM0IsYUFBYSxhQUFFLE9BQU8sRUFBRSxTQUFTLGtGQUFrRjtBQUFBLEVBQ25ILFFBQVEsYUFBRSxJQUFJLEVBQUUsU0FBUyxFQUFFLFNBQVMsa0NBQWtDO0FBQUEsRUFDdEUsT0FBTyxhQUFFLE1BQU0sYUFBRSxJQUFJLENBQUMsRUFBRSxTQUFTLEVBQUUsU0FBUyxnQ0FBZ0M7QUFBQSxFQUM1RSxXQUFXLGFBQUUsT0FBTyxFQUFFLFNBQVMsRUFBRSxTQUFTLHdDQUF3QztBQUFBLEVBQ2xGLFFBQVEsYUFBRSxPQUFPLEVBQUUsU0FBUyxFQUFFLFNBQVMsMkNBQTJDO0FBQ3BGLENBQUM7QUFDRCxJQUFNLGVBQWUsYUFBRSxPQUFPO0FBQUEsRUFDNUIsUUFBUSxhQUFFLE9BQU87QUFBQSxFQUNqQixTQUFTLGFBQUUsTUFBTSxhQUFFLElBQUksQ0FBQztBQUFBLEVBQ3hCLFVBQVUsYUFBRSxRQUFRO0FBQUEsRUFDcEIsYUFBYSxhQUFFLE1BQU0sQ0FBQyxhQUFFLE9BQU8sR0FBRyxhQUFFLEtBQUssQ0FBQyxDQUFDO0FBQzdDLENBQUM7QUFDRCxJQUFNLFNBQVM7QUFBQSxFQUNiLE1BQU07QUFBQSxFQUNOLGFBQWE7QUFBQSxFQUNiLFNBQVM7QUFBQSxFQUNULFVBQVU7QUFBQSxJQUNSLFFBQVE7QUFBQSxJQUNSLE1BQU07QUFBQSxJQUNOLE9BQU87QUFBQSxFQUNUO0FBQUEsRUFDQSxPQUFPO0FBQUEsRUFDUCxRQUFRO0FBQUEsRUFDUixRQUFRLENBQUM7QUFBQSxFQUNULE1BQU0sT0FBTyxPQUFPLFVBQWlEO0FBQ25FLFVBQU0sU0FBNkI7QUFBQTtBQUFBLE1BRWpDLFVBQVUsZ0JBQWdCLE1BQU0sV0FBVztBQUFBLE1BQzNDLE1BQU07QUFBQSxRQUNKLEdBQUksTUFBTSxVQUFVO0FBQUEsVUFDbEIsUUFBUSxNQUFNO0FBQUEsUUFDaEI7QUFBQSxRQUNBLEdBQUksTUFBTSxTQUFTO0FBQUEsVUFDakIsT0FBTyxNQUFNO0FBQUEsUUFDZjtBQUFBLFFBQ0EsR0FBSSxNQUFNLGFBQWE7QUFBQSxVQUNyQixXQUFXLE1BQU07QUFBQSxRQUNuQjtBQUFBLFFBQ0EsR0FBSSxNQUFNLFVBQVU7QUFBQSxVQUNsQixjQUFjLE1BQU07QUFBQSxRQUN0QjtBQUFBLE1BQ0Y7QUFBQSxNQUNBLFNBQVM7QUFBQSxJQUNYO0FBQ0EsVUFBTSxXQUFXLE1BQU0sTUFBTSxLQUFLLE1BQU07QUFDeEMsVUFBTSxPQUFPLFNBQVM7QUFDdEIsV0FBTztBQUFBLE1BQ0wsUUFBUSxLQUFLO0FBQUEsTUFDYixTQUFTLEtBQUs7QUFBQSxNQUNkLFVBQVUsS0FBSztBQUFBLE1BQ2YsYUFBYSxLQUFLLGVBQWU7QUFBQSxJQUNuQztBQUFBLEVBQ0Y7QUFDRjtBQUVBLElBQU8seUJBQVE7IiwKICAibmFtZXMiOiBbXQp9Cg==
