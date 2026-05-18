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

// notion/actions/search-pages.ts
var search_pages_exports = {};
__export(search_pages_exports, {
  default: () => search_pages_default
});
module.exports = __toCommonJS(search_pages_exports);
var import_zod = require("zod");
var InputSchema = import_zod.z.object({
  query: import_zod.z.string().optional().describe("Text to search for in page titles."),
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
  description: "Searches only pages shared with the integration.",
  version: "1.0.0",
  endpoint: {
    method: "POST",
    path: "/search/pages",
    group: "Search"
  },
  input: InputSchema,
  output: OutputSchema,
  scopes: [],
  exec: async (nango, input) => {
    const config = {
      // https://developers.notion.com/reference/post-search
      endpoint: "v1/search",
      data: {
        ...input.query && {
          query: input.query
        },
        filter: {
          property: "object",
          value: "page"
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
var search_pages_default = action;
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsibm90aW9uL2FjdGlvbnMvc2VhcmNoLXBhZ2VzLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyJpbXBvcnQgeyB6IH0gZnJvbSAnem9kJztcbmltcG9ydCB7IGNyZWF0ZUFjdGlvbiB9IGZyb20gJ25hbmdvJztcbmltcG9ydCB0eXBlIHsgUHJveHlDb25maWd1cmF0aW9uIH0gZnJvbSAnbmFuZ28nO1xuY29uc3QgSW5wdXRTY2hlbWEgPSB6Lm9iamVjdCh7XG4gIHF1ZXJ5OiB6LnN0cmluZygpLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ1RleHQgdG8gc2VhcmNoIGZvciBpbiBwYWdlIHRpdGxlcy4nKSxcbiAgcGFnZV9zaXplOiB6Lm51bWJlcigpLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ051bWJlciBvZiByZXN1bHRzIHRvIHJldHVybiAobWF4IDEwMCkuJyksXG4gIGN1cnNvcjogei5zdHJpbmcoKS5vcHRpb25hbCgpLmRlc2NyaWJlKCdQYWdpbmF0aW9uIGN1cnNvciBmcm9tIHByZXZpb3VzIHJlc3BvbnNlLicpXG59KTtcbmNvbnN0IE91dHB1dFNjaGVtYSA9IHoub2JqZWN0KHtcbiAgb2JqZWN0OiB6LnN0cmluZygpLFxuICByZXN1bHRzOiB6LmFycmF5KHouYW55KCkpLFxuICBoYXNfbW9yZTogei5ib29sZWFuKCksXG4gIG5leHRfY3Vyc29yOiB6LnVuaW9uKFt6LnN0cmluZygpLCB6Lm51bGwoKV0pXG59KTtcbmNvbnN0IGFjdGlvbiA9IHtcbiAgdHlwZTogXCJhY3Rpb25cIixcbiAgZGVzY3JpcHRpb246ICdTZWFyY2hlcyBvbmx5IHBhZ2VzIHNoYXJlZCB3aXRoIHRoZSBpbnRlZ3JhdGlvbi4nLFxuICB2ZXJzaW9uOiAnMS4wLjAnLFxuICBlbmRwb2ludDoge1xuICAgIG1ldGhvZDogJ1BPU1QnLFxuICAgIHBhdGg6ICcvc2VhcmNoL3BhZ2VzJyxcbiAgICBncm91cDogJ1NlYXJjaCdcbiAgfSxcbiAgaW5wdXQ6IElucHV0U2NoZW1hLFxuICBvdXRwdXQ6IE91dHB1dFNjaGVtYSxcbiAgc2NvcGVzOiBbXSxcbiAgZXhlYzogYXN5bmMgKG5hbmdvLCBpbnB1dCk6IFByb21pc2U8ei5pbmZlcjx0eXBlb2YgT3V0cHV0U2NoZW1hPj4gPT4ge1xuICAgIGNvbnN0IGNvbmZpZzogUHJveHlDb25maWd1cmF0aW9uID0ge1xuICAgICAgLy8gaHR0cHM6Ly9kZXZlbG9wZXJzLm5vdGlvbi5jb20vcmVmZXJlbmNlL3Bvc3Qtc2VhcmNoXG4gICAgICBlbmRwb2ludDogJ3YxL3NlYXJjaCcsXG4gICAgICBkYXRhOiB7XG4gICAgICAgIC4uLihpbnB1dC5xdWVyeSAmJiB7XG4gICAgICAgICAgcXVlcnk6IGlucHV0LnF1ZXJ5XG4gICAgICAgIH0pLFxuICAgICAgICBmaWx0ZXI6IHtcbiAgICAgICAgICBwcm9wZXJ0eTogJ29iamVjdCcsXG4gICAgICAgICAgdmFsdWU6ICdwYWdlJ1xuICAgICAgICB9LFxuICAgICAgICAuLi4oaW5wdXQucGFnZV9zaXplICYmIHtcbiAgICAgICAgICBwYWdlX3NpemU6IGlucHV0LnBhZ2Vfc2l6ZVxuICAgICAgICB9KSxcbiAgICAgICAgLi4uKGlucHV0LmN1cnNvciAmJiB7XG4gICAgICAgICAgc3RhcnRfY3Vyc29yOiBpbnB1dC5jdXJzb3JcbiAgICAgICAgfSlcbiAgICAgIH0sXG4gICAgICByZXRyaWVzOiAzXG4gICAgfTtcbiAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IG5hbmdvLnBvc3QoY29uZmlnKTtcbiAgICBjb25zdCBkYXRhID0gcmVzcG9uc2UuZGF0YTtcbiAgICByZXR1cm4ge1xuICAgICAgb2JqZWN0OiBkYXRhLm9iamVjdCxcbiAgICAgIHJlc3VsdHM6IGRhdGEucmVzdWx0cyxcbiAgICAgIGhhc19tb3JlOiBkYXRhLmhhc19tb3JlLFxuICAgICAgbmV4dF9jdXJzb3I6IGRhdGEubmV4dF9jdXJzb3IgPz8gbnVsbFxuICAgIH07XG4gIH1cbn07XG5leHBvcnQgdHlwZSBOYW5nb0FjdGlvbkxvY2FsID0gUGFyYW1ldGVyczwodHlwZW9mIGFjdGlvbilbJ2V4ZWMnXT5bMF07XG5leHBvcnQgZGVmYXVsdCBhY3Rpb247Il0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsaUJBQWtCO0FBR2xCLElBQU0sY0FBYyxhQUFFLE9BQU87QUFBQSxFQUMzQixPQUFPLGFBQUUsT0FBTyxFQUFFLFNBQVMsRUFBRSxTQUFTLG9DQUFvQztBQUFBLEVBQzFFLFdBQVcsYUFBRSxPQUFPLEVBQUUsU0FBUyxFQUFFLFNBQVMsd0NBQXdDO0FBQUEsRUFDbEYsUUFBUSxhQUFFLE9BQU8sRUFBRSxTQUFTLEVBQUUsU0FBUywyQ0FBMkM7QUFDcEYsQ0FBQztBQUNELElBQU0sZUFBZSxhQUFFLE9BQU87QUFBQSxFQUM1QixRQUFRLGFBQUUsT0FBTztBQUFBLEVBQ2pCLFNBQVMsYUFBRSxNQUFNLGFBQUUsSUFBSSxDQUFDO0FBQUEsRUFDeEIsVUFBVSxhQUFFLFFBQVE7QUFBQSxFQUNwQixhQUFhLGFBQUUsTUFBTSxDQUFDLGFBQUUsT0FBTyxHQUFHLGFBQUUsS0FBSyxDQUFDLENBQUM7QUFDN0MsQ0FBQztBQUNELElBQU0sU0FBUztBQUFBLEVBQ2IsTUFBTTtBQUFBLEVBQ04sYUFBYTtBQUFBLEVBQ2IsU0FBUztBQUFBLEVBQ1QsVUFBVTtBQUFBLElBQ1IsUUFBUTtBQUFBLElBQ1IsTUFBTTtBQUFBLElBQ04sT0FBTztBQUFBLEVBQ1Q7QUFBQSxFQUNBLE9BQU87QUFBQSxFQUNQLFFBQVE7QUFBQSxFQUNSLFFBQVEsQ0FBQztBQUFBLEVBQ1QsTUFBTSxPQUFPLE9BQU8sVUFBaUQ7QUFDbkUsVUFBTSxTQUE2QjtBQUFBO0FBQUEsTUFFakMsVUFBVTtBQUFBLE1BQ1YsTUFBTTtBQUFBLFFBQ0osR0FBSSxNQUFNLFNBQVM7QUFBQSxVQUNqQixPQUFPLE1BQU07QUFBQSxRQUNmO0FBQUEsUUFDQSxRQUFRO0FBQUEsVUFDTixVQUFVO0FBQUEsVUFDVixPQUFPO0FBQUEsUUFDVDtBQUFBLFFBQ0EsR0FBSSxNQUFNLGFBQWE7QUFBQSxVQUNyQixXQUFXLE1BQU07QUFBQSxRQUNuQjtBQUFBLFFBQ0EsR0FBSSxNQUFNLFVBQVU7QUFBQSxVQUNsQixjQUFjLE1BQU07QUFBQSxRQUN0QjtBQUFBLE1BQ0Y7QUFBQSxNQUNBLFNBQVM7QUFBQSxJQUNYO0FBQ0EsVUFBTSxXQUFXLE1BQU0sTUFBTSxLQUFLLE1BQU07QUFDeEMsVUFBTSxPQUFPLFNBQVM7QUFDdEIsV0FBTztBQUFBLE1BQ0wsUUFBUSxLQUFLO0FBQUEsTUFDYixTQUFTLEtBQUs7QUFBQSxNQUNkLFVBQVUsS0FBSztBQUFBLE1BQ2YsYUFBYSxLQUFLLGVBQWU7QUFBQSxJQUNuQztBQUFBLEVBQ0Y7QUFDRjtBQUVBLElBQU8sdUJBQVE7IiwKICAibmFtZXMiOiBbXQp9Cg==
