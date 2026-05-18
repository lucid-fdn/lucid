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

// github/actions/list-issues.ts
var list_issues_exports = {};
__export(list_issues_exports, {
  default: () => list_issues_default
});
module.exports = __toCommonJS(list_issues_exports);
var z = __toESM(require("zod"), 1);
var inputSchema = z.object({
  owner: z.string().describe("Repository owner (user or org)"),
  repo: z.string().describe("Repository name"),
  state: z.enum(["open", "closed", "all"]).optional().describe("Issue state filter (default: open)"),
  labels: z.string().optional().describe("Comma-separated label names"),
  per_page: z.number().min(1).max(100).optional().describe("Results per page (1-100, default 10)")
});
var issueSchema = z.object({
  number: z.number(),
  title: z.string(),
  state: z.string(),
  body: z.string().optional(),
  html_url: z.string(),
  user: z.string().optional(),
  labels: z.array(z.string()).optional(),
  assignees: z.array(z.string()).optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
  comments: z.number().optional()
});
var outputSchema = z.object({
  issues: z.array(issueSchema),
  total: z.number()
});
var action = {
  type: "action",
  description: "List issues in a GitHub repository",
  version: "1.0.0",
  endpoint: {
    method: "GET",
    path: "/github/issues",
    group: "Issues"
  },
  input: inputSchema,
  output: outputSchema,
  exec: async (nango, input) => {
    const params = {
      state: input.state ?? "open",
      per_page: String(input.per_page ?? 10),
      sort: "updated",
      direction: "desc"
    };
    if (input.labels) params["labels"] = input.labels;
    const response = await nango.proxy({
      method: "GET",
      endpoint: `/repos/${input.owner}/${input.repo}/issues`,
      params
    });
    if (!Array.isArray(response.data)) {
      throw new Error(`GitHub API error: ${response.data?.message || "Unexpected response"}`);
    }
    const issues = response.data.filter((i) => !i.pull_request).map((i) => ({
      number: i.number,
      title: i.title,
      state: i.state,
      body: i.body ? i.body.substring(0, 1e3) : void 0,
      html_url: i.html_url,
      user: i.user?.login,
      labels: i.labels?.map((l) => l.name),
      assignees: i.assignees?.map((a) => a.login),
      created_at: i.created_at,
      updated_at: i.updated_at,
      comments: i.comments
    }));
    return {
      issues,
      total: issues.length
    };
  }
};
var list_issues_default = action;
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiZ2l0aHViL2FjdGlvbnMvbGlzdC1pc3N1ZXMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImltcG9ydCB7IGNyZWF0ZUFjdGlvbiB9IGZyb20gJ25hbmdvJztcbmltcG9ydCAqIGFzIHogZnJvbSAnem9kJztcbmNvbnN0IGlucHV0U2NoZW1hID0gei5vYmplY3Qoe1xuICBvd25lcjogei5zdHJpbmcoKS5kZXNjcmliZSgnUmVwb3NpdG9yeSBvd25lciAodXNlciBvciBvcmcpJyksXG4gIHJlcG86IHouc3RyaW5nKCkuZGVzY3JpYmUoJ1JlcG9zaXRvcnkgbmFtZScpLFxuICBzdGF0ZTogei5lbnVtKFsnb3BlbicsICdjbG9zZWQnLCAnYWxsJ10pLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ0lzc3VlIHN0YXRlIGZpbHRlciAoZGVmYXVsdDogb3BlbiknKSxcbiAgbGFiZWxzOiB6LnN0cmluZygpLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ0NvbW1hLXNlcGFyYXRlZCBsYWJlbCBuYW1lcycpLFxuICBwZXJfcGFnZTogei5udW1iZXIoKS5taW4oMSkubWF4KDEwMCkub3B0aW9uYWwoKS5kZXNjcmliZSgnUmVzdWx0cyBwZXIgcGFnZSAoMS0xMDAsIGRlZmF1bHQgMTApJylcbn0pO1xuY29uc3QgaXNzdWVTY2hlbWEgPSB6Lm9iamVjdCh7XG4gIG51bWJlcjogei5udW1iZXIoKSxcbiAgdGl0bGU6IHouc3RyaW5nKCksXG4gIHN0YXRlOiB6LnN0cmluZygpLFxuICBib2R5OiB6LnN0cmluZygpLm9wdGlvbmFsKCksXG4gIGh0bWxfdXJsOiB6LnN0cmluZygpLFxuICB1c2VyOiB6LnN0cmluZygpLm9wdGlvbmFsKCksXG4gIGxhYmVsczogei5hcnJheSh6LnN0cmluZygpKS5vcHRpb25hbCgpLFxuICBhc3NpZ25lZXM6IHouYXJyYXkoei5zdHJpbmcoKSkub3B0aW9uYWwoKSxcbiAgY3JlYXRlZF9hdDogei5zdHJpbmcoKS5vcHRpb25hbCgpLFxuICB1cGRhdGVkX2F0OiB6LnN0cmluZygpLm9wdGlvbmFsKCksXG4gIGNvbW1lbnRzOiB6Lm51bWJlcigpLm9wdGlvbmFsKClcbn0pO1xuY29uc3Qgb3V0cHV0U2NoZW1hID0gei5vYmplY3Qoe1xuICBpc3N1ZXM6IHouYXJyYXkoaXNzdWVTY2hlbWEpLFxuICB0b3RhbDogei5udW1iZXIoKVxufSk7XG5jb25zdCBhY3Rpb24gPSB7XG4gIHR5cGU6IFwiYWN0aW9uXCIsXG4gIGRlc2NyaXB0aW9uOiAnTGlzdCBpc3N1ZXMgaW4gYSBHaXRIdWIgcmVwb3NpdG9yeScsXG4gIHZlcnNpb246ICcxLjAuMCcsXG4gIGVuZHBvaW50OiB7XG4gICAgbWV0aG9kOiAnR0VUJyxcbiAgICBwYXRoOiAnL2dpdGh1Yi9pc3N1ZXMnLFxuICAgIGdyb3VwOiAnSXNzdWVzJ1xuICB9LFxuICBpbnB1dDogaW5wdXRTY2hlbWEsXG4gIG91dHB1dDogb3V0cHV0U2NoZW1hLFxuICBleGVjOiBhc3luYyAobmFuZ28sIGlucHV0KSA9PiB7XG4gICAgY29uc3QgcGFyYW1zOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0ge1xuICAgICAgc3RhdGU6IGlucHV0LnN0YXRlID8/ICdvcGVuJyxcbiAgICAgIHBlcl9wYWdlOiBTdHJpbmcoaW5wdXQucGVyX3BhZ2UgPz8gMTApLFxuICAgICAgc29ydDogJ3VwZGF0ZWQnLFxuICAgICAgZGlyZWN0aW9uOiAnZGVzYydcbiAgICB9O1xuICAgIGlmIChpbnB1dC5sYWJlbHMpIHBhcmFtc1snbGFiZWxzJ10gPSBpbnB1dC5sYWJlbHM7XG4gICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBuYW5nby5wcm94eSh7XG4gICAgICBtZXRob2Q6ICdHRVQnLFxuICAgICAgZW5kcG9pbnQ6IGAvcmVwb3MvJHtpbnB1dC5vd25lcn0vJHtpbnB1dC5yZXBvfS9pc3N1ZXNgLFxuICAgICAgcGFyYW1zXG4gICAgfSk7XG4gICAgaWYgKCFBcnJheS5pc0FycmF5KHJlc3BvbnNlLmRhdGEpKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoYEdpdEh1YiBBUEkgZXJyb3I6ICR7cmVzcG9uc2UuZGF0YT8ubWVzc2FnZSB8fCAnVW5leHBlY3RlZCByZXNwb25zZSd9YCk7XG4gICAgfVxuXG4gICAgLy8gRmlsdGVyIG91dCBwdWxsIHJlcXVlc3RzIChHaXRIdWIgQVBJIHJldHVybnMgdGhlbSBtaXhlZCB3aXRoIGlzc3VlcylcbiAgICBjb25zdCBpc3N1ZXMgPSByZXNwb25zZS5kYXRhXG4gICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uby1leHBsaWNpdC1hbnlcbiAgICAuZmlsdGVyKChpOiBhbnkpID0+ICFpLnB1bGxfcmVxdWVzdClcbiAgICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgQHR5cGVzY3JpcHQtZXNsaW50L25vLWV4cGxpY2l0LWFueVxuICAgIC5tYXAoKGk6IGFueSkgPT4gKHtcbiAgICAgIG51bWJlcjogaS5udW1iZXIsXG4gICAgICB0aXRsZTogaS50aXRsZSxcbiAgICAgIHN0YXRlOiBpLnN0YXRlLFxuICAgICAgYm9keTogaS5ib2R5ID8gaS5ib2R5LnN1YnN0cmluZygwLCAxMDAwKSA6IHVuZGVmaW5lZCxcbiAgICAgIGh0bWxfdXJsOiBpLmh0bWxfdXJsLFxuICAgICAgdXNlcjogaS51c2VyPy5sb2dpbixcbiAgICAgIGxhYmVsczogaS5sYWJlbHM/Lm1hcCgobDoge1xuICAgICAgICBuYW1lOiBzdHJpbmc7XG4gICAgICB9KSA9PiBsLm5hbWUpLFxuICAgICAgYXNzaWduZWVzOiBpLmFzc2lnbmVlcz8ubWFwKChhOiB7XG4gICAgICAgIGxvZ2luOiBzdHJpbmc7XG4gICAgICB9KSA9PiBhLmxvZ2luKSxcbiAgICAgIGNyZWF0ZWRfYXQ6IGkuY3JlYXRlZF9hdCxcbiAgICAgIHVwZGF0ZWRfYXQ6IGkudXBkYXRlZF9hdCxcbiAgICAgIGNvbW1lbnRzOiBpLmNvbW1lbnRzXG4gICAgfSkpO1xuICAgIHJldHVybiB7XG4gICAgICBpc3N1ZXMsXG4gICAgICB0b3RhbDogaXNzdWVzLmxlbmd0aFxuICAgIH07XG4gIH1cbn07XG5leHBvcnQgZGVmYXVsdCBhY3Rpb247Il0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUNBLFFBQW1CO0FBQ25CLElBQU0sY0FBZ0IsU0FBTztBQUFBLEVBQzNCLE9BQVMsU0FBTyxFQUFFLFNBQVMsZ0NBQWdDO0FBQUEsRUFDM0QsTUFBUSxTQUFPLEVBQUUsU0FBUyxpQkFBaUI7QUFBQSxFQUMzQyxPQUFTLE9BQUssQ0FBQyxRQUFRLFVBQVUsS0FBSyxDQUFDLEVBQUUsU0FBUyxFQUFFLFNBQVMsb0NBQW9DO0FBQUEsRUFDakcsUUFBVSxTQUFPLEVBQUUsU0FBUyxFQUFFLFNBQVMsNkJBQTZCO0FBQUEsRUFDcEUsVUFBWSxTQUFPLEVBQUUsSUFBSSxDQUFDLEVBQUUsSUFBSSxHQUFHLEVBQUUsU0FBUyxFQUFFLFNBQVMsc0NBQXNDO0FBQ2pHLENBQUM7QUFDRCxJQUFNLGNBQWdCLFNBQU87QUFBQSxFQUMzQixRQUFVLFNBQU87QUFBQSxFQUNqQixPQUFTLFNBQU87QUFBQSxFQUNoQixPQUFTLFNBQU87QUFBQSxFQUNoQixNQUFRLFNBQU8sRUFBRSxTQUFTO0FBQUEsRUFDMUIsVUFBWSxTQUFPO0FBQUEsRUFDbkIsTUFBUSxTQUFPLEVBQUUsU0FBUztBQUFBLEVBQzFCLFFBQVUsUUFBUSxTQUFPLENBQUMsRUFBRSxTQUFTO0FBQUEsRUFDckMsV0FBYSxRQUFRLFNBQU8sQ0FBQyxFQUFFLFNBQVM7QUFBQSxFQUN4QyxZQUFjLFNBQU8sRUFBRSxTQUFTO0FBQUEsRUFDaEMsWUFBYyxTQUFPLEVBQUUsU0FBUztBQUFBLEVBQ2hDLFVBQVksU0FBTyxFQUFFLFNBQVM7QUFDaEMsQ0FBQztBQUNELElBQU0sZUFBaUIsU0FBTztBQUFBLEVBQzVCLFFBQVUsUUFBTSxXQUFXO0FBQUEsRUFDM0IsT0FBUyxTQUFPO0FBQ2xCLENBQUM7QUFDRCxJQUFNLFNBQVM7QUFBQSxFQUNiLE1BQU07QUFBQSxFQUNOLGFBQWE7QUFBQSxFQUNiLFNBQVM7QUFBQSxFQUNULFVBQVU7QUFBQSxJQUNSLFFBQVE7QUFBQSxJQUNSLE1BQU07QUFBQSxJQUNOLE9BQU87QUFBQSxFQUNUO0FBQUEsRUFDQSxPQUFPO0FBQUEsRUFDUCxRQUFRO0FBQUEsRUFDUixNQUFNLE9BQU8sT0FBTyxVQUFVO0FBQzVCLFVBQU0sU0FBaUM7QUFBQSxNQUNyQyxPQUFPLE1BQU0sU0FBUztBQUFBLE1BQ3RCLFVBQVUsT0FBTyxNQUFNLFlBQVksRUFBRTtBQUFBLE1BQ3JDLE1BQU07QUFBQSxNQUNOLFdBQVc7QUFBQSxJQUNiO0FBQ0EsUUFBSSxNQUFNLE9BQVEsUUFBTyxRQUFRLElBQUksTUFBTTtBQUMzQyxVQUFNLFdBQVcsTUFBTSxNQUFNLE1BQU07QUFBQSxNQUNqQyxRQUFRO0FBQUEsTUFDUixVQUFVLFVBQVUsTUFBTSxLQUFLLElBQUksTUFBTSxJQUFJO0FBQUEsTUFDN0M7QUFBQSxJQUNGLENBQUM7QUFDRCxRQUFJLENBQUMsTUFBTSxRQUFRLFNBQVMsSUFBSSxHQUFHO0FBQ2pDLFlBQU0sSUFBSSxNQUFNLHFCQUFxQixTQUFTLE1BQU0sV0FBVyxxQkFBcUIsRUFBRTtBQUFBLElBQ3hGO0FBR0EsVUFBTSxTQUFTLFNBQVMsS0FFdkIsT0FBTyxDQUFDLE1BQVcsQ0FBQyxFQUFFLFlBQVksRUFFbEMsSUFBSSxDQUFDLE9BQVk7QUFBQSxNQUNoQixRQUFRLEVBQUU7QUFBQSxNQUNWLE9BQU8sRUFBRTtBQUFBLE1BQ1QsT0FBTyxFQUFFO0FBQUEsTUFDVCxNQUFNLEVBQUUsT0FBTyxFQUFFLEtBQUssVUFBVSxHQUFHLEdBQUksSUFBSTtBQUFBLE1BQzNDLFVBQVUsRUFBRTtBQUFBLE1BQ1osTUFBTSxFQUFFLE1BQU07QUFBQSxNQUNkLFFBQVEsRUFBRSxRQUFRLElBQUksQ0FBQyxNQUVqQixFQUFFLElBQUk7QUFBQSxNQUNaLFdBQVcsRUFBRSxXQUFXLElBQUksQ0FBQyxNQUV2QixFQUFFLEtBQUs7QUFBQSxNQUNiLFlBQVksRUFBRTtBQUFBLE1BQ2QsWUFBWSxFQUFFO0FBQUEsTUFDZCxVQUFVLEVBQUU7QUFBQSxJQUNkLEVBQUU7QUFDRixXQUFPO0FBQUEsTUFDTDtBQUFBLE1BQ0EsT0FBTyxPQUFPO0FBQUEsSUFDaEI7QUFBQSxFQUNGO0FBQ0Y7QUFDQSxJQUFPLHNCQUFROyIsCiAgIm5hbWVzIjogW10KfQo=
