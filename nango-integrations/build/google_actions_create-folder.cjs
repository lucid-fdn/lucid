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

// google/actions/create-folder.ts
var create_folder_exports = {};
__export(create_folder_exports, {
  default: () => create_folder_default
});
module.exports = __toCommonJS(create_folder_exports);
var import_zod = require("zod");
var CreateFolderResponseSchema = import_zod.z.object({
  id: import_zod.z.string(),
  name: import_zod.z.string(),
  mimeType: import_zod.z.string(),
  createdTime: import_zod.z.string(),
  parents: import_zod.z.array(import_zod.z.string()).optional()
});
var InputSchema = import_zod.z.object({
  name: import_zod.z.string().describe('The name of the new folder. Example: "My New Folder"'),
  parentId: import_zod.z.string().optional().describe('The ID of the parent folder where the new folder will be created. If omitted, the folder is created in the root of the drive. Example: "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms"')
});
var OutputSchema = import_zod.z.object({
  id: import_zod.z.string().describe("The unique identifier of the created folder."),
  name: import_zod.z.string().describe("The name of the created folder."),
  mimeType: import_zod.z.string().describe("The MIME type of the folder (always application/vnd.google-apps.folder)."),
  createdTime: import_zod.z.string().describe("The timestamp when the folder was created."),
  parentIds: import_zod.z.array(import_zod.z.string()).describe("Array of parent folder IDs.")
});
var action = {
  type: "action",
  description: "Create a new folder in Google Drive",
  version: "1.0.0",
  endpoint: {
    method: "POST",
    path: "/actions/create-folder",
    group: "Drive"
  },
  input: InputSchema,
  output: OutputSchema,
  scopes: ["https://www.googleapis.com/auth/drive.file"],
  exec: async (nango, input) => {
    const requestBody = {
      name: input.name,
      mimeType: "application/vnd.google-apps.folder"
    };
    if (input.parentId) {
      requestBody["parents"] = [input.parentId];
    }
    const response = await nango.post({
      endpoint: "/drive/v3/files",
      params: {
        fields: "id,name,mimeType,createdTime,parents"
      },
      data: requestBody,
      retries: 3
    });
    const file = CreateFolderResponseSchema.parse(response.data);
    return {
      id: file.id,
      name: file.name,
      mimeType: file.mimeType,
      createdTime: file.createdTime,
      parentIds: file.parents || []
    };
  }
};
var create_folder_default = action;
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiZ29vZ2xlL2FjdGlvbnMvY3JlYXRlLWZvbGRlci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiaW1wb3J0IHsgeiB9IGZyb20gJ3pvZCc7XG5pbXBvcnQgeyBjcmVhdGVBY3Rpb24gfSBmcm9tICduYW5nbyc7XG5jb25zdCBDcmVhdGVGb2xkZXJSZXNwb25zZVNjaGVtYSA9IHoub2JqZWN0KHtcbiAgaWQ6IHouc3RyaW5nKCksXG4gIG5hbWU6IHouc3RyaW5nKCksXG4gIG1pbWVUeXBlOiB6LnN0cmluZygpLFxuICBjcmVhdGVkVGltZTogei5zdHJpbmcoKSxcbiAgcGFyZW50czogei5hcnJheSh6LnN0cmluZygpKS5vcHRpb25hbCgpXG59KTtcbmNvbnN0IElucHV0U2NoZW1hID0gei5vYmplY3Qoe1xuICBuYW1lOiB6LnN0cmluZygpLmRlc2NyaWJlKCdUaGUgbmFtZSBvZiB0aGUgbmV3IGZvbGRlci4gRXhhbXBsZTogXCJNeSBOZXcgRm9sZGVyXCInKSxcbiAgcGFyZW50SWQ6IHouc3RyaW5nKCkub3B0aW9uYWwoKS5kZXNjcmliZSgnVGhlIElEIG9mIHRoZSBwYXJlbnQgZm9sZGVyIHdoZXJlIHRoZSBuZXcgZm9sZGVyIHdpbGwgYmUgY3JlYXRlZC4gSWYgb21pdHRlZCwgdGhlIGZvbGRlciBpcyBjcmVhdGVkIGluIHRoZSByb290IG9mIHRoZSBkcml2ZS4gRXhhbXBsZTogXCIxQnhpTVZzMFhSQTVuRk1kS3ZCZEJaamdtVVVxcHRsYnM3NE9ndkUydXBtc1wiJylcbn0pO1xuY29uc3QgT3V0cHV0U2NoZW1hID0gei5vYmplY3Qoe1xuICBpZDogei5zdHJpbmcoKS5kZXNjcmliZSgnVGhlIHVuaXF1ZSBpZGVudGlmaWVyIG9mIHRoZSBjcmVhdGVkIGZvbGRlci4nKSxcbiAgbmFtZTogei5zdHJpbmcoKS5kZXNjcmliZSgnVGhlIG5hbWUgb2YgdGhlIGNyZWF0ZWQgZm9sZGVyLicpLFxuICBtaW1lVHlwZTogei5zdHJpbmcoKS5kZXNjcmliZSgnVGhlIE1JTUUgdHlwZSBvZiB0aGUgZm9sZGVyIChhbHdheXMgYXBwbGljYXRpb24vdm5kLmdvb2dsZS1hcHBzLmZvbGRlcikuJyksXG4gIGNyZWF0ZWRUaW1lOiB6LnN0cmluZygpLmRlc2NyaWJlKCdUaGUgdGltZXN0YW1wIHdoZW4gdGhlIGZvbGRlciB3YXMgY3JlYXRlZC4nKSxcbiAgcGFyZW50SWRzOiB6LmFycmF5KHouc3RyaW5nKCkpLmRlc2NyaWJlKCdBcnJheSBvZiBwYXJlbnQgZm9sZGVyIElEcy4nKVxufSk7XG5jb25zdCBhY3Rpb24gPSB7XG4gIHR5cGU6IFwiYWN0aW9uXCIsXG4gIGRlc2NyaXB0aW9uOiAnQ3JlYXRlIGEgbmV3IGZvbGRlciBpbiBHb29nbGUgRHJpdmUnLFxuICB2ZXJzaW9uOiAnMS4wLjAnLFxuICBlbmRwb2ludDoge1xuICAgIG1ldGhvZDogJ1BPU1QnLFxuICAgIHBhdGg6ICcvYWN0aW9ucy9jcmVhdGUtZm9sZGVyJyxcbiAgICBncm91cDogJ0RyaXZlJ1xuICB9LFxuICBpbnB1dDogSW5wdXRTY2hlbWEsXG4gIG91dHB1dDogT3V0cHV0U2NoZW1hLFxuICBzY29wZXM6IFsnaHR0cHM6Ly93d3cuZ29vZ2xlYXBpcy5jb20vYXV0aC9kcml2ZS5maWxlJ10sXG4gIGV4ZWM6IGFzeW5jIChuYW5nbywgaW5wdXQpOiBQcm9taXNlPHouaW5mZXI8dHlwZW9mIE91dHB1dFNjaGVtYT4+ID0+IHtcbiAgICAvLyBodHRwczovL2RldmVsb3BlcnMuZ29vZ2xlLmNvbS93b3Jrc3BhY2UvZHJpdmUvYXBpL3JlZmVyZW5jZS9yZXN0L3YzL2ZpbGVzL2NyZWF0ZVxuICAgIGNvbnN0IHJlcXVlc3RCb2R5OiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiA9IHtcbiAgICAgIG5hbWU6IGlucHV0Lm5hbWUsXG4gICAgICBtaW1lVHlwZTogJ2FwcGxpY2F0aW9uL3ZuZC5nb29nbGUtYXBwcy5mb2xkZXInXG4gICAgfTtcbiAgICBpZiAoaW5wdXQucGFyZW50SWQpIHtcbiAgICAgIHJlcXVlc3RCb2R5WydwYXJlbnRzJ10gPSBbaW5wdXQucGFyZW50SWRdO1xuICAgIH1cbiAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IG5hbmdvLnBvc3Qoe1xuICAgICAgZW5kcG9pbnQ6ICcvZHJpdmUvdjMvZmlsZXMnLFxuICAgICAgcGFyYW1zOiB7XG4gICAgICAgIGZpZWxkczogJ2lkLG5hbWUsbWltZVR5cGUsY3JlYXRlZFRpbWUscGFyZW50cydcbiAgICAgIH0sXG4gICAgICBkYXRhOiByZXF1ZXN0Qm9keSxcbiAgICAgIHJldHJpZXM6IDNcbiAgICB9KTtcbiAgICBjb25zdCBmaWxlID0gQ3JlYXRlRm9sZGVyUmVzcG9uc2VTY2hlbWEucGFyc2UocmVzcG9uc2UuZGF0YSk7XG4gICAgcmV0dXJuIHtcbiAgICAgIGlkOiBmaWxlLmlkLFxuICAgICAgbmFtZTogZmlsZS5uYW1lLFxuICAgICAgbWltZVR5cGU6IGZpbGUubWltZVR5cGUsXG4gICAgICBjcmVhdGVkVGltZTogZmlsZS5jcmVhdGVkVGltZSxcbiAgICAgIHBhcmVudElkczogZmlsZS5wYXJlbnRzIHx8IFtdXG4gICAgfTtcbiAgfVxufTtcbmV4cG9ydCB0eXBlIE5hbmdvQWN0aW9uTG9jYWwgPSBQYXJhbWV0ZXJzPCh0eXBlb2YgYWN0aW9uKVsnZXhlYyddPlswXTtcbmV4cG9ydCBkZWZhdWx0IGFjdGlvbjsiXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxpQkFBa0I7QUFFbEIsSUFBTSw2QkFBNkIsYUFBRSxPQUFPO0FBQUEsRUFDMUMsSUFBSSxhQUFFLE9BQU87QUFBQSxFQUNiLE1BQU0sYUFBRSxPQUFPO0FBQUEsRUFDZixVQUFVLGFBQUUsT0FBTztBQUFBLEVBQ25CLGFBQWEsYUFBRSxPQUFPO0FBQUEsRUFDdEIsU0FBUyxhQUFFLE1BQU0sYUFBRSxPQUFPLENBQUMsRUFBRSxTQUFTO0FBQ3hDLENBQUM7QUFDRCxJQUFNLGNBQWMsYUFBRSxPQUFPO0FBQUEsRUFDM0IsTUFBTSxhQUFFLE9BQU8sRUFBRSxTQUFTLHNEQUFzRDtBQUFBLEVBQ2hGLFVBQVUsYUFBRSxPQUFPLEVBQUUsU0FBUyxFQUFFLFNBQVMsdUxBQXVMO0FBQ2xPLENBQUM7QUFDRCxJQUFNLGVBQWUsYUFBRSxPQUFPO0FBQUEsRUFDNUIsSUFBSSxhQUFFLE9BQU8sRUFBRSxTQUFTLDhDQUE4QztBQUFBLEVBQ3RFLE1BQU0sYUFBRSxPQUFPLEVBQUUsU0FBUyxpQ0FBaUM7QUFBQSxFQUMzRCxVQUFVLGFBQUUsT0FBTyxFQUFFLFNBQVMsMEVBQTBFO0FBQUEsRUFDeEcsYUFBYSxhQUFFLE9BQU8sRUFBRSxTQUFTLDRDQUE0QztBQUFBLEVBQzdFLFdBQVcsYUFBRSxNQUFNLGFBQUUsT0FBTyxDQUFDLEVBQUUsU0FBUyw2QkFBNkI7QUFDdkUsQ0FBQztBQUNELElBQU0sU0FBUztBQUFBLEVBQ2IsTUFBTTtBQUFBLEVBQ04sYUFBYTtBQUFBLEVBQ2IsU0FBUztBQUFBLEVBQ1QsVUFBVTtBQUFBLElBQ1IsUUFBUTtBQUFBLElBQ1IsTUFBTTtBQUFBLElBQ04sT0FBTztBQUFBLEVBQ1Q7QUFBQSxFQUNBLE9BQU87QUFBQSxFQUNQLFFBQVE7QUFBQSxFQUNSLFFBQVEsQ0FBQyw0Q0FBNEM7QUFBQSxFQUNyRCxNQUFNLE9BQU8sT0FBTyxVQUFpRDtBQUVuRSxVQUFNLGNBQXVDO0FBQUEsTUFDM0MsTUFBTSxNQUFNO0FBQUEsTUFDWixVQUFVO0FBQUEsSUFDWjtBQUNBLFFBQUksTUFBTSxVQUFVO0FBQ2xCLGtCQUFZLFNBQVMsSUFBSSxDQUFDLE1BQU0sUUFBUTtBQUFBLElBQzFDO0FBQ0EsVUFBTSxXQUFXLE1BQU0sTUFBTSxLQUFLO0FBQUEsTUFDaEMsVUFBVTtBQUFBLE1BQ1YsUUFBUTtBQUFBLFFBQ04sUUFBUTtBQUFBLE1BQ1Y7QUFBQSxNQUNBLE1BQU07QUFBQSxNQUNOLFNBQVM7QUFBQSxJQUNYLENBQUM7QUFDRCxVQUFNLE9BQU8sMkJBQTJCLE1BQU0sU0FBUyxJQUFJO0FBQzNELFdBQU87QUFBQSxNQUNMLElBQUksS0FBSztBQUFBLE1BQ1QsTUFBTSxLQUFLO0FBQUEsTUFDWCxVQUFVLEtBQUs7QUFBQSxNQUNmLGFBQWEsS0FBSztBQUFBLE1BQ2xCLFdBQVcsS0FBSyxXQUFXLENBQUM7QUFBQSxJQUM5QjtBQUFBLEVBQ0Y7QUFDRjtBQUVBLElBQU8sd0JBQVE7IiwKICAibmFtZXMiOiBbXQp9Cg==
