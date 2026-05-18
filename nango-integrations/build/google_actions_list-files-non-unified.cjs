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

// google/actions/list-files-non-unified.ts
var list_files_non_unified_exports = {};
__export(list_files_non_unified_exports, {
  default: () => list_files_non_unified_default
});
module.exports = __toCommonJS(list_files_non_unified_exports);
var import_zod = require("zod");
var InputSchema = import_zod.z.object({
  folderId: import_zod.z.string().optional().describe("Folder ID to list contents. Omit for root folder."),
  cursor: import_zod.z.string().optional().describe("Pagination cursor (pageToken) from previous response. Omit for first page."),
  limit: import_zod.z.number().optional().describe("Maximum number of files to return. Default: 100."),
  includeSharedDrives: import_zod.z.boolean().optional().describe("Include items from shared drives. Default: false.")
});
var FileSchema = import_zod.z.object({
  id: import_zod.z.string(),
  name: import_zod.z.string(),
  mimeType: import_zod.z.string(),
  isFolder: import_zod.z.boolean(),
  parentId: import_zod.z.string().optional(),
  createdTime: import_zod.z.string().optional(),
  modifiedTime: import_zod.z.string().optional(),
  size: import_zod.z.number().optional(),
  webViewLink: import_zod.z.string().optional(),
  thumbnailLink: import_zod.z.string().optional()
});
var OutputSchema = import_zod.z.object({
  files: import_zod.z.array(FileSchema),
  nextPageToken: import_zod.z.string().optional().describe("Cursor for next page. Omitted if no more pages."),
  totalCount: import_zod.z.number().describe("Total number of files in this page.")
});
var action = {
  type: "action",
  description: "List immediate files and folders for a folder ID, or root when omitted, with cursor pagination and shared-drive support.",
  version: "1.0.0",
  endpoint: {
    method: "GET",
    path: "/actions/list-files-non-unified",
    group: "Files"
  },
  input: InputSchema,
  output: OutputSchema,
  scopes: ["https://www.googleapis.com/auth/drive.readonly"],
  exec: async (nango, input) => {
    const parentId = input.folderId || "root";
    const query = `'${parentId}' in parents and trashed = false`;
    const params = {
      q: query,
      fields: "files(id,name,mimeType,parents,createdTime,modifiedTime,size,webViewLink,thumbnailLink),nextPageToken",
      pageSize: input.limit || 100
    };
    if (input.cursor) {
      params["pageToken"] = input.cursor;
    }
    if (input.includeSharedDrives) {
      params["includeItemsFromAllDrives"] = "true";
      params["supportsAllDrives"] = "true";
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
      isFolder: file.mimeType === "application/vnd.google-apps.folder",
      parentId: file.parents?.[0] || void 0,
      createdTime: file.createdTime || void 0,
      modifiedTime: file.modifiedTime || void 0,
      size: file.size ? parseInt(file.size, 10) : void 0,
      webViewLink: file.webViewLink || void 0,
      thumbnailLink: file.thumbnailLink || void 0
    }));
    return {
      files,
      nextPageToken: response.data.nextPageToken || void 0,
      totalCount: files.length
    };
  }
};
var list_files_non_unified_default = action;
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiZ29vZ2xlL2FjdGlvbnMvbGlzdC1maWxlcy1ub24tdW5pZmllZC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiaW1wb3J0IHsgeiB9IGZyb20gJ3pvZCc7XG5pbXBvcnQgeyBjcmVhdGVBY3Rpb24gfSBmcm9tICduYW5nbyc7XG5jb25zdCBJbnB1dFNjaGVtYSA9IHoub2JqZWN0KHtcbiAgZm9sZGVySWQ6IHouc3RyaW5nKCkub3B0aW9uYWwoKS5kZXNjcmliZSgnRm9sZGVyIElEIHRvIGxpc3QgY29udGVudHMuIE9taXQgZm9yIHJvb3QgZm9sZGVyLicpLFxuICBjdXJzb3I6IHouc3RyaW5nKCkub3B0aW9uYWwoKS5kZXNjcmliZSgnUGFnaW5hdGlvbiBjdXJzb3IgKHBhZ2VUb2tlbikgZnJvbSBwcmV2aW91cyByZXNwb25zZS4gT21pdCBmb3IgZmlyc3QgcGFnZS4nKSxcbiAgbGltaXQ6IHoubnVtYmVyKCkub3B0aW9uYWwoKS5kZXNjcmliZSgnTWF4aW11bSBudW1iZXIgb2YgZmlsZXMgdG8gcmV0dXJuLiBEZWZhdWx0OiAxMDAuJyksXG4gIGluY2x1ZGVTaGFyZWREcml2ZXM6IHouYm9vbGVhbigpLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ0luY2x1ZGUgaXRlbXMgZnJvbSBzaGFyZWQgZHJpdmVzLiBEZWZhdWx0OiBmYWxzZS4nKVxufSk7XG5jb25zdCBGaWxlU2NoZW1hID0gei5vYmplY3Qoe1xuICBpZDogei5zdHJpbmcoKSxcbiAgbmFtZTogei5zdHJpbmcoKSxcbiAgbWltZVR5cGU6IHouc3RyaW5nKCksXG4gIGlzRm9sZGVyOiB6LmJvb2xlYW4oKSxcbiAgcGFyZW50SWQ6IHouc3RyaW5nKCkub3B0aW9uYWwoKSxcbiAgY3JlYXRlZFRpbWU6IHouc3RyaW5nKCkub3B0aW9uYWwoKSxcbiAgbW9kaWZpZWRUaW1lOiB6LnN0cmluZygpLm9wdGlvbmFsKCksXG4gIHNpemU6IHoubnVtYmVyKCkub3B0aW9uYWwoKSxcbiAgd2ViVmlld0xpbms6IHouc3RyaW5nKCkub3B0aW9uYWwoKSxcbiAgdGh1bWJuYWlsTGluazogei5zdHJpbmcoKS5vcHRpb25hbCgpXG59KTtcbmNvbnN0IE91dHB1dFNjaGVtYSA9IHoub2JqZWN0KHtcbiAgZmlsZXM6IHouYXJyYXkoRmlsZVNjaGVtYSksXG4gIG5leHRQYWdlVG9rZW46IHouc3RyaW5nKCkub3B0aW9uYWwoKS5kZXNjcmliZSgnQ3Vyc29yIGZvciBuZXh0IHBhZ2UuIE9taXR0ZWQgaWYgbm8gbW9yZSBwYWdlcy4nKSxcbiAgdG90YWxDb3VudDogei5udW1iZXIoKS5kZXNjcmliZSgnVG90YWwgbnVtYmVyIG9mIGZpbGVzIGluIHRoaXMgcGFnZS4nKVxufSk7XG5jb25zdCBhY3Rpb24gPSB7XG4gIHR5cGU6IFwiYWN0aW9uXCIsXG4gIGRlc2NyaXB0aW9uOiAnTGlzdCBpbW1lZGlhdGUgZmlsZXMgYW5kIGZvbGRlcnMgZm9yIGEgZm9sZGVyIElELCBvciByb290IHdoZW4gb21pdHRlZCwgd2l0aCBjdXJzb3IgcGFnaW5hdGlvbiBhbmQgc2hhcmVkLWRyaXZlIHN1cHBvcnQuJyxcbiAgdmVyc2lvbjogJzEuMC4wJyxcbiAgZW5kcG9pbnQ6IHtcbiAgICBtZXRob2Q6ICdHRVQnLFxuICAgIHBhdGg6ICcvYWN0aW9ucy9saXN0LWZpbGVzLW5vbi11bmlmaWVkJyxcbiAgICBncm91cDogJ0ZpbGVzJ1xuICB9LFxuICBpbnB1dDogSW5wdXRTY2hlbWEsXG4gIG91dHB1dDogT3V0cHV0U2NoZW1hLFxuICBzY29wZXM6IFsnaHR0cHM6Ly93d3cuZ29vZ2xlYXBpcy5jb20vYXV0aC9kcml2ZS5yZWFkb25seSddLFxuICBleGVjOiBhc3luYyAobmFuZ28sIGlucHV0KTogUHJvbWlzZTx6LmluZmVyPHR5cGVvZiBPdXRwdXRTY2hlbWE+PiA9PiB7XG4gICAgLy8gQnVpbGQgcXVlcnkgZm9yIGxpc3RpbmcgZmlsZXMgaW4gdGhlIHNwZWNpZmllZCBmb2xkZXJcbiAgICBjb25zdCBwYXJlbnRJZCA9IGlucHV0LmZvbGRlcklkIHx8ICdyb290JztcbiAgICBjb25zdCBxdWVyeSA9IGAnJHtwYXJlbnRJZH0nIGluIHBhcmVudHMgYW5kIHRyYXNoZWQgPSBmYWxzZWA7XG4gICAgY29uc3QgcGFyYW1zOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmcgfCBudW1iZXI+ID0ge1xuICAgICAgcTogcXVlcnksXG4gICAgICBmaWVsZHM6ICdmaWxlcyhpZCxuYW1lLG1pbWVUeXBlLHBhcmVudHMsY3JlYXRlZFRpbWUsbW9kaWZpZWRUaW1lLHNpemUsd2ViVmlld0xpbmssdGh1bWJuYWlsTGluayksbmV4dFBhZ2VUb2tlbicsXG4gICAgICBwYWdlU2l6ZTogaW5wdXQubGltaXQgfHwgMTAwXG4gICAgfTtcbiAgICBpZiAoaW5wdXQuY3Vyc29yKSB7XG4gICAgICBwYXJhbXNbJ3BhZ2VUb2tlbiddID0gaW5wdXQuY3Vyc29yO1xuICAgIH1cbiAgICBpZiAoaW5wdXQuaW5jbHVkZVNoYXJlZERyaXZlcykge1xuICAgICAgcGFyYW1zWydpbmNsdWRlSXRlbXNGcm9tQWxsRHJpdmVzJ10gPSAndHJ1ZSc7XG4gICAgICBwYXJhbXNbJ3N1cHBvcnRzQWxsRHJpdmVzJ10gPSAndHJ1ZSc7XG4gICAgfVxuXG4gICAgLy8gaHR0cHM6Ly9kZXZlbG9wZXJzLmdvb2dsZS5jb20vd29ya3NwYWNlL2RyaXZlL2FwaS9yZWZlcmVuY2UvcmVzdC92My9maWxlcy9saXN0XG4gICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBuYW5nby5nZXQoe1xuICAgICAgZW5kcG9pbnQ6ICcvZHJpdmUvdjMvZmlsZXMnLFxuICAgICAgcGFyYW1zLFxuICAgICAgcmV0cmllczogM1xuICAgIH0pO1xuICAgIGNvbnN0IGZpbGVzID0gKHJlc3BvbnNlLmRhdGEuZmlsZXMgfHwgW10pLm1hcCgoZmlsZToge1xuICAgICAgaWQ6IHN0cmluZztcbiAgICAgIG5hbWU6IHN0cmluZztcbiAgICAgIG1pbWVUeXBlOiBzdHJpbmc7XG4gICAgICBwYXJlbnRzPzogc3RyaW5nW107XG4gICAgICBjcmVhdGVkVGltZT86IHN0cmluZztcbiAgICAgIG1vZGlmaWVkVGltZT86IHN0cmluZztcbiAgICAgIHNpemU/OiBzdHJpbmc7XG4gICAgICB3ZWJWaWV3TGluaz86IHN0cmluZztcbiAgICAgIHRodW1ibmFpbExpbms/OiBzdHJpbmc7XG4gICAgfSkgPT4gKHtcbiAgICAgIGlkOiBmaWxlLmlkLFxuICAgICAgbmFtZTogZmlsZS5uYW1lLFxuICAgICAgbWltZVR5cGU6IGZpbGUubWltZVR5cGUsXG4gICAgICBpc0ZvbGRlcjogZmlsZS5taW1lVHlwZSA9PT0gJ2FwcGxpY2F0aW9uL3ZuZC5nb29nbGUtYXBwcy5mb2xkZXInLFxuICAgICAgcGFyZW50SWQ6IGZpbGUucGFyZW50cz8uWzBdIHx8IHVuZGVmaW5lZCxcbiAgICAgIGNyZWF0ZWRUaW1lOiBmaWxlLmNyZWF0ZWRUaW1lIHx8IHVuZGVmaW5lZCxcbiAgICAgIG1vZGlmaWVkVGltZTogZmlsZS5tb2RpZmllZFRpbWUgfHwgdW5kZWZpbmVkLFxuICAgICAgc2l6ZTogZmlsZS5zaXplID8gcGFyc2VJbnQoZmlsZS5zaXplLCAxMCkgOiB1bmRlZmluZWQsXG4gICAgICB3ZWJWaWV3TGluazogZmlsZS53ZWJWaWV3TGluayB8fCB1bmRlZmluZWQsXG4gICAgICB0aHVtYm5haWxMaW5rOiBmaWxlLnRodW1ibmFpbExpbmsgfHwgdW5kZWZpbmVkXG4gICAgfSkpO1xuICAgIHJldHVybiB7XG4gICAgICBmaWxlcyxcbiAgICAgIG5leHRQYWdlVG9rZW46IHJlc3BvbnNlLmRhdGEubmV4dFBhZ2VUb2tlbiB8fCB1bmRlZmluZWQsXG4gICAgICB0b3RhbENvdW50OiBmaWxlcy5sZW5ndGhcbiAgICB9O1xuICB9XG59O1xuZXhwb3J0IHR5cGUgTmFuZ29BY3Rpb25Mb2NhbCA9IFBhcmFtZXRlcnM8KHR5cGVvZiBhY3Rpb24pWydleGVjJ10+WzBdO1xuZXhwb3J0IGRlZmF1bHQgYWN0aW9uOyJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7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
