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

// slack/actions/search-files.ts
var search_files_exports = {};
__export(search_files_exports, {
  default: () => search_files_default
});
module.exports = __toCommonJS(search_files_exports);
var import_zod = require("zod");
var InputSchema = import_zod.z.object({
  query: import_zod.z.string().describe('Search query string. Example: "report"'),
  count: import_zod.z.number().optional().describe("Number of items to return per page. Max 100. Default: 20"),
  page: import_zod.z.number().optional().describe("Page number of results to return. Default: 1"),
  sort: import_zod.z.enum(["score", "timestamp"]).optional().describe("Sort by score or timestamp. Default: score"),
  sort_dir: import_zod.z.enum(["asc", "desc"]).optional().describe("Sort direction: ascending or descending. Default: desc"),
  highlight: import_zod.z.boolean().optional().describe("Enable query highlight markers in results. Default: false")
});
var FileSchema = import_zod.z.object({
  id: import_zod.z.string(),
  name: import_zod.z.string(),
  title: import_zod.z.string().optional(),
  filetype: import_zod.z.string(),
  mimetype: import_zod.z.string(),
  user: import_zod.z.string(),
  username: import_zod.z.string(),
  created: import_zod.z.number(),
  timestamp: import_zod.z.number(),
  size: import_zod.z.number(),
  mode: import_zod.z.string(),
  is_public: import_zod.z.boolean(),
  is_external: import_zod.z.boolean(),
  external_type: import_zod.z.string(),
  editable: import_zod.z.boolean(),
  display_as_bot: import_zod.z.boolean(),
  url_private: import_zod.z.string().optional(),
  url_private_download: import_zod.z.string().optional(),
  permalink: import_zod.z.string().optional(),
  permalink_public: import_zod.z.string().optional(),
  preview: import_zod.z.string().optional(),
  public_url_shared: import_zod.z.boolean(),
  channels: import_zod.z.array(import_zod.z.string()),
  groups: import_zod.z.array(import_zod.z.string()),
  ims: import_zod.z.array(import_zod.z.string()),
  comments_count: import_zod.z.number(),
  pretty_type: import_zod.z.string(),
  score: import_zod.z.string().optional()
});
var PagingSchema = import_zod.z.object({
  count: import_zod.z.number(),
  page: import_zod.z.number(),
  pages: import_zod.z.number(),
  total: import_zod.z.number()
});
var OutputSchema = import_zod.z.object({
  files: import_zod.z.array(FileSchema),
  paging: PagingSchema,
  total: import_zod.z.number()
});
var action = {
  type: "action",
  description: "Search workspace files with pagination",
  version: "1.0.0",
  endpoint: {
    method: "POST",
    path: "/actions/search-files",
    group: "Files"
  },
  input: InputSchema,
  output: OutputSchema,
  scopes: ["search:read"],
  exec: async (nango, input) => {
    // search.files requires a user token (xoxp-), not a bot token (xoxb-)
    // Fetch the connection to get the user token from raw.authed_user.access_token
    const conn = await nango.getConnection();
    const userToken = conn?.credentials?.raw?.authed_user?.access_token;
    if (!userToken) {
      throw new nango.ActionError({
        type: "auth_error",
        message: "search-files requires a user token (xoxp-). Reinstall the Slack app with the search:read user scope.",
        details: { hint: "OAuth & Permissions → User Token Scopes → add search:read → Reinstall to Workspace" }
      });
    }

    const params = new URLSearchParams({ query: input.query });
    if (input.count) params.set("count", input.count.toString());
    if (input.page) params.set("page", input.page.toString());
    if (input.sort) params.set("sort", input.sort);
    if (input.sort_dir) params.set("sort_dir", input.sort_dir);
    if (input.highlight) params.set("highlight", input.highlight.toString());

    // Call Slack API directly — nango.proxy() would override the Authorization
    // header with the Nango secret key, causing auth failure with user tokens.
    const resp = await fetch(`https://slack.com/api/search.files?${params}`, {
      headers: { Authorization: `Bearer ${userToken}` },
    });
    const data = await resp.json();
    if (!data || !data.ok) {
      throw new nango.ActionError({
        type: "api_error",
        message: data?.error || "Failed to search files",
        query: input.query
      });
    }
    const filesData = data.files || {};
    const matches = filesData.matches || [];
    const paging = filesData.paging || {
      count: 0,
      page: 1,
      pages: 0,
      total: 0
    };
    const files = matches.map((file) => ({
      id: file.id,
      name: file.name || "",
      title: file.title,
      filetype: file.filetype || "",
      mimetype: file.mimetype || "",
      user: file.user || "",
      username: file.username || "",
      created: file.created || 0,
      timestamp: file.timestamp || 0,
      size: file.size || 0,
      mode: file.mode || "",
      is_public: file.is_public || false,
      is_external: file.is_external || false,
      external_type: file.external_type || "",
      editable: file.editable || false,
      display_as_bot: file.display_as_bot || false,
      url_private: file.url_private,
      url_private_download: file.url_private_download,
      permalink: file.permalink,
      permalink_public: file.permalink_public,
      preview: file.preview ?? void 0,
      public_url_shared: file.public_url_shared || false,
      channels: file.channels || [],
      groups: file.groups || [],
      ims: file.ims || [],
      comments_count: file.comments_count || 0,
      pretty_type: file.pretty_type || "",
      score: file.score
    }));
    return {
      files,
      paging: {
        count: paging.count || 0,
        page: paging.page || 1,
        pages: paging.pages || 0,
        total: paging.total || 0
      },
      total: filesData.total || 0
    };
  }
};
var search_files_default = action;
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsic2xhY2svYWN0aW9ucy9zZWFyY2gtZmlsZXMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImltcG9ydCB7IHogfSBmcm9tICd6b2QnO1xuaW1wb3J0IHsgY3JlYXRlQWN0aW9uIH0gZnJvbSAnbmFuZ28nO1xuY29uc3QgSW5wdXRTY2hlbWEgPSB6Lm9iamVjdCh7XG4gIHF1ZXJ5OiB6LnN0cmluZygpLmRlc2NyaWJlKCdTZWFyY2ggcXVlcnkgc3RyaW5nLiBFeGFtcGxlOiBcInJlcG9ydFwiJyksXG4gIGNvdW50OiB6Lm51bWJlcigpLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ051bWJlciBvZiBpdGVtcyB0byByZXR1cm4gcGVyIHBhZ2UuIE1heCAxMDAuIERlZmF1bHQ6IDIwJyksXG4gIHBhZ2U6IHoubnVtYmVyKCkub3B0aW9uYWwoKS5kZXNjcmliZSgnUGFnZSBudW1iZXIgb2YgcmVzdWx0cyB0byByZXR1cm4uIERlZmF1bHQ6IDEnKSxcbiAgc29ydDogei5lbnVtKFsnc2NvcmUnLCAndGltZXN0YW1wJ10pLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ1NvcnQgYnkgc2NvcmUgb3IgdGltZXN0YW1wLiBEZWZhdWx0OiBzY29yZScpLFxuICBzb3J0X2Rpcjogei5lbnVtKFsnYXNjJywgJ2Rlc2MnXSkub3B0aW9uYWwoKS5kZXNjcmliZSgnU29ydCBkaXJlY3Rpb246IGFzY2VuZGluZyBvciBkZXNjZW5kaW5nLiBEZWZhdWx0OiBkZXNjJyksXG4gIGhpZ2hsaWdodDogei5ib29sZWFuKCkub3B0aW9uYWwoKS5kZXNjcmliZSgnRW5hYmxlIHF1ZXJ5IGhpZ2hsaWdodCBtYXJrZXJzIGluIHJlc3VsdHMuIERlZmF1bHQ6IGZhbHNlJylcbn0pO1xuY29uc3QgRmlsZVNjaGVtYSA9IHoub2JqZWN0KHtcbiAgaWQ6IHouc3RyaW5nKCksXG4gIG5hbWU6IHouc3RyaW5nKCksXG4gIHRpdGxlOiB6LnN0cmluZygpLm9wdGlvbmFsKCksXG4gIGZpbGV0eXBlOiB6LnN0cmluZygpLFxuICBtaW1ldHlwZTogei5zdHJpbmcoKSxcbiAgdXNlcjogei5zdHJpbmcoKSxcbiAgdXNlcm5hbWU6IHouc3RyaW5nKCksXG4gIGNyZWF0ZWQ6IHoubnVtYmVyKCksXG4gIHRpbWVzdGFtcDogei5udW1iZXIoKSxcbiAgc2l6ZTogei5udW1iZXIoKSxcbiAgbW9kZTogei5zdHJpbmcoKSxcbiAgaXNfcHVibGljOiB6LmJvb2xlYW4oKSxcbiAgaXNfZXh0ZXJuYWw6IHouYm9vbGVhbigpLFxuICBleHRlcm5hbF90eXBlOiB6LnN0cmluZygpLFxuICBlZGl0YWJsZTogei5ib29sZWFuKCksXG4gIGRpc3BsYXlfYXNfYm90OiB6LmJvb2xlYW4oKSxcbiAgdXJsX3ByaXZhdGU6IHouc3RyaW5nKCkub3B0aW9uYWwoKSxcbiAgdXJsX3ByaXZhdGVfZG93bmxvYWQ6IHouc3RyaW5nKCkub3B0aW9uYWwoKSxcbiAgcGVybWFsaW5rOiB6LnN0cmluZygpLm9wdGlvbmFsKCksXG4gIHBlcm1hbGlua19wdWJsaWM6IHouc3RyaW5nKCkub3B0aW9uYWwoKSxcbiAgcHJldmlldzogei5zdHJpbmcoKS5vcHRpb25hbCgpLFxuICBwdWJsaWNfdXJsX3NoYXJlZDogei5ib29sZWFuKCksXG4gIGNoYW5uZWxzOiB6LmFycmF5KHouc3RyaW5nKCkpLFxuICBncm91cHM6IHouYXJyYXkoei5zdHJpbmcoKSksXG4gIGltczogei5hcnJheSh6LnN0cmluZygpKSxcbiAgY29tbWVudHNfY291bnQ6IHoubnVtYmVyKCksXG4gIHByZXR0eV90eXBlOiB6LnN0cmluZygpLFxuICBzY29yZTogei5zdHJpbmcoKS5vcHRpb25hbCgpXG59KTtcbmNvbnN0IFBhZ2luZ1NjaGVtYSA9IHoub2JqZWN0KHtcbiAgY291bnQ6IHoubnVtYmVyKCksXG4gIHBhZ2U6IHoubnVtYmVyKCksXG4gIHBhZ2VzOiB6Lm51bWJlcigpLFxuICB0b3RhbDogei5udW1iZXIoKVxufSk7XG5jb25zdCBPdXRwdXRTY2hlbWEgPSB6Lm9iamVjdCh7XG4gIGZpbGVzOiB6LmFycmF5KEZpbGVTY2hlbWEpLFxuICBwYWdpbmc6IFBhZ2luZ1NjaGVtYSxcbiAgdG90YWw6IHoubnVtYmVyKClcbn0pO1xuY29uc3QgYWN0aW9uID0ge1xuICB0eXBlOiBcImFjdGlvblwiLFxuICBkZXNjcmlwdGlvbjogJ1NlYXJjaCB3b3Jrc3BhY2UgZmlsZXMgd2l0aCBwYWdpbmF0aW9uJyxcbiAgdmVyc2lvbjogJzEuMC4wJyxcbiAgZW5kcG9pbnQ6IHtcbiAgICBtZXRob2Q6ICdQT1NUJyxcbiAgICBwYXRoOiAnL2FjdGlvbnMvc2VhcmNoLWZpbGVzJyxcbiAgICBncm91cDogJ0ZpbGVzJ1xuICB9LFxuICBpbnB1dDogSW5wdXRTY2hlbWEsXG4gIG91dHB1dDogT3V0cHV0U2NoZW1hLFxuICBzY29wZXM6IFsnc2VhcmNoOnJlYWQnXSxcbiAgZXhlYzogYXN5bmMgKG5hbmdvLCBpbnB1dCk6IFByb21pc2U8ei5pbmZlcjx0eXBlb2YgT3V0cHV0U2NoZW1hPj4gPT4ge1xuICAgIC8vIGh0dHBzOi8vYXBpLnNsYWNrLmNvbS9tZXRob2RzL3NlYXJjaC5maWxlc1xuICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgbmFuZ28uZ2V0KHtcbiAgICAgIGVuZHBvaW50OiAnc2VhcmNoLmZpbGVzJyxcbiAgICAgIHBhcmFtczoge1xuICAgICAgICBxdWVyeTogaW5wdXQucXVlcnksXG4gICAgICAgIC4uLihpbnB1dC5jb3VudCAmJiB7XG4gICAgICAgICAgY291bnQ6IGlucHV0LmNvdW50LnRvU3RyaW5nKClcbiAgICAgICAgfSksXG4gICAgICAgIC4uLihpbnB1dC5wYWdlICYmIHtcbiAgICAgICAgICBwYWdlOiBpbnB1dC5wYWdlLnRvU3RyaW5nKClcbiAgICAgICAgfSksXG4gICAgICAgIC4uLihpbnB1dC5zb3J0ICYmIHtcbiAgICAgICAgICBzb3J0OiBpbnB1dC5zb3J0XG4gICAgICAgIH0pLFxuICAgICAgICAuLi4oaW5wdXQuc29ydF9kaXIgJiYge1xuICAgICAgICAgIHNvcnRfZGlyOiBpbnB1dC5zb3J0X2RpclxuICAgICAgICB9KSxcbiAgICAgICAgLi4uKGlucHV0LmhpZ2hsaWdodCAmJiB7XG4gICAgICAgICAgaGlnaGxpZ2h0OiBpbnB1dC5oaWdobGlnaHQudG9TdHJpbmcoKVxuICAgICAgICB9KVxuICAgICAgfSxcbiAgICAgIHJldHJpZXM6IDNcbiAgICB9KTtcbiAgICBpZiAoIXJlc3BvbnNlLmRhdGEgfHwgIXJlc3BvbnNlLmRhdGEub2spIHtcbiAgICAgIHRocm93IG5ldyBuYW5nby5BY3Rpb25FcnJvcih7XG4gICAgICAgIHR5cGU6ICdhcGlfZXJyb3InLFxuICAgICAgICBtZXNzYWdlOiByZXNwb25zZS5kYXRhPy5lcnJvciB8fCAnRmFpbGVkIHRvIHNlYXJjaCBmaWxlcycsXG4gICAgICAgIHF1ZXJ5OiBpbnB1dC5xdWVyeVxuICAgICAgfSk7XG4gICAgfVxuICAgIGNvbnN0IGZpbGVzRGF0YSA9IHJlc3BvbnNlLmRhdGEuZmlsZXMgfHwge307XG4gICAgY29uc3QgbWF0Y2hlcyA9IGZpbGVzRGF0YS5tYXRjaGVzIHx8IFtdO1xuICAgIGNvbnN0IHBhZ2luZyA9IGZpbGVzRGF0YS5wYWdpbmcgfHwge1xuICAgICAgY291bnQ6IDAsXG4gICAgICBwYWdlOiAxLFxuICAgICAgcGFnZXM6IDAsXG4gICAgICB0b3RhbDogMFxuICAgIH07XG4gICAgY29uc3QgZmlsZXMgPSBtYXRjaGVzLm1hcCgoZmlsZTogYW55KSA9PiAoe1xuICAgICAgaWQ6IGZpbGUuaWQsXG4gICAgICBuYW1lOiBmaWxlLm5hbWUgfHwgJycsXG4gICAgICB0aXRsZTogZmlsZS50aXRsZSxcbiAgICAgIGZpbGV0eXBlOiBmaWxlLmZpbGV0eXBlIHx8ICcnLFxuICAgICAgbWltZXR5cGU6IGZpbGUubWltZXR5cGUgfHwgJycsXG4gICAgICB1c2VyOiBmaWxlLnVzZXIgfHwgJycsXG4gICAgICB1c2VybmFtZTogZmlsZS51c2VybmFtZSB8fCAnJyxcbiAgICAgIGNyZWF0ZWQ6IGZpbGUuY3JlYXRlZCB8fCAwLFxuICAgICAgdGltZXN0YW1wOiBmaWxlLnRpbWVzdGFtcCB8fCAwLFxuICAgICAgc2l6ZTogZmlsZS5zaXplIHx8IDAsXG4gICAgICBtb2RlOiBmaWxlLm1vZGUgfHwgJycsXG4gICAgICBpc19wdWJsaWM6IGZpbGUuaXNfcHVibGljIHx8IGZhbHNlLFxuICAgICAgaXNfZXh0ZXJuYWw6IGZpbGUuaXNfZXh0ZXJuYWwgfHwgZmFsc2UsXG4gICAgICBleHRlcm5hbF90eXBlOiBmaWxlLmV4dGVybmFsX3R5cGUgfHwgJycsXG4gICAgICBlZGl0YWJsZTogZmlsZS5lZGl0YWJsZSB8fCBmYWxzZSxcbiAgICAgIGRpc3BsYXlfYXNfYm90OiBmaWxlLmRpc3BsYXlfYXNfYm90IHx8IGZhbHNlLFxuICAgICAgdXJsX3ByaXZhdGU6IGZpbGUudXJsX3ByaXZhdGUsXG4gICAgICB1cmxfcHJpdmF0ZV9kb3dubG9hZDogZmlsZS51cmxfcHJpdmF0ZV9kb3dubG9hZCxcbiAgICAgIHBlcm1hbGluazogZmlsZS5wZXJtYWxpbmssXG4gICAgICBwZXJtYWxpbmtfcHVibGljOiBmaWxlLnBlcm1hbGlua19wdWJsaWMsXG4gICAgICBwcmV2aWV3OiBmaWxlLnByZXZpZXcgPz8gdW5kZWZpbmVkLFxuICAgICAgcHVibGljX3VybF9zaGFyZWQ6IGZpbGUucHVibGljX3VybF9zaGFyZWQgfHwgZmFsc2UsXG4gICAgICBjaGFubmVsczogZmlsZS5jaGFubmVscyB8fCBbXSxcbiAgICAgIGdyb3VwczogZmlsZS5ncm91cHMgfHwgW10sXG4gICAgICBpbXM6IGZpbGUuaW1zIHx8IFtdLFxuICAgICAgY29tbWVudHNfY291bnQ6IGZpbGUuY29tbWVudHNfY291bnQgfHwgMCxcbiAgICAgIHByZXR0eV90eXBlOiBmaWxlLnByZXR0eV90eXBlIHx8ICcnLFxuICAgICAgc2NvcmU6IGZpbGUuc2NvcmVcbiAgICB9KSk7XG4gICAgcmV0dXJuIHtcbiAgICAgIGZpbGVzLFxuICAgICAgcGFnaW5nOiB7XG4gICAgICAgIGNvdW50OiBwYWdpbmcuY291bnQgfHwgMCxcbiAgICAgICAgcGFnZTogcGFnaW5nLnBhZ2UgfHwgMSxcbiAgICAgICAgcGFnZXM6IHBhZ2luZy5wYWdlcyB8fCAwLFxuICAgICAgICB0b3RhbDogcGFnaW5nLnRvdGFsIHx8IDBcbiAgICAgIH0sXG4gICAgICB0b3RhbDogZmlsZXNEYXRhLnRvdGFsIHx8IDBcbiAgICB9O1xuICB9XG59O1xuZXhwb3J0IHR5cGUgTmFuZ29BY3Rpb25Mb2NhbCA9IFBhcmFtZXRlcnM8KHR5cGVvZiBhY3Rpb24pWydleGVjJ10+WzBdO1xuZXhwb3J0IGRlZmF1bHQgYWN0aW9uOyJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLGlCQUFrQjtBQUVsQixJQUFNLGNBQWMsYUFBRSxPQUFPO0FBQUEsRUFDM0IsT0FBTyxhQUFFLE9BQU8sRUFBRSxTQUFTLHdDQUF3QztBQUFBLEVBQ25FLE9BQU8sYUFBRSxPQUFPLEVBQUUsU0FBUyxFQUFFLFNBQVMsMERBQTBEO0FBQUEsRUFDaEcsTUFBTSxhQUFFLE9BQU8sRUFBRSxTQUFTLEVBQUUsU0FBUyw4Q0FBOEM7QUFBQSxFQUNuRixNQUFNLGFBQUUsS0FBSyxDQUFDLFNBQVMsV0FBVyxDQUFDLEVBQUUsU0FBUyxFQUFFLFNBQVMsNENBQTRDO0FBQUEsRUFDckcsVUFBVSxhQUFFLEtBQUssQ0FBQyxPQUFPLE1BQU0sQ0FBQyxFQUFFLFNBQVMsRUFBRSxTQUFTLHdEQUF3RDtBQUFBLEVBQzlHLFdBQVcsYUFBRSxRQUFRLEVBQUUsU0FBUyxFQUFFLFNBQVMsMkRBQTJEO0FBQ3hHLENBQUM7QUFDRCxJQUFNLGFBQWEsYUFBRSxPQUFPO0FBQUEsRUFDMUIsSUFBSSxhQUFFLE9BQU87QUFBQSxFQUNiLE1BQU0sYUFBRSxPQUFPO0FBQUEsRUFDZixPQUFPLGFBQUUsT0FBTyxFQUFFLFNBQVM7QUFBQSxFQUMzQixVQUFVLGFBQUUsT0FBTztBQUFBLEVBQ25C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
