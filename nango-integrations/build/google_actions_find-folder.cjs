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

// google/actions/find-folder.ts
var find_folder_exports = {};
__export(find_folder_exports, {
  default: () => find_folder_default
});
module.exports = __toCommonJS(find_folder_exports);
var import_zod = require("zod");
var InputSchema = import_zod.z.object({
  name: import_zod.z.string().describe('Folder name or search query to find folders by name. Example: "Test Folder Alpha"')
});
var FolderSchema = import_zod.z.object({
  id: import_zod.z.string(),
  name: import_zod.z.string(),
  createdTime: import_zod.z.string().optional()
});
var OutputSchema = import_zod.z.object({
  folders: import_zod.z.array(FolderSchema),
  totalCount: import_zod.z.number()
});
var action = {
  type: "action",
  description: "Search for a folder by name or query",
  version: "1.0.0",
  endpoint: {
    method: "POST",
    path: "/actions/find-folder",
    group: "Folders"
  },
  input: InputSchema,
  output: OutputSchema,
  scopes: ["https://www.googleapis.com/auth/drive.readonly"],
  exec: async (nango, input) => {
    const response = await nango.get({
      endpoint: "/drive/v3/files",
      params: {
        q: `mimeType='application/vnd.google-apps.folder' and name contains '${input.name}' and trashed=false`,
        fields: "files(id,name,createdTime)",
        spaces: "drive",
        pageSize: 100
      },
      retries: 3
    });
    const files = response.data?.files || [];
    const folders = files.map((file) => ({
      id: file.id,
      name: file.name,
      createdTime: file.createdTime ?? void 0
    }));
    return {
      folders,
      totalCount: folders.length
    };
  }
};
var find_folder_default = action;
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiZ29vZ2xlL2FjdGlvbnMvZmluZC1mb2xkZXIudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImltcG9ydCB7IHogfSBmcm9tICd6b2QnO1xuaW1wb3J0IHsgY3JlYXRlQWN0aW9uIH0gZnJvbSAnbmFuZ28nO1xuY29uc3QgSW5wdXRTY2hlbWEgPSB6Lm9iamVjdCh7XG4gIG5hbWU6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ0ZvbGRlciBuYW1lIG9yIHNlYXJjaCBxdWVyeSB0byBmaW5kIGZvbGRlcnMgYnkgbmFtZS4gRXhhbXBsZTogXCJUZXN0IEZvbGRlciBBbHBoYVwiJylcbn0pO1xuY29uc3QgRm9sZGVyU2NoZW1hID0gei5vYmplY3Qoe1xuICBpZDogei5zdHJpbmcoKSxcbiAgbmFtZTogei5zdHJpbmcoKSxcbiAgY3JlYXRlZFRpbWU6IHouc3RyaW5nKCkub3B0aW9uYWwoKVxufSk7XG5jb25zdCBPdXRwdXRTY2hlbWEgPSB6Lm9iamVjdCh7XG4gIGZvbGRlcnM6IHouYXJyYXkoRm9sZGVyU2NoZW1hKSxcbiAgdG90YWxDb3VudDogei5udW1iZXIoKVxufSk7XG5jb25zdCBhY3Rpb24gPSB7XG4gIHR5cGU6IFwiYWN0aW9uXCIsXG4gIGRlc2NyaXB0aW9uOiAnU2VhcmNoIGZvciBhIGZvbGRlciBieSBuYW1lIG9yIHF1ZXJ5JyxcbiAgdmVyc2lvbjogJzEuMC4wJyxcbiAgZW5kcG9pbnQ6IHtcbiAgICBtZXRob2Q6ICdQT1NUJyxcbiAgICBwYXRoOiAnL2FjdGlvbnMvZmluZC1mb2xkZXInLFxuICAgIGdyb3VwOiAnRm9sZGVycydcbiAgfSxcbiAgaW5wdXQ6IElucHV0U2NoZW1hLFxuICBvdXRwdXQ6IE91dHB1dFNjaGVtYSxcbiAgc2NvcGVzOiBbJ2h0dHBzOi8vd3d3Lmdvb2dsZWFwaXMuY29tL2F1dGgvZHJpdmUucmVhZG9ubHknXSxcbiAgZXhlYzogYXN5bmMgKG5hbmdvLCBpbnB1dCk6IFByb21pc2U8ei5pbmZlcjx0eXBlb2YgT3V0cHV0U2NoZW1hPj4gPT4ge1xuICAgIC8vIGh0dHBzOi8vZGV2ZWxvcGVycy5nb29nbGUuY29tL2RyaXZlL2FwaS9yZWZlcmVuY2UvcmVzdC92My9maWxlcy9saXN0XG4gICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBuYW5nby5nZXQoe1xuICAgICAgZW5kcG9pbnQ6ICcvZHJpdmUvdjMvZmlsZXMnLFxuICAgICAgcGFyYW1zOiB7XG4gICAgICAgIHE6IGBtaW1lVHlwZT0nYXBwbGljYXRpb24vdm5kLmdvb2dsZS1hcHBzLmZvbGRlcicgYW5kIG5hbWUgY29udGFpbnMgJyR7aW5wdXQubmFtZX0nIGFuZCB0cmFzaGVkPWZhbHNlYCxcbiAgICAgICAgZmllbGRzOiAnZmlsZXMoaWQsbmFtZSxjcmVhdGVkVGltZSknLFxuICAgICAgICBzcGFjZXM6ICdkcml2ZScsXG4gICAgICAgIHBhZ2VTaXplOiAxMDBcbiAgICAgIH0sXG4gICAgICByZXRyaWVzOiAzXG4gICAgfSk7XG4gICAgY29uc3QgZmlsZXMgPSByZXNwb25zZS5kYXRhPy5maWxlcyB8fCBbXTtcbiAgICBjb25zdCBmb2xkZXJzID0gZmlsZXMubWFwKChmaWxlOiB7XG4gICAgICBpZDogc3RyaW5nO1xuICAgICAgbmFtZTogc3RyaW5nO1xuICAgICAgY3JlYXRlZFRpbWU/OiBzdHJpbmc7XG4gICAgfSkgPT4gKHtcbiAgICAgIGlkOiBmaWxlLmlkLFxuICAgICAgbmFtZTogZmlsZS5uYW1lLFxuICAgICAgY3JlYXRlZFRpbWU6IGZpbGUuY3JlYXRlZFRpbWUgPz8gdW5kZWZpbmVkXG4gICAgfSkpO1xuICAgIHJldHVybiB7XG4gICAgICBmb2xkZXJzLFxuICAgICAgdG90YWxDb3VudDogZm9sZGVycy5sZW5ndGhcbiAgICB9O1xuICB9XG59O1xuZXhwb3J0IHR5cGUgTmFuZ29BY3Rpb25Mb2NhbCA9IFBhcmFtZXRlcnM8KHR5cGVvZiBhY3Rpb24pWydleGVjJ10+WzBdO1xuZXhwb3J0IGRlZmF1bHQgYWN0aW9uOyJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLGlCQUFrQjtBQUVsQixJQUFNLGNBQWMsYUFBRSxPQUFPO0FBQUEsRUFDM0IsTUFBTSxhQUFFLE9BQU8sRUFBRSxTQUFTLG1GQUFtRjtBQUMvRyxDQUFDO0FBQ0QsSUFBTSxlQUFlLGFBQUUsT0FBTztBQUFBLEVBQzVCLElBQUksYUFBRSxPQUFPO0FBQUEsRUFDYixNQUFNLGFBQUUsT0FBTztBQUFBLEVBQ2YsYUFBYSxhQUFFLE9BQU8sRUFBRSxTQUFTO0FBQ25DLENBQUM7QUFDRCxJQUFNLGVBQWUsYUFBRSxPQUFPO0FBQUEsRUFDNUIsU0FBUyxhQUFFLE1BQU0sWUFBWTtBQUFBLEVBQzdCLFlBQVksYUFBRSxPQUFPO0FBQ3ZCLENBQUM7QUFDRCxJQUFNLFNBQVM7QUFBQSxFQUNiLE1BQU07QUFBQSxFQUNOLGFBQWE7QUFBQSxFQUNiLFNBQVM7QUFBQSxFQUNULFVBQVU7QUFBQSxJQUNSLFFBQVE7QUFBQSxJQUNSLE1BQU07QUFBQSxJQUNOLE9BQU87QUFBQSxFQUNUO0FBQUEsRUFDQSxPQUFPO0FBQUEsRUFDUCxRQUFRO0FBQUEsRUFDUixRQUFRLENBQUMsZ0RBQWdEO0FBQUEsRUFDekQsTUFBTSxPQUFPLE9BQU8sVUFBaUQ7QUFFbkUsVUFBTSxXQUFXLE1BQU0sTUFBTSxJQUFJO0FBQUEsTUFDL0IsVUFBVTtBQUFBLE1BQ1YsUUFBUTtBQUFBLFFBQ04sR0FBRyxvRUFBb0UsTUFBTSxJQUFJO0FBQUEsUUFDakYsUUFBUTtBQUFBLFFBQ1IsUUFBUTtBQUFBLFFBQ1IsVUFBVTtBQUFBLE1BQ1o7QUFBQSxNQUNBLFNBQVM7QUFBQSxJQUNYLENBQUM7QUFDRCxVQUFNLFFBQVEsU0FBUyxNQUFNLFNBQVMsQ0FBQztBQUN2QyxVQUFNLFVBQVUsTUFBTSxJQUFJLENBQUMsVUFJcEI7QUFBQSxNQUNMLElBQUksS0FBSztBQUFBLE1BQ1QsTUFBTSxLQUFLO0FBQUEsTUFDWCxhQUFhLEtBQUssZUFBZTtBQUFBLElBQ25DLEVBQUU7QUFDRixXQUFPO0FBQUEsTUFDTDtBQUFBLE1BQ0EsWUFBWSxRQUFRO0FBQUEsSUFDdEI7QUFBQSxFQUNGO0FBQ0Y7QUFFQSxJQUFPLHNCQUFROyIsCiAgIm5hbWVzIjogW10KfQo=
