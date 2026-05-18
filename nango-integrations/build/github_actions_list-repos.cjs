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

// github/actions/list-repos.ts
var list_repos_exports = {};
__export(list_repos_exports, {
  default: () => list_repos_default
});
module.exports = __toCommonJS(list_repos_exports);
var z = __toESM(require("zod"), 1);
var inputSchema = z.object({
  type: z.enum(["all", "owner", "member"]).optional().describe("Filter by repo type (default: all)"),
  sort: z.enum(["created", "updated", "pushed", "full_name"]).optional().describe("Sort field (default: updated)"),
  per_page: z.number().min(1).max(100).optional().describe("Results per page (1-100, default 10)")
});
var repoSchema = z.object({
  id: z.number(),
  name: z.string(),
  full_name: z.string(),
  description: z.string().optional(),
  html_url: z.string(),
  private: z.boolean(),
  language: z.string().optional(),
  stargazers_count: z.number().optional(),
  forks_count: z.number().optional(),
  open_issues_count: z.number().optional(),
  updated_at: z.string().optional()
});
var outputSchema = z.object({
  repos: z.array(repoSchema),
  total: z.number()
});
var action = {
  type: "action",
  description: "List GitHub repositories for the authenticated user",
  version: "1.0.0",
  endpoint: {
    method: "GET",
    path: "/github/repos",
    group: "Repositories"
  },
  input: inputSchema,
  output: outputSchema,
  exec: async (nango, input) => {
    const response = await nango.proxy({
      method: "GET",
      endpoint: "/user/repos",
      params: {
        type: input.type ?? "all",
        sort: input.sort ?? "updated",
        direction: "desc",
        per_page: String(input.per_page ?? 10)
      }
    });
    if (!Array.isArray(response.data)) {
      throw new Error(`GitHub API error: ${response.data?.message || "Unexpected response"}`);
    }
    const repos = response.data.map((r) => ({
      id: r.id,
      name: r.name,
      full_name: r.full_name,
      description: r.description,
      html_url: r.html_url,
      private: r.private,
      language: r.language,
      stargazers_count: r.stargazers_count,
      forks_count: r.forks_count,
      open_issues_count: r.open_issues_count,
      updated_at: r.updated_at
    }));
    return {
      repos,
      total: repos.length
    };
  }
};
var list_repos_default = action;
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiZ2l0aHViL2FjdGlvbnMvbGlzdC1yZXBvcy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiaW1wb3J0IHsgY3JlYXRlQWN0aW9uIH0gZnJvbSAnbmFuZ28nO1xuaW1wb3J0ICogYXMgeiBmcm9tICd6b2QnO1xuY29uc3QgaW5wdXRTY2hlbWEgPSB6Lm9iamVjdCh7XG4gIHR5cGU6IHouZW51bShbJ2FsbCcsICdvd25lcicsICdtZW1iZXInXSkub3B0aW9uYWwoKS5kZXNjcmliZSgnRmlsdGVyIGJ5IHJlcG8gdHlwZSAoZGVmYXVsdDogYWxsKScpLFxuICBzb3J0OiB6LmVudW0oWydjcmVhdGVkJywgJ3VwZGF0ZWQnLCAncHVzaGVkJywgJ2Z1bGxfbmFtZSddKS5vcHRpb25hbCgpLmRlc2NyaWJlKCdTb3J0IGZpZWxkIChkZWZhdWx0OiB1cGRhdGVkKScpLFxuICBwZXJfcGFnZTogei5udW1iZXIoKS5taW4oMSkubWF4KDEwMCkub3B0aW9uYWwoKS5kZXNjcmliZSgnUmVzdWx0cyBwZXIgcGFnZSAoMS0xMDAsIGRlZmF1bHQgMTApJylcbn0pO1xuY29uc3QgcmVwb1NjaGVtYSA9IHoub2JqZWN0KHtcbiAgaWQ6IHoubnVtYmVyKCksXG4gIG5hbWU6IHouc3RyaW5nKCksXG4gIGZ1bGxfbmFtZTogei5zdHJpbmcoKSxcbiAgZGVzY3JpcHRpb246IHouc3RyaW5nKCkub3B0aW9uYWwoKSxcbiAgaHRtbF91cmw6IHouc3RyaW5nKCksXG4gIHByaXZhdGU6IHouYm9vbGVhbigpLFxuICBsYW5ndWFnZTogei5zdHJpbmcoKS5vcHRpb25hbCgpLFxuICBzdGFyZ2F6ZXJzX2NvdW50OiB6Lm51bWJlcigpLm9wdGlvbmFsKCksXG4gIGZvcmtzX2NvdW50OiB6Lm51bWJlcigpLm9wdGlvbmFsKCksXG4gIG9wZW5faXNzdWVzX2NvdW50OiB6Lm51bWJlcigpLm9wdGlvbmFsKCksXG4gIHVwZGF0ZWRfYXQ6IHouc3RyaW5nKCkub3B0aW9uYWwoKVxufSk7XG5jb25zdCBvdXRwdXRTY2hlbWEgPSB6Lm9iamVjdCh7XG4gIHJlcG9zOiB6LmFycmF5KHJlcG9TY2hlbWEpLFxuICB0b3RhbDogei5udW1iZXIoKVxufSk7XG5jb25zdCBhY3Rpb24gPSB7XG4gIHR5cGU6IFwiYWN0aW9uXCIsXG4gIGRlc2NyaXB0aW9uOiAnTGlzdCBHaXRIdWIgcmVwb3NpdG9yaWVzIGZvciB0aGUgYXV0aGVudGljYXRlZCB1c2VyJyxcbiAgdmVyc2lvbjogJzEuMC4wJyxcbiAgZW5kcG9pbnQ6IHtcbiAgICBtZXRob2Q6ICdHRVQnLFxuICAgIHBhdGg6ICcvZ2l0aHViL3JlcG9zJyxcbiAgICBncm91cDogJ1JlcG9zaXRvcmllcydcbiAgfSxcbiAgaW5wdXQ6IGlucHV0U2NoZW1hLFxuICBvdXRwdXQ6IG91dHB1dFNjaGVtYSxcbiAgZXhlYzogYXN5bmMgKG5hbmdvLCBpbnB1dCkgPT4ge1xuICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgbmFuZ28ucHJveHkoe1xuICAgICAgbWV0aG9kOiAnR0VUJyxcbiAgICAgIGVuZHBvaW50OiAnL3VzZXIvcmVwb3MnLFxuICAgICAgcGFyYW1zOiB7XG4gICAgICAgIHR5cGU6IGlucHV0LnR5cGUgPz8gJ2FsbCcsXG4gICAgICAgIHNvcnQ6IGlucHV0LnNvcnQgPz8gJ3VwZGF0ZWQnLFxuICAgICAgICBkaXJlY3Rpb246ICdkZXNjJyxcbiAgICAgICAgcGVyX3BhZ2U6IFN0cmluZyhpbnB1dC5wZXJfcGFnZSA/PyAxMClcbiAgICAgIH1cbiAgICB9KTtcbiAgICBpZiAoIUFycmF5LmlzQXJyYXkocmVzcG9uc2UuZGF0YSkpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihgR2l0SHViIEFQSSBlcnJvcjogJHtyZXNwb25zZS5kYXRhPy5tZXNzYWdlIHx8ICdVbmV4cGVjdGVkIHJlc3BvbnNlJ31gKTtcbiAgICB9XG5cbiAgICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgQHR5cGVzY3JpcHQtZXNsaW50L25vLWV4cGxpY2l0LWFueVxuICAgIGNvbnN0IHJlcG9zID0gcmVzcG9uc2UuZGF0YS5tYXAoKHI6IGFueSkgPT4gKHtcbiAgICAgIGlkOiByLmlkLFxuICAgICAgbmFtZTogci5uYW1lLFxuICAgICAgZnVsbF9uYW1lOiByLmZ1bGxfbmFtZSxcbiAgICAgIGRlc2NyaXB0aW9uOiByLmRlc2NyaXB0aW9uLFxuICAgICAgaHRtbF91cmw6IHIuaHRtbF91cmwsXG4gICAgICBwcml2YXRlOiByLnByaXZhdGUsXG4gICAgICBsYW5ndWFnZTogci5sYW5ndWFnZSxcbiAgICAgIHN0YXJnYXplcnNfY291bnQ6IHIuc3RhcmdhemVyc19jb3VudCxcbiAgICAgIGZvcmtzX2NvdW50OiByLmZvcmtzX2NvdW50LFxuICAgICAgb3Blbl9pc3N1ZXNfY291bnQ6IHIub3Blbl9pc3N1ZXNfY291bnQsXG4gICAgICB1cGRhdGVkX2F0OiByLnVwZGF0ZWRfYXRcbiAgICB9KSk7XG4gICAgcmV0dXJuIHtcbiAgICAgIHJlcG9zLFxuICAgICAgdG90YWw6IHJlcG9zLmxlbmd0aFxuICAgIH07XG4gIH1cbn07XG5leHBvcnQgZGVmYXVsdCBhY3Rpb247Il0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUNBLFFBQW1CO0FBQ25CLElBQU0sY0FBZ0IsU0FBTztBQUFBLEVBQzNCLE1BQVEsT0FBSyxDQUFDLE9BQU8sU0FBUyxRQUFRLENBQUMsRUFBRSxTQUFTLEVBQUUsU0FBUyxvQ0FBb0M7QUFBQSxFQUNqRyxNQUFRLE9BQUssQ0FBQyxXQUFXLFdBQVcsVUFBVSxXQUFXLENBQUMsRUFBRSxTQUFTLEVBQUUsU0FBUywrQkFBK0I7QUFBQSxFQUMvRyxVQUFZLFNBQU8sRUFBRSxJQUFJLENBQUMsRUFBRSxJQUFJLEdBQUcsRUFBRSxTQUFTLEVBQUUsU0FBUyxzQ0FBc0M7QUFDakcsQ0FBQztBQUNELElBQU0sYUFBZSxTQUFPO0FBQUEsRUFDMUIsSUFBTSxTQUFPO0FBQUEsRUFDYixNQUFRLFNBQU87QUFBQSxFQUNmLFdBQWEsU0FBTztBQUFBLEVBQ3BCLGFBQWUsU0FBTyxFQUFFLFNBQVM7QUFBQSxFQUNqQyxVQUFZLFNBQU87QUFBQSxFQUNuQixTQUFXLFVBQVE7QUFBQSxFQUNuQixVQUFZLFNBQU8sRUFBRSxTQUFTO0FBQUEsRUFDOUIsa0JBQW9CLFNBQU8sRUFBRSxTQUFTO0FBQUEsRUFDdEMsYUFBZSxTQUFPLEVBQUUsU0FBUztBQUFBLEVBQ2pDLG1CQUFxQixTQUFPLEVBQUUsU0FBUztBQUFBLEVBQ3ZDLFlBQWMsU0FBTyxFQUFFLFNBQVM7QUFDbEMsQ0FBQztBQUNELElBQU0sZUFBaUIsU0FBTztBQUFBLEVBQzVCLE9BQVMsUUFBTSxVQUFVO0FBQUEsRUFDekIsT0FBUyxTQUFPO0FBQ2xCLENBQUM7QUFDRCxJQUFNLFNBQVM7QUFBQSxFQUNiLE1BQU07QUFBQSxFQUNOLGFBQWE7QUFBQSxFQUNiLFNBQVM7QUFBQSxFQUNULFVBQVU7QUFBQSxJQUNSLFFBQVE7QUFBQSxJQUNSLE1BQU07QUFBQSxJQUNOLE9BQU87QUFBQSxFQUNUO0FBQUEsRUFDQSxPQUFPO0FBQUEsRUFDUCxRQUFRO0FBQUEsRUFDUixNQUFNLE9BQU8sT0FBTyxVQUFVO0FBQzVCLFVBQU0sV0FBVyxNQUFNLE1BQU0sTUFBTTtBQUFBLE1BQ2pDLFFBQVE7QUFBQSxNQUNSLFVBQVU7QUFBQSxNQUNWLFFBQVE7QUFBQSxRQUNOLE1BQU0sTUFBTSxRQUFRO0FBQUEsUUFDcEIsTUFBTSxNQUFNLFFBQVE7QUFBQSxRQUNwQixXQUFXO0FBQUEsUUFDWCxVQUFVLE9BQU8sTUFBTSxZQUFZLEVBQUU7QUFBQSxNQUN2QztBQUFBLElBQ0YsQ0FBQztBQUNELFFBQUksQ0FBQyxNQUFNLFFBQVEsU0FBUyxJQUFJLEdBQUc7QUFDakMsWUFBTSxJQUFJLE1BQU0scUJBQXFCLFNBQVMsTUFBTSxXQUFXLHFCQUFxQixFQUFFO0FBQUEsSUFDeEY7QUFHQSxVQUFNLFFBQVEsU0FBUyxLQUFLLElBQUksQ0FBQyxPQUFZO0FBQUEsTUFDM0MsSUFBSSxFQUFFO0FBQUEsTUFDTixNQUFNLEVBQUU7QUFBQSxNQUNSLFdBQVcsRUFBRTtBQUFBLE1BQ2IsYUFBYSxFQUFFO0FBQUEsTUFDZixVQUFVLEVBQUU7QUFBQSxNQUNaLFNBQVMsRUFBRTtBQUFBLE1BQ1gsVUFBVSxFQUFFO0FBQUEsTUFDWixrQkFBa0IsRUFBRTtBQUFBLE1BQ3BCLGFBQWEsRUFBRTtBQUFBLE1BQ2YsbUJBQW1CLEVBQUU7QUFBQSxNQUNyQixZQUFZLEVBQUU7QUFBQSxJQUNoQixFQUFFO0FBQ0YsV0FBTztBQUFBLE1BQ0w7QUFBQSxNQUNBLE9BQU8sTUFBTTtBQUFBLElBQ2Y7QUFBQSxFQUNGO0FBQ0Y7QUFDQSxJQUFPLHFCQUFROyIsCiAgIm5hbWVzIjogW10KfQo=
