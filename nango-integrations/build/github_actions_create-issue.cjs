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

// github/actions/create-issue.ts
var create_issue_exports = {};
__export(create_issue_exports, {
  default: () => create_issue_default
});
module.exports = __toCommonJS(create_issue_exports);
var z = __toESM(require("zod"), 1);
var inputSchema = z.object({
  owner: z.string().describe("Repository owner (user or org)"),
  repo: z.string().describe("Repository name"),
  title: z.string().min(1).max(256).describe("Issue title"),
  body: z.string().max(65536).optional().describe("Issue body (Markdown supported)"),
  labels: z.array(z.string()).optional().describe("Labels to apply"),
  assignees: z.array(z.string()).optional().describe("GitHub usernames to assign")
});
var outputSchema = z.object({
  number: z.number(),
  title: z.string(),
  html_url: z.string(),
  state: z.string(),
  created_at: z.string()
});
var action = {
  type: "action",
  description: "Create an issue in a GitHub repository",
  version: "1.0.0",
  endpoint: {
    method: "POST",
    path: "/github/issues",
    group: "Issues"
  },
  input: inputSchema,
  output: outputSchema,
  exec: async (nango, input) => {
    const body = {
      title: input.title
    };
    if (input.body) body["body"] = input.body;
    if (input.labels?.length) body["labels"] = input.labels;
    if (input.assignees?.length) body["assignees"] = input.assignees;
    const response = await nango.proxy({
      method: "POST",
      endpoint: `/repos/${input.owner}/${input.repo}/issues`,
      data: body
    });
    if (response.data?.message) {
      throw new Error(`GitHub API error: ${response.data.message}`);
    }
    return {
      number: response.data.number,
      title: response.data.title,
      html_url: response.data.html_url,
      state: response.data.state,
      created_at: response.data.created_at
    };
  }
};
var create_issue_default = action;
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiZ2l0aHViL2FjdGlvbnMvY3JlYXRlLWlzc3VlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyJpbXBvcnQgeyBjcmVhdGVBY3Rpb24gfSBmcm9tICduYW5nbyc7XG5pbXBvcnQgKiBhcyB6IGZyb20gJ3pvZCc7XG5jb25zdCBpbnB1dFNjaGVtYSA9IHoub2JqZWN0KHtcbiAgb3duZXI6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ1JlcG9zaXRvcnkgb3duZXIgKHVzZXIgb3Igb3JnKScpLFxuICByZXBvOiB6LnN0cmluZygpLmRlc2NyaWJlKCdSZXBvc2l0b3J5IG5hbWUnKSxcbiAgdGl0bGU6IHouc3RyaW5nKCkubWluKDEpLm1heCgyNTYpLmRlc2NyaWJlKCdJc3N1ZSB0aXRsZScpLFxuICBib2R5OiB6LnN0cmluZygpLm1heCg2NTUzNikub3B0aW9uYWwoKS5kZXNjcmliZSgnSXNzdWUgYm9keSAoTWFya2Rvd24gc3VwcG9ydGVkKScpLFxuICBsYWJlbHM6IHouYXJyYXkoei5zdHJpbmcoKSkub3B0aW9uYWwoKS5kZXNjcmliZSgnTGFiZWxzIHRvIGFwcGx5JyksXG4gIGFzc2lnbmVlczogei5hcnJheSh6LnN0cmluZygpKS5vcHRpb25hbCgpLmRlc2NyaWJlKCdHaXRIdWIgdXNlcm5hbWVzIHRvIGFzc2lnbicpXG59KTtcbmNvbnN0IG91dHB1dFNjaGVtYSA9IHoub2JqZWN0KHtcbiAgbnVtYmVyOiB6Lm51bWJlcigpLFxuICB0aXRsZTogei5zdHJpbmcoKSxcbiAgaHRtbF91cmw6IHouc3RyaW5nKCksXG4gIHN0YXRlOiB6LnN0cmluZygpLFxuICBjcmVhdGVkX2F0OiB6LnN0cmluZygpXG59KTtcbmNvbnN0IGFjdGlvbiA9IHtcbiAgdHlwZTogXCJhY3Rpb25cIixcbiAgZGVzY3JpcHRpb246ICdDcmVhdGUgYW4gaXNzdWUgaW4gYSBHaXRIdWIgcmVwb3NpdG9yeScsXG4gIHZlcnNpb246ICcxLjAuMCcsXG4gIGVuZHBvaW50OiB7XG4gICAgbWV0aG9kOiAnUE9TVCcsXG4gICAgcGF0aDogJy9naXRodWIvaXNzdWVzJyxcbiAgICBncm91cDogJ0lzc3VlcydcbiAgfSxcbiAgaW5wdXQ6IGlucHV0U2NoZW1hLFxuICBvdXRwdXQ6IG91dHB1dFNjaGVtYSxcbiAgZXhlYzogYXN5bmMgKG5hbmdvLCBpbnB1dCkgPT4ge1xuICAgIGNvbnN0IGJvZHk6IFJlY29yZDxzdHJpbmcsIHVua25vd24+ID0ge1xuICAgICAgdGl0bGU6IGlucHV0LnRpdGxlXG4gICAgfTtcbiAgICBpZiAoaW5wdXQuYm9keSkgYm9keVsnYm9keSddID0gaW5wdXQuYm9keTtcbiAgICBpZiAoaW5wdXQubGFiZWxzPy5sZW5ndGgpIGJvZHlbJ2xhYmVscyddID0gaW5wdXQubGFiZWxzO1xuICAgIGlmIChpbnB1dC5hc3NpZ25lZXM/Lmxlbmd0aCkgYm9keVsnYXNzaWduZWVzJ10gPSBpbnB1dC5hc3NpZ25lZXM7XG4gICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBuYW5nby5wcm94eSh7XG4gICAgICBtZXRob2Q6ICdQT1NUJyxcbiAgICAgIGVuZHBvaW50OiBgL3JlcG9zLyR7aW5wdXQub3duZXJ9LyR7aW5wdXQucmVwb30vaXNzdWVzYCxcbiAgICAgIGRhdGE6IGJvZHlcbiAgICB9KTtcbiAgICBpZiAocmVzcG9uc2UuZGF0YT8ubWVzc2FnZSkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKGBHaXRIdWIgQVBJIGVycm9yOiAke3Jlc3BvbnNlLmRhdGEubWVzc2FnZX1gKTtcbiAgICB9XG4gICAgcmV0dXJuIHtcbiAgICAgIG51bWJlcjogcmVzcG9uc2UuZGF0YS5udW1iZXIsXG4gICAgICB0aXRsZTogcmVzcG9uc2UuZGF0YS50aXRsZSxcbiAgICAgIGh0bWxfdXJsOiByZXNwb25zZS5kYXRhLmh0bWxfdXJsLFxuICAgICAgc3RhdGU6IHJlc3BvbnNlLmRhdGEuc3RhdGUsXG4gICAgICBjcmVhdGVkX2F0OiByZXNwb25zZS5kYXRhLmNyZWF0ZWRfYXRcbiAgICB9O1xuICB9XG59O1xuZXhwb3J0IGRlZmF1bHQgYWN0aW9uOyJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFDQSxRQUFtQjtBQUNuQixJQUFNLGNBQWdCLFNBQU87QUFBQSxFQUMzQixPQUFTLFNBQU8sRUFBRSxTQUFTLGdDQUFnQztBQUFBLEVBQzNELE1BQVEsU0FBTyxFQUFFLFNBQVMsaUJBQWlCO0FBQUEsRUFDM0MsT0FBUyxTQUFPLEVBQUUsSUFBSSxDQUFDLEVBQUUsSUFBSSxHQUFHLEVBQUUsU0FBUyxhQUFhO0FBQUEsRUFDeEQsTUFBUSxTQUFPLEVBQUUsSUFBSSxLQUFLLEVBQUUsU0FBUyxFQUFFLFNBQVMsaUNBQWlDO0FBQUEsRUFDakYsUUFBVSxRQUFRLFNBQU8sQ0FBQyxFQUFFLFNBQVMsRUFBRSxTQUFTLGlCQUFpQjtBQUFBLEVBQ2pFLFdBQWEsUUFBUSxTQUFPLENBQUMsRUFBRSxTQUFTLEVBQUUsU0FBUyw0QkFBNEI7QUFDakYsQ0FBQztBQUNELElBQU0sZUFBaUIsU0FBTztBQUFBLEVBQzVCLFFBQVUsU0FBTztBQUFBLEVBQ2pCLE9BQVMsU0FBTztBQUFBLEVBQ2hCLFVBQVksU0FBTztBQUFBLEVBQ25CLE9BQVMsU0FBTztBQUFBLEVBQ2hCLFlBQWMsU0FBTztBQUN2QixDQUFDO0FBQ0QsSUFBTSxTQUFTO0FBQUEsRUFDYixNQUFNO0FBQUEsRUFDTixhQUFhO0FBQUEsRUFDYixTQUFTO0FBQUEsRUFDVCxVQUFVO0FBQUEsSUFDUixRQUFRO0FBQUEsSUFDUixNQUFNO0FBQUEsSUFDTixPQUFPO0FBQUEsRUFDVDtBQUFBLEVBQ0EsT0FBTztBQUFBLEVBQ1AsUUFBUTtBQUFBLEVBQ1IsTUFBTSxPQUFPLE9BQU8sVUFBVTtBQUM1QixVQUFNLE9BQWdDO0FBQUEsTUFDcEMsT0FBTyxNQUFNO0FBQUEsSUFDZjtBQUNBLFFBQUksTUFBTSxLQUFNLE1BQUssTUFBTSxJQUFJLE1BQU07QUFDckMsUUFBSSxNQUFNLFFBQVEsT0FBUSxNQUFLLFFBQVEsSUFBSSxNQUFNO0FBQ2pELFFBQUksTUFBTSxXQUFXLE9BQVEsTUFBSyxXQUFXLElBQUksTUFBTTtBQUN2RCxVQUFNLFdBQVcsTUFBTSxNQUFNLE1BQU07QUFBQSxNQUNqQyxRQUFRO0FBQUEsTUFDUixVQUFVLFVBQVUsTUFBTSxLQUFLLElBQUksTUFBTSxJQUFJO0FBQUEsTUFDN0MsTUFBTTtBQUFBLElBQ1IsQ0FBQztBQUNELFFBQUksU0FBUyxNQUFNLFNBQVM7QUFDMUIsWUFBTSxJQUFJLE1BQU0scUJBQXFCLFNBQVMsS0FBSyxPQUFPLEVBQUU7QUFBQSxJQUM5RDtBQUNBLFdBQU87QUFBQSxNQUNMLFFBQVEsU0FBUyxLQUFLO0FBQUEsTUFDdEIsT0FBTyxTQUFTLEtBQUs7QUFBQSxNQUNyQixVQUFVLFNBQVMsS0FBSztBQUFBLE1BQ3hCLE9BQU8sU0FBUyxLQUFLO0FBQUEsTUFDckIsWUFBWSxTQUFTLEtBQUs7QUFBQSxJQUM1QjtBQUFBLEVBQ0Y7QUFDRjtBQUNBLElBQU8sdUJBQVE7IiwKICAibmFtZXMiOiBbXQp9Cg==
