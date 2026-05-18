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

// google/actions/find-file.ts
var find_file_exports = {};
__export(find_file_exports, {
  default: () => find_file_default
});
module.exports = __toCommonJS(find_file_exports);
var import_zod = require("zod");
var InputSchema = import_zod.z.object({
  query: import_zod.z.string().optional().describe(`Search query string. Uses Google Drive search query syntax. Example: "name contains 'report'" or "mimeType = 'application/pdf'". If not provided, returns all files.`),
  cursor: import_zod.z.string().optional().describe("Pagination cursor (nextPageToken) from previous response. Omit for first page."),
  pageSize: import_zod.z.number().optional().describe("Maximum number of files to return per page. Default is 100.")
});
var FileSchema = import_zod.z.object({
  id: import_zod.z.string(),
  name: import_zod.z.string(),
  mimeType: import_zod.z.string(),
  modifiedTime: import_zod.z.string().optional(),
  size: import_zod.z.string().optional(),
  webViewLink: import_zod.z.string().optional()
});
var OutputSchema = import_zod.z.object({
  files: import_zod.z.array(FileSchema),
  nextPageToken: import_zod.z.string().optional().describe("Pagination cursor for the next page. Omitted if no more results."),
  totalResults: import_zod.z.number().optional().describe("Total number of files returned in this page")
});
var action = {
  type: "action",
  description: "Search for files by name or query in Google Drive",
  version: "1.0.0",
  endpoint: {
    method: "POST",
    path: "/actions/find-file",
    group: "Files"
  },
  input: InputSchema,
  output: OutputSchema,
  scopes: ["https://www.googleapis.com/auth/drive.readonly"],
  exec: async (nango, input) => {
    const params = {
      fields: "nextPageToken, files(id, name, mimeType, modifiedTime, size, webViewLink)",
      orderBy: "modifiedTime desc",
      pageSize: input.pageSize || 100
    };
    if (input.query) {
      params["q"] = input.query;
    }
    if (input.cursor) {
      params["pageToken"] = input.cursor;
    }
    const response = await nango.get({
      endpoint: "/drive/v3/files",
      params,
      retries: 3
    });
    const files = (response.data.files || []).map((file) => ({
      id: file.id,
      name: file.name,
      mimeType: file.mimeType,
      modifiedTime: file.modifiedTime,
      size: file.size,
      webViewLink: file.webViewLink
    }));
    return {
      files,
      nextPageToken: response.data.nextPageToken || void 0,
      totalResults: files.length
    };
  }
};
var find_file_default = action;
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiZ29vZ2xlL2FjdGlvbnMvZmluZC1maWxlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyJpbXBvcnQgeyB6IH0gZnJvbSAnem9kJztcbmltcG9ydCB7IGNyZWF0ZUFjdGlvbiB9IGZyb20gJ25hbmdvJztcbmNvbnN0IElucHV0U2NoZW1hID0gei5vYmplY3Qoe1xuICBxdWVyeTogei5zdHJpbmcoKS5vcHRpb25hbCgpLmRlc2NyaWJlKCdTZWFyY2ggcXVlcnkgc3RyaW5nLiBVc2VzIEdvb2dsZSBEcml2ZSBzZWFyY2ggcXVlcnkgc3ludGF4LiBFeGFtcGxlOiBcIm5hbWUgY29udGFpbnMgXFwncmVwb3J0XFwnXCIgb3IgXCJtaW1lVHlwZSA9IFxcJ2FwcGxpY2F0aW9uL3BkZlxcJ1wiLiBJZiBub3QgcHJvdmlkZWQsIHJldHVybnMgYWxsIGZpbGVzLicpLFxuICBjdXJzb3I6IHouc3RyaW5nKCkub3B0aW9uYWwoKS5kZXNjcmliZSgnUGFnaW5hdGlvbiBjdXJzb3IgKG5leHRQYWdlVG9rZW4pIGZyb20gcHJldmlvdXMgcmVzcG9uc2UuIE9taXQgZm9yIGZpcnN0IHBhZ2UuJyksXG4gIHBhZ2VTaXplOiB6Lm51bWJlcigpLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ01heGltdW0gbnVtYmVyIG9mIGZpbGVzIHRvIHJldHVybiBwZXIgcGFnZS4gRGVmYXVsdCBpcyAxMDAuJylcbn0pO1xuY29uc3QgRmlsZVNjaGVtYSA9IHoub2JqZWN0KHtcbiAgaWQ6IHouc3RyaW5nKCksXG4gIG5hbWU6IHouc3RyaW5nKCksXG4gIG1pbWVUeXBlOiB6LnN0cmluZygpLFxuICBtb2RpZmllZFRpbWU6IHouc3RyaW5nKCkub3B0aW9uYWwoKSxcbiAgc2l6ZTogei5zdHJpbmcoKS5vcHRpb25hbCgpLFxuICB3ZWJWaWV3TGluazogei5zdHJpbmcoKS5vcHRpb25hbCgpXG59KTtcbmNvbnN0IE91dHB1dFNjaGVtYSA9IHoub2JqZWN0KHtcbiAgZmlsZXM6IHouYXJyYXkoRmlsZVNjaGVtYSksXG4gIG5leHRQYWdlVG9rZW46IHouc3RyaW5nKCkub3B0aW9uYWwoKS5kZXNjcmliZSgnUGFnaW5hdGlvbiBjdXJzb3IgZm9yIHRoZSBuZXh0IHBhZ2UuIE9taXR0ZWQgaWYgbm8gbW9yZSByZXN1bHRzLicpLFxuICB0b3RhbFJlc3VsdHM6IHoubnVtYmVyKCkub3B0aW9uYWwoKS5kZXNjcmliZSgnVG90YWwgbnVtYmVyIG9mIGZpbGVzIHJldHVybmVkIGluIHRoaXMgcGFnZScpXG59KTtcbmNvbnN0IGFjdGlvbiA9IHtcbiAgdHlwZTogXCJhY3Rpb25cIixcbiAgZGVzY3JpcHRpb246ICdTZWFyY2ggZm9yIGZpbGVzIGJ5IG5hbWUgb3IgcXVlcnkgaW4gR29vZ2xlIERyaXZlJyxcbiAgdmVyc2lvbjogJzEuMC4wJyxcbiAgZW5kcG9pbnQ6IHtcbiAgICBtZXRob2Q6ICdQT1NUJyxcbiAgICBwYXRoOiAnL2FjdGlvbnMvZmluZC1maWxlJyxcbiAgICBncm91cDogJ0ZpbGVzJ1xuICB9LFxuICBpbnB1dDogSW5wdXRTY2hlbWEsXG4gIG91dHB1dDogT3V0cHV0U2NoZW1hLFxuICBzY29wZXM6IFsnaHR0cHM6Ly93d3cuZ29vZ2xlYXBpcy5jb20vYXV0aC9kcml2ZS5yZWFkb25seSddLFxuICBleGVjOiBhc3luYyAobmFuZ28sIGlucHV0KTogUHJvbWlzZTx6LmluZmVyPHR5cGVvZiBPdXRwdXRTY2hlbWE+PiA9PiB7XG4gICAgLy8gaHR0cHM6Ly9kZXZlbG9wZXJzLmdvb2dsZS5jb20vd29ya3NwYWNlL2RyaXZlL2FwaS9yZWZlcmVuY2UvcmVzdC92My9maWxlcy9saXN0XG4gICAgY29uc3QgcGFyYW1zOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmcgfCBudW1iZXI+ID0ge1xuICAgICAgZmllbGRzOiAnbmV4dFBhZ2VUb2tlbiwgZmlsZXMoaWQsIG5hbWUsIG1pbWVUeXBlLCBtb2RpZmllZFRpbWUsIHNpemUsIHdlYlZpZXdMaW5rKScsXG4gICAgICBvcmRlckJ5OiAnbW9kaWZpZWRUaW1lIGRlc2MnLFxuICAgICAgcGFnZVNpemU6IGlucHV0LnBhZ2VTaXplIHx8IDEwMFxuICAgIH07XG4gICAgaWYgKGlucHV0LnF1ZXJ5KSB7XG4gICAgICBwYXJhbXNbJ3EnXSA9IGlucHV0LnF1ZXJ5O1xuICAgIH1cbiAgICBpZiAoaW5wdXQuY3Vyc29yKSB7XG4gICAgICBwYXJhbXNbJ3BhZ2VUb2tlbiddID0gaW5wdXQuY3Vyc29yO1xuICAgIH1cbiAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IG5hbmdvLmdldCh7XG4gICAgICBlbmRwb2ludDogJy9kcml2ZS92My9maWxlcycsXG4gICAgICBwYXJhbXMsXG4gICAgICByZXRyaWVzOiAzXG4gICAgfSk7XG4gICAgY29uc3QgZmlsZXMgPSAocmVzcG9uc2UuZGF0YS5maWxlcyB8fCBbXSkubWFwKChmaWxlOiBhbnkpID0+ICh7XG4gICAgICBpZDogZmlsZS5pZCxcbiAgICAgIG5hbWU6IGZpbGUubmFtZSxcbiAgICAgIG1pbWVUeXBlOiBmaWxlLm1pbWVUeXBlLFxuICAgICAgbW9kaWZpZWRUaW1lOiBmaWxlLm1vZGlmaWVkVGltZSxcbiAgICAgIHNpemU6IGZpbGUuc2l6ZSxcbiAgICAgIHdlYlZpZXdMaW5rOiBmaWxlLndlYlZpZXdMaW5rXG4gICAgfSkpO1xuICAgIHJldHVybiB7XG4gICAgICBmaWxlcyxcbiAgICAgIG5leHRQYWdlVG9rZW46IHJlc3BvbnNlLmRhdGEubmV4dFBhZ2VUb2tlbiB8fCB1bmRlZmluZWQsXG4gICAgICB0b3RhbFJlc3VsdHM6IGZpbGVzLmxlbmd0aFxuICAgIH07XG4gIH1cbn07XG5leHBvcnQgdHlwZSBOYW5nb0FjdGlvbkxvY2FsID0gUGFyYW1ldGVyczwodHlwZW9mIGFjdGlvbilbJ2V4ZWMnXT5bMF07XG5leHBvcnQgZGVmYXVsdCBhY3Rpb247Il0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsaUJBQWtCO0FBRWxCLElBQU0sY0FBYyxhQUFFLE9BQU87QUFBQSxFQUMzQixPQUFPLGFBQUUsT0FBTyxFQUFFLFNBQVMsRUFBRSxTQUFTLHNLQUEwSztBQUFBLEVBQ2hOLFFBQVEsYUFBRSxPQUFPLEVBQUUsU0FBUyxFQUFFLFNBQVMsZ0ZBQWdGO0FBQUEsRUFDdkgsVUFBVSxhQUFFLE9BQU8sRUFBRSxTQUFTLEVBQUUsU0FBUyw2REFBNkQ7QUFDeEcsQ0FBQztBQUNELElBQU0sYUFBYSxhQUFFLE9BQU87QUFBQSxFQUMxQixJQUFJLGFBQUUsT0FBTztBQUFBLEVBQ2IsTUFBTSxhQUFFLE9BQU87QUFBQSxFQUNmLFVBQVUsYUFBRSxPQUFPO0FBQUEsRUFDbkIsY0FBYyxhQUFFLE9BQU8sRUFBRSxTQUFTO0FBQUEsRUFDbEMsTUFBTSxhQUFFLE9BQU8sRUFBRSxTQUFTO0FBQUEsRUFDMUIsYUFBYSxhQUFFLE9BQU8sRUFBRSxTQUFTO0FBQ25DLENBQUM7QUFDRCxJQUFNLGVBQWUsYUFBRSxPQUFPO0FBQUEsRUFDNUIsT0FBTyxhQUFFLE1BQU0sVUFBVTtBQUFBLEVBQ3pCLGVBQWUsYUFBRSxPQUFPLEVBQUUsU0FBUyxFQUFFLFNBQVMsa0VBQWtFO0FBQUEsRUFDaEgsY0FBYyxhQUFFLE9BQU8sRUFBRSxTQUFTLEVBQUUsU0FBUyw2Q0FBNkM7QUFDNUYsQ0FBQztBQUNELElBQU0sU0FBUztBQUFBLEVBQ2IsTUFBTTtBQUFBLEVBQ04sYUFBYTtBQUFBLEVBQ2IsU0FBUztBQUFBLEVBQ1QsVUFBVTtBQUFBLElBQ1IsUUFBUTtBQUFBLElBQ1IsTUFBTTtBQUFBLElBQ04sT0FBTztBQUFBLEVBQ1Q7QUFBQSxFQUNBLE9BQU87QUFBQSxFQUNQLFFBQVE7QUFBQSxFQUNSLFFBQVEsQ0FBQyxnREFBZ0Q7QUFBQSxFQUN6RCxNQUFNLE9BQU8sT0FBTyxVQUFpRDtBQUVuRSxVQUFNLFNBQTBDO0FBQUEsTUFDOUMsUUFBUTtBQUFBLE1BQ1IsU0FBUztBQUFBLE1BQ1QsVUFBVSxNQUFNLFlBQVk7QUFBQSxJQUM5QjtBQUNBLFFBQUksTUFBTSxPQUFPO0FBQ2YsYUFBTyxHQUFHLElBQUksTUFBTTtBQUFBLElBQ3RCO0FBQ0EsUUFBSSxNQUFNLFFBQVE7QUFDaEIsYUFBTyxXQUFXLElBQUksTUFBTTtBQUFBLElBQzlCO0FBQ0EsVUFBTSxXQUFXLE1BQU0sTUFBTSxJQUFJO0FBQUEsTUFDL0IsVUFBVTtBQUFBLE1BQ1Y7QUFBQSxNQUNBLFNBQVM7QUFBQSxJQUNYLENBQUM7QUFDRCxVQUFNLFNBQVMsU0FBUyxLQUFLLFNBQVMsQ0FBQyxHQUFHLElBQUksQ0FBQyxVQUFlO0FBQUEsTUFDNUQsSUFBSSxLQUFLO0FBQUEsTUFDVCxNQUFNLEtBQUs7QUFBQSxNQUNYLFVBQVUsS0FBSztBQUFBLE1BQ2YsY0FBYyxLQUFLO0FBQUEsTUFDbkIsTUFBTSxLQUFLO0FBQUEsTUFDWCxhQUFhLEtBQUs7QUFBQSxJQUNwQixFQUFFO0FBQ0YsV0FBTztBQUFBLE1BQ0w7QUFBQSxNQUNBLGVBQWUsU0FBUyxLQUFLLGlCQUFpQjtBQUFBLE1BQzlDLGNBQWMsTUFBTTtBQUFBLElBQ3RCO0FBQUEsRUFDRjtBQUNGO0FBRUEsSUFBTyxvQkFBUTsiLAogICJuYW1lcyI6IFtdCn0K
