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

// github/actions/list-pull-requests.ts
var list_pull_requests_exports = {};
__export(list_pull_requests_exports, {
  default: () => list_pull_requests_default
});
module.exports = __toCommonJS(list_pull_requests_exports);
var z = __toESM(require("zod"), 1);
var inputSchema = z.object({
  owner: z.string().describe("Repository owner (user or org)"),
  repo: z.string().describe("Repository name"),
  state: z.enum(["open", "closed", "all"]).optional().describe("PR state filter (default: open)"),
  per_page: z.number().min(1).max(100).optional().describe("Results per page (1-100, default 10)")
});
var prSchema = z.object({
  number: z.number(),
  title: z.string(),
  state: z.string(),
  html_url: z.string(),
  user: z.string().optional(),
  head_branch: z.string().optional(),
  base_branch: z.string().optional(),
  draft: z.boolean().optional(),
  mergeable: z.boolean().optional(),
  additions: z.number().optional(),
  deletions: z.number().optional(),
  changed_files: z.number().optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional()
});
var outputSchema = z.object({
  pull_requests: z.array(prSchema),
  total: z.number()
});
var action = {
  type: "action",
  description: "List pull requests in a GitHub repository",
  version: "1.0.0",
  endpoint: {
    method: "GET",
    path: "/github/pulls",
    group: "Pull Requests"
  },
  input: inputSchema,
  output: outputSchema,
  exec: async (nango, input) => {
    const response = await nango.proxy({
      method: "GET",
      endpoint: `/repos/${input.owner}/${input.repo}/pulls`,
      params: {
        state: input.state ?? "open",
        per_page: String(input.per_page ?? 10),
        sort: "updated",
        direction: "desc"
      }
    });
    if (!Array.isArray(response.data)) {
      throw new Error(`GitHub API error: ${response.data?.message || "Unexpected response"}`);
    }
    const prs = response.data.map((pr) => ({
      number: pr.number,
      title: pr.title,
      state: pr.state,
      html_url: pr.html_url,
      user: pr.user?.login,
      head_branch: pr.head?.ref,
      base_branch: pr.base?.ref,
      draft: pr.draft,
      mergeable: pr.mergeable,
      additions: pr.additions,
      deletions: pr.deletions,
      changed_files: pr.changed_files,
      created_at: pr.created_at,
      updated_at: pr.updated_at
    }));
    return {
      pull_requests: prs,
      total: prs.length
    };
  }
};
var list_pull_requests_default = action;
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiZ2l0aHViL2FjdGlvbnMvbGlzdC1wdWxsLXJlcXVlc3RzLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyJpbXBvcnQgeyBjcmVhdGVBY3Rpb24gfSBmcm9tICduYW5nbyc7XG5pbXBvcnQgKiBhcyB6IGZyb20gJ3pvZCc7XG5jb25zdCBpbnB1dFNjaGVtYSA9IHoub2JqZWN0KHtcbiAgb3duZXI6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ1JlcG9zaXRvcnkgb3duZXIgKHVzZXIgb3Igb3JnKScpLFxuICByZXBvOiB6LnN0cmluZygpLmRlc2NyaWJlKCdSZXBvc2l0b3J5IG5hbWUnKSxcbiAgc3RhdGU6IHouZW51bShbJ29wZW4nLCAnY2xvc2VkJywgJ2FsbCddKS5vcHRpb25hbCgpLmRlc2NyaWJlKCdQUiBzdGF0ZSBmaWx0ZXIgKGRlZmF1bHQ6IG9wZW4pJyksXG4gIHBlcl9wYWdlOiB6Lm51bWJlcigpLm1pbigxKS5tYXgoMTAwKS5vcHRpb25hbCgpLmRlc2NyaWJlKCdSZXN1bHRzIHBlciBwYWdlICgxLTEwMCwgZGVmYXVsdCAxMCknKVxufSk7XG5jb25zdCBwclNjaGVtYSA9IHoub2JqZWN0KHtcbiAgbnVtYmVyOiB6Lm51bWJlcigpLFxuICB0aXRsZTogei5zdHJpbmcoKSxcbiAgc3RhdGU6IHouc3RyaW5nKCksXG4gIGh0bWxfdXJsOiB6LnN0cmluZygpLFxuICB1c2VyOiB6LnN0cmluZygpLm9wdGlvbmFsKCksXG4gIGhlYWRfYnJhbmNoOiB6LnN0cmluZygpLm9wdGlvbmFsKCksXG4gIGJhc2VfYnJhbmNoOiB6LnN0cmluZygpLm9wdGlvbmFsKCksXG4gIGRyYWZ0OiB6LmJvb2xlYW4oKS5vcHRpb25hbCgpLFxuICBtZXJnZWFibGU6IHouYm9vbGVhbigpLm9wdGlvbmFsKCksXG4gIGFkZGl0aW9uczogei5udW1iZXIoKS5vcHRpb25hbCgpLFxuICBkZWxldGlvbnM6IHoubnVtYmVyKCkub3B0aW9uYWwoKSxcbiAgY2hhbmdlZF9maWxlczogei5udW1iZXIoKS5vcHRpb25hbCgpLFxuICBjcmVhdGVkX2F0OiB6LnN0cmluZygpLm9wdGlvbmFsKCksXG4gIHVwZGF0ZWRfYXQ6IHouc3RyaW5nKCkub3B0aW9uYWwoKVxufSk7XG5jb25zdCBvdXRwdXRTY2hlbWEgPSB6Lm9iamVjdCh7XG4gIHB1bGxfcmVxdWVzdHM6IHouYXJyYXkocHJTY2hlbWEpLFxuICB0b3RhbDogei5udW1iZXIoKVxufSk7XG5jb25zdCBhY3Rpb24gPSB7XG4gIHR5cGU6IFwiYWN0aW9uXCIsXG4gIGRlc2NyaXB0aW9uOiAnTGlzdCBwdWxsIHJlcXVlc3RzIGluIGEgR2l0SHViIHJlcG9zaXRvcnknLFxuICB2ZXJzaW9uOiAnMS4wLjAnLFxuICBlbmRwb2ludDoge1xuICAgIG1ldGhvZDogJ0dFVCcsXG4gICAgcGF0aDogJy9naXRodWIvcHVsbHMnLFxuICAgIGdyb3VwOiAnUHVsbCBSZXF1ZXN0cydcbiAgfSxcbiAgaW5wdXQ6IGlucHV0U2NoZW1hLFxuICBvdXRwdXQ6IG91dHB1dFNjaGVtYSxcbiAgZXhlYzogYXN5bmMgKG5hbmdvLCBpbnB1dCkgPT4ge1xuICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgbmFuZ28ucHJveHkoe1xuICAgICAgbWV0aG9kOiAnR0VUJyxcbiAgICAgIGVuZHBvaW50OiBgL3JlcG9zLyR7aW5wdXQub3duZXJ9LyR7aW5wdXQucmVwb30vcHVsbHNgLFxuICAgICAgcGFyYW1zOiB7XG4gICAgICAgIHN0YXRlOiBpbnB1dC5zdGF0ZSA/PyAnb3BlbicsXG4gICAgICAgIHBlcl9wYWdlOiBTdHJpbmcoaW5wdXQucGVyX3BhZ2UgPz8gMTApLFxuICAgICAgICBzb3J0OiAndXBkYXRlZCcsXG4gICAgICAgIGRpcmVjdGlvbjogJ2Rlc2MnXG4gICAgICB9XG4gICAgfSk7XG4gICAgaWYgKCFBcnJheS5pc0FycmF5KHJlc3BvbnNlLmRhdGEpKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoYEdpdEh1YiBBUEkgZXJyb3I6ICR7cmVzcG9uc2UuZGF0YT8ubWVzc2FnZSB8fCAnVW5leHBlY3RlZCByZXNwb25zZSd9YCk7XG4gICAgfVxuXG4gICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uby1leHBsaWNpdC1hbnlcbiAgICBjb25zdCBwcnMgPSByZXNwb25zZS5kYXRhLm1hcCgocHI6IGFueSkgPT4gKHtcbiAgICAgIG51bWJlcjogcHIubnVtYmVyLFxuICAgICAgdGl0bGU6IHByLnRpdGxlLFxuICAgICAgc3RhdGU6IHByLnN0YXRlLFxuICAgICAgaHRtbF91cmw6IHByLmh0bWxfdXJsLFxuICAgICAgdXNlcjogcHIudXNlcj8ubG9naW4sXG4gICAgICBoZWFkX2JyYW5jaDogcHIuaGVhZD8ucmVmLFxuICAgICAgYmFzZV9icmFuY2g6IHByLmJhc2U/LnJlZixcbiAgICAgIGRyYWZ0OiBwci5kcmFmdCxcbiAgICAgIG1lcmdlYWJsZTogcHIubWVyZ2VhYmxlLFxuICAgICAgYWRkaXRpb25zOiBwci5hZGRpdGlvbnMsXG4gICAgICBkZWxldGlvbnM6IHByLmRlbGV0aW9ucyxcbiAgICAgIGNoYW5nZWRfZmlsZXM6IHByLmNoYW5nZWRfZmlsZXMsXG4gICAgICBjcmVhdGVkX2F0OiBwci5jcmVhdGVkX2F0LFxuICAgICAgdXBkYXRlZF9hdDogcHIudXBkYXRlZF9hdFxuICAgIH0pKTtcbiAgICByZXR1cm4ge1xuICAgICAgcHVsbF9yZXF1ZXN0czogcHJzLFxuICAgICAgdG90YWw6IHBycy5sZW5ndGhcbiAgICB9O1xuICB9XG59O1xuZXhwb3J0IGRlZmF1bHQgYWN0aW9uOyJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFDQSxRQUFtQjtBQUNuQixJQUFNLGNBQWdCLFNBQU87QUFBQSxFQUMzQixPQUFTLFNBQU8sRUFBRSxTQUFTLGdDQUFnQztBQUFBLEVBQzNELE1BQVEsU0FBTyxFQUFFLFNBQVMsaUJBQWlC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
