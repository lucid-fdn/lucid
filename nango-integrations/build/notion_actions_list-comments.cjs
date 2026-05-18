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

// notion/actions/list-comments.ts
var list_comments_exports = {};
__export(list_comments_exports, {
  default: () => list_comments_default
});
module.exports = __toCommonJS(list_comments_exports);
var import_zod = require("zod");
var InputSchema = import_zod.z.object({
  block_id: import_zod.z.string().describe('The ID of the page or block. Example: "2b6ce298-3121-80ae-bfe1-f8984b993639"'),
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
  description: "Retrieves unresolved comments from a page or block.",
  version: "1.0.0",
  endpoint: {
    method: "GET",
    path: "/comments/list",
    group: "Comments"
  },
  input: InputSchema,
  output: OutputSchema,
  scopes: [],
  exec: async (nango, input) => {
    const config = {
      // https://developers.notion.com/reference/retrieve-a-comment
      endpoint: "v1/comments",
      params: {
        block_id: input.block_id,
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
var list_comments_default = action;
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsibm90aW9uL2FjdGlvbnMvbGlzdC1jb21tZW50cy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiaW1wb3J0IHsgeiB9IGZyb20gJ3pvZCc7XG5pbXBvcnQgeyBjcmVhdGVBY3Rpb24gfSBmcm9tICduYW5nbyc7XG5pbXBvcnQgdHlwZSB7IFByb3h5Q29uZmlndXJhdGlvbiB9IGZyb20gJ25hbmdvJztcbmNvbnN0IElucHV0U2NoZW1hID0gei5vYmplY3Qoe1xuICBibG9ja19pZDogei5zdHJpbmcoKS5kZXNjcmliZSgnVGhlIElEIG9mIHRoZSBwYWdlIG9yIGJsb2NrLiBFeGFtcGxlOiBcIjJiNmNlMjk4LTMxMjEtODBhZS1iZmUxLWY4OTg0Yjk5MzYzOVwiJyksXG4gIHBhZ2Vfc2l6ZTogei5udW1iZXIoKS5vcHRpb25hbCgpLmRlc2NyaWJlKCdOdW1iZXIgb2YgcmVzdWx0cyB0byByZXR1cm4gKG1heCAxMDApLicpLFxuICBjdXJzb3I6IHouc3RyaW5nKCkub3B0aW9uYWwoKS5kZXNjcmliZSgnUGFnaW5hdGlvbiBjdXJzb3IgZnJvbSBwcmV2aW91cyByZXNwb25zZS4nKVxufSk7XG5jb25zdCBPdXRwdXRTY2hlbWEgPSB6Lm9iamVjdCh7XG4gIG9iamVjdDogei5zdHJpbmcoKSxcbiAgcmVzdWx0czogei5hcnJheSh6LmFueSgpKSxcbiAgaGFzX21vcmU6IHouYm9vbGVhbigpLFxuICBuZXh0X2N1cnNvcjogei51bmlvbihbei5zdHJpbmcoKSwgei5udWxsKCldKVxufSk7XG5jb25zdCBhY3Rpb24gPSB7XG4gIHR5cGU6IFwiYWN0aW9uXCIsXG4gIGRlc2NyaXB0aW9uOiAnUmV0cmlldmVzIHVucmVzb2x2ZWQgY29tbWVudHMgZnJvbSBhIHBhZ2Ugb3IgYmxvY2suJyxcbiAgdmVyc2lvbjogJzEuMC4wJyxcbiAgZW5kcG9pbnQ6IHtcbiAgICBtZXRob2Q6ICdHRVQnLFxuICAgIHBhdGg6ICcvY29tbWVudHMvbGlzdCcsXG4gICAgZ3JvdXA6ICdDb21tZW50cydcbiAgfSxcbiAgaW5wdXQ6IElucHV0U2NoZW1hLFxuICBvdXRwdXQ6IE91dHB1dFNjaGVtYSxcbiAgc2NvcGVzOiBbXSxcbiAgZXhlYzogYXN5bmMgKG5hbmdvLCBpbnB1dCk6IFByb21pc2U8ei5pbmZlcjx0eXBlb2YgT3V0cHV0U2NoZW1hPj4gPT4ge1xuICAgIGNvbnN0IGNvbmZpZzogUHJveHlDb25maWd1cmF0aW9uID0ge1xuICAgICAgLy8gaHR0cHM6Ly9kZXZlbG9wZXJzLm5vdGlvbi5jb20vcmVmZXJlbmNlL3JldHJpZXZlLWEtY29tbWVudFxuICAgICAgZW5kcG9pbnQ6ICd2MS9jb21tZW50cycsXG4gICAgICBwYXJhbXM6IHtcbiAgICAgICAgYmxvY2tfaWQ6IGlucHV0LmJsb2NrX2lkLFxuICAgICAgICAuLi4oaW5wdXQucGFnZV9zaXplICYmIHtcbiAgICAgICAgICBwYWdlX3NpemU6IGlucHV0LnBhZ2Vfc2l6ZVxuICAgICAgICB9KSxcbiAgICAgICAgLi4uKGlucHV0LmN1cnNvciAmJiB7XG4gICAgICAgICAgc3RhcnRfY3Vyc29yOiBpbnB1dC5jdXJzb3JcbiAgICAgICAgfSlcbiAgICAgIH0sXG4gICAgICByZXRyaWVzOiAzXG4gICAgfTtcbiAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IG5hbmdvLmdldChjb25maWcpO1xuICAgIGNvbnN0IGRhdGEgPSByZXNwb25zZS5kYXRhO1xuICAgIHJldHVybiB7XG4gICAgICBvYmplY3Q6IGRhdGEub2JqZWN0LFxuICAgICAgcmVzdWx0czogZGF0YS5yZXN1bHRzLFxuICAgICAgaGFzX21vcmU6IGRhdGEuaGFzX21vcmUsXG4gICAgICBuZXh0X2N1cnNvcjogZGF0YS5uZXh0X2N1cnNvciA/PyBudWxsXG4gICAgfTtcbiAgfVxufTtcbmV4cG9ydCB0eXBlIE5hbmdvQWN0aW9uTG9jYWwgPSBQYXJhbWV0ZXJzPCh0eXBlb2YgYWN0aW9uKVsnZXhlYyddPlswXTtcbmV4cG9ydCBkZWZhdWx0IGFjdGlvbjsiXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxpQkFBa0I7QUFHbEIsSUFBTSxjQUFjLGFBQUUsT0FBTztBQUFBLEVBQzNCLFVBQVUsYUFBRSxPQUFPLEVBQUUsU0FBUyw4RUFBOEU7QUFBQSxFQUM1RyxXQUFXLGFBQUUsT0FBTyxFQUFFLFNBQVMsRUFBRSxTQUFTLHdDQUF3QztBQUFBLEVBQ2xGLFFBQVEsYUFBRSxPQUFPLEVBQUUsU0FBUyxFQUFFLFNBQVMsMkNBQTJDO0FBQ3BGLENBQUM7QUFDRCxJQUFNLGVBQWUsYUFBRSxPQUFPO0FBQUEsRUFDNUIsUUFBUSxhQUFFLE9BQU87QUFBQSxFQUNqQixTQUFTLGFBQUUsTUFBTSxhQUFFLElBQUksQ0FBQztBQUFBLEVBQ3hCLFVBQVUsYUFBRSxRQUFRO0FBQUEsRUFDcEIsYUFBYSxhQUFFLE1BQU0sQ0FBQyxhQUFFLE9BQU8sR0FBRyxhQUFFLEtBQUssQ0FBQyxDQUFDO0FBQzdDLENBQUM7QUFDRCxJQUFNLFNBQVM7QUFBQSxFQUNiLE1BQU07QUFBQSxFQUNOLGFBQWE7QUFBQSxFQUNiLFNBQVM7QUFBQSxFQUNULFVBQVU7QUFBQSxJQUNSLFFBQVE7QUFBQSxJQUNSLE1BQU07QUFBQSxJQUNOLE9BQU87QUFBQSxFQUNUO0FBQUEsRUFDQSxPQUFPO0FBQUEsRUFDUCxRQUFRO0FBQUEsRUFDUixRQUFRLENBQUM7QUFBQSxFQUNULE1BQU0sT0FBTyxPQUFPLFVBQWlEO0FBQ25FLFVBQU0sU0FBNkI7QUFBQTtBQUFBLE1BRWpDLFVBQVU7QUFBQSxNQUNWLFFBQVE7QUFBQSxRQUNOLFVBQVUsTUFBTTtBQUFBLFFBQ2hCLEdBQUksTUFBTSxhQUFhO0FBQUEsVUFDckIsV0FBVyxNQUFNO0FBQUEsUUFDbkI7QUFBQSxRQUNBLEdBQUksTUFBTSxVQUFVO0FBQUEsVUFDbEIsY0FBYyxNQUFNO0FBQUEsUUFDdEI7QUFBQSxNQUNGO0FBQUEsTUFDQSxTQUFTO0FBQUEsSUFDWDtBQUNBLFVBQU0sV0FBVyxNQUFNLE1BQU0sSUFBSSxNQUFNO0FBQ3ZDLFVBQU0sT0FBTyxTQUFTO0FBQ3RCLFdBQU87QUFBQSxNQUNMLFFBQVEsS0FBSztBQUFBLE1BQ2IsU0FBUyxLQUFLO0FBQUEsTUFDZCxVQUFVLEtBQUs7QUFBQSxNQUNmLGFBQWEsS0FBSyxlQUFlO0FBQUEsSUFDbkM7QUFBQSxFQUNGO0FBQ0Y7QUFFQSxJQUFPLHdCQUFROyIsCiAgIm5hbWVzIjogW10KfQo=
