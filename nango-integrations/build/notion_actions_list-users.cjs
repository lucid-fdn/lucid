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

// notion/actions/list-users.ts
var list_users_exports = {};
__export(list_users_exports, {
  default: () => list_users_default
});
module.exports = __toCommonJS(list_users_exports);
var import_zod = require("zod");
var InputSchema = import_zod.z.object({
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
  description: "Gets paginated list of all workspace users excluding guests.",
  version: "1.0.0",
  // https://developers.notion.com/reference/get-users
  endpoint: {
    method: "GET",
    path: "/users/list",
    group: "Users"
  },
  input: InputSchema,
  output: OutputSchema,
  scopes: [],
  exec: async (nango, input) => {
    const config = {
      // https://developers.notion.com/reference/get-users
      endpoint: "v1/users",
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
var list_users_default = action;
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsibm90aW9uL2FjdGlvbnMvbGlzdC11c2Vycy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiaW1wb3J0IHsgeiB9IGZyb20gJ3pvZCc7XG5pbXBvcnQgeyBjcmVhdGVBY3Rpb24gfSBmcm9tICduYW5nbyc7XG5pbXBvcnQgdHlwZSB7IFByb3h5Q29uZmlndXJhdGlvbiB9IGZyb20gJ25hbmdvJztcbmNvbnN0IElucHV0U2NoZW1hID0gei5vYmplY3Qoe1xuICBwYWdlX3NpemU6IHoubnVtYmVyKCkub3B0aW9uYWwoKS5kZXNjcmliZSgnTnVtYmVyIG9mIHJlc3VsdHMgdG8gcmV0dXJuIChtYXggMTAwKS4nKSxcbiAgY3Vyc29yOiB6LnN0cmluZygpLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ1BhZ2luYXRpb24gY3Vyc29yIGZyb20gcHJldmlvdXMgcmVzcG9uc2UuJylcbn0pO1xuY29uc3QgT3V0cHV0U2NoZW1hID0gei5vYmplY3Qoe1xuICBvYmplY3Q6IHouc3RyaW5nKCksXG4gIHJlc3VsdHM6IHouYXJyYXkoei5hbnkoKSksXG4gIGhhc19tb3JlOiB6LmJvb2xlYW4oKSxcbiAgbmV4dF9jdXJzb3I6IHoudW5pb24oW3ouc3RyaW5nKCksIHoubnVsbCgpXSlcbn0pO1xuY29uc3QgYWN0aW9uID0ge1xuICB0eXBlOiBcImFjdGlvblwiLFxuICBkZXNjcmlwdGlvbjogJ0dldHMgcGFnaW5hdGVkIGxpc3Qgb2YgYWxsIHdvcmtzcGFjZSB1c2VycyBleGNsdWRpbmcgZ3Vlc3RzLicsXG4gIHZlcnNpb246ICcxLjAuMCcsXG4gIC8vIGh0dHBzOi8vZGV2ZWxvcGVycy5ub3Rpb24uY29tL3JlZmVyZW5jZS9nZXQtdXNlcnNcbiAgZW5kcG9pbnQ6IHtcbiAgICBtZXRob2Q6ICdHRVQnLFxuICAgIHBhdGg6ICcvdXNlcnMvbGlzdCcsXG4gICAgZ3JvdXA6ICdVc2VycydcbiAgfSxcbiAgaW5wdXQ6IElucHV0U2NoZW1hLFxuICBvdXRwdXQ6IE91dHB1dFNjaGVtYSxcbiAgc2NvcGVzOiBbXSxcbiAgZXhlYzogYXN5bmMgKG5hbmdvLCBpbnB1dCk6IFByb21pc2U8ei5pbmZlcjx0eXBlb2YgT3V0cHV0U2NoZW1hPj4gPT4ge1xuICAgIGNvbnN0IGNvbmZpZzogUHJveHlDb25maWd1cmF0aW9uID0ge1xuICAgICAgLy8gaHR0cHM6Ly9kZXZlbG9wZXJzLm5vdGlvbi5jb20vcmVmZXJlbmNlL2dldC11c2Vyc1xuICAgICAgZW5kcG9pbnQ6ICd2MS91c2VycycsXG4gICAgICBwYXJhbXM6IHtcbiAgICAgICAgLi4uKGlucHV0LnBhZ2Vfc2l6ZSAmJiB7XG4gICAgICAgICAgcGFnZV9zaXplOiBpbnB1dC5wYWdlX3NpemVcbiAgICAgICAgfSksXG4gICAgICAgIC4uLihpbnB1dC5jdXJzb3IgJiYge1xuICAgICAgICAgIHN0YXJ0X2N1cnNvcjogaW5wdXQuY3Vyc29yXG4gICAgICAgIH0pXG4gICAgICB9LFxuICAgICAgcmV0cmllczogM1xuICAgIH07XG4gICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBuYW5nby5nZXQoY29uZmlnKTtcbiAgICBjb25zdCBkYXRhID0gcmVzcG9uc2UuZGF0YTtcbiAgICByZXR1cm4ge1xuICAgICAgb2JqZWN0OiBkYXRhLm9iamVjdCxcbiAgICAgIHJlc3VsdHM6IGRhdGEucmVzdWx0cyxcbiAgICAgIGhhc19tb3JlOiBkYXRhLmhhc19tb3JlLFxuICAgICAgbmV4dF9jdXJzb3I6IGRhdGEubmV4dF9jdXJzb3IgPz8gbnVsbFxuICAgIH07XG4gIH1cbn07XG5leHBvcnQgdHlwZSBOYW5nb0FjdGlvbkxvY2FsID0gUGFyYW1ldGVyczwodHlwZW9mIGFjdGlvbilbJ2V4ZWMnXT5bMF07XG5leHBvcnQgZGVmYXVsdCBhY3Rpb247Il0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsaUJBQWtCO0FBR2xCLElBQU0sY0FBYyxhQUFFLE9BQU87QUFBQSxFQUMzQixXQUFXLGFBQUUsT0FBTyxFQUFFLFNBQVMsRUFBRSxTQUFTLHdDQUF3QztBQUFBLEVBQ2xGLFFBQVEsYUFBRSxPQUFPLEVBQUUsU0FBUyxFQUFFLFNBQVMsMkNBQTJDO0FBQ3BGLENBQUM7QUFDRCxJQUFNLGVBQWUsYUFBRSxPQUFPO0FBQUEsRUFDNUIsUUFBUSxhQUFFLE9BQU87QUFBQSxFQUNqQixTQUFTLGFBQUUsTUFBTSxhQUFFLElBQUksQ0FBQztBQUFBLEVBQ3hCLFVBQVUsYUFBRSxRQUFRO0FBQUEsRUFDcEIsYUFBYSxhQUFFLE1BQU0sQ0FBQyxhQUFFLE9BQU8sR0FBRyxhQUFFLEtBQUssQ0FBQyxDQUFDO0FBQzdDLENBQUM7QUFDRCxJQUFNLFNBQVM7QUFBQSxFQUNiLE1BQU07QUFBQSxFQUNOLGFBQWE7QUFBQSxFQUNiLFNBQVM7QUFBQTtBQUFBLEVBRVQsVUFBVTtBQUFBLElBQ1IsUUFBUTtBQUFBLElBQ1IsTUFBTTtBQUFBLElBQ04sT0FBTztBQUFBLEVBQ1Q7QUFBQSxFQUNBLE9BQU87QUFBQSxFQUNQLFFBQVE7QUFBQSxFQUNSLFFBQVEsQ0FBQztBQUFBLEVBQ1QsTUFBTSxPQUFPLE9BQU8sVUFBaUQ7QUFDbkUsVUFBTSxTQUE2QjtBQUFBO0FBQUEsTUFFakMsVUFBVTtBQUFBLE1BQ1YsUUFBUTtBQUFBLFFBQ04sR0FBSSxNQUFNLGFBQWE7QUFBQSxVQUNyQixXQUFXLE1BQU07QUFBQSxRQUNuQjtBQUFBLFFBQ0EsR0FBSSxNQUFNLFVBQVU7QUFBQSxVQUNsQixjQUFjLE1BQU07QUFBQSxRQUN0QjtBQUFBLE1BQ0Y7QUFBQSxNQUNBLFNBQVM7QUFBQSxJQUNYO0FBQ0EsVUFBTSxXQUFXLE1BQU0sTUFBTSxJQUFJLE1BQU07QUFDdkMsVUFBTSxPQUFPLFNBQVM7QUFDdEIsV0FBTztBQUFBLE1BQ0wsUUFBUSxLQUFLO0FBQUEsTUFDYixTQUFTLEtBQUs7QUFBQSxNQUNkLFVBQVUsS0FBSztBQUFBLE1BQ2YsYUFBYSxLQUFLLGVBQWU7QUFBQSxJQUNuQztBQUFBLEVBQ0Y7QUFDRjtBQUVBLElBQU8scUJBQVE7IiwKICAibmFtZXMiOiBbXQp9Cg==
