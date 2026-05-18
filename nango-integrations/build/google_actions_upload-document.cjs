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

// google/actions/upload-document.ts
var upload_document_exports = {};
__export(upload_document_exports, {
  default: () => upload_document_default
});
module.exports = __toCommonJS(upload_document_exports);
var import_zod = require("zod");
var InputSchema = import_zod.z.object({
  name: import_zod.z.string().describe('The name of the file to create. Example: "document.txt"'),
  content: import_zod.z.string().describe("The file content as plain text or base64 encoded string"),
  mimeType: import_zod.z.string().describe('The MIME type of the file. Example: "text/plain", "application/pdf"'),
  isBase64: import_zod.z.boolean().optional().describe("Whether the content is base64 encoded. Defaults to false"),
  folderId: import_zod.z.string().optional().describe('The ID of the folder to upload the file into. If not provided, defaults to root. Example: "1a2b3c4d5e6f7g8h"'),
  description: import_zod.z.string().optional().describe("A description of the file")
});
var OutputSchema = import_zod.z.object({
  id: import_zod.z.string().describe("The ID of the created file"),
  name: import_zod.z.string().describe("The name of the created file"),
  mimeType: import_zod.z.string().describe("The MIME type of the file"),
  webViewLink: import_zod.z.string().optional().describe("A link for opening the file in a relevant Google editor or viewer"),
  webContentLink: import_zod.z.string().optional().describe("A link for downloading the content of the file in a browser")
});
var action = {
  type: "action",
  description: "Upload plain text or base64 file content up to 5 MB, optionally into a folder with a description; defaults to root",
  version: "1.0.0",
  endpoint: {
    method: "POST",
    path: "/actions/upload-document",
    group: "Files"
  },
  input: InputSchema,
  output: OutputSchema,
  scopes: ["https://www.googleapis.com/auth/drive.file"],
  exec: async (nango, input) => {
    let fileContent;
    if (input.isBase64) {
      fileContent = Buffer.from(input.content, "base64").toString("binary");
    } else {
      fileContent = input.content;
    }
    const metadataBody = {
      name: input.name,
      mimeType: input.mimeType
    };
    if (input.description) {
      metadataBody["description"] = input.description;
    }
    if (input.folderId) {
      metadataBody["parents"] = [input.folderId];
    }
    const createResponse = await nango.post({
      endpoint: "/drive/v3/files",
      params: {
        fields: "id,name,mimeType,webViewLink,webContentLink"
      },
      data: metadataBody,
      retries: 3
    });
    if (!createResponse.data || !createResponse.data.id) {
      throw new nango.ActionError({
        type: "create_failed",
        message: "Failed to create file metadata in Google Drive"
      });
    }
    const fileId = createResponse.data.id;
    const contentResponse = await nango.patch({
      endpoint: `/upload/drive/v3/files/${fileId}`,
      params: {
        uploadType: "media",
        fields: "id,name,mimeType,webViewLink,webContentLink"
      },
      headers: {
        "Content-Type": input.mimeType
      },
      data: fileContent,
      retries: 3
    });
    if (!contentResponse.data) {
      throw new nango.ActionError({
        type: "upload_failed",
        message: "Failed to upload file content to Google Drive"
      });
    }
    const file = contentResponse.data;
    return {
      id: file.id,
      name: file.name,
      mimeType: file.mimeType,
      webViewLink: file.webViewLink ?? void 0,
      webContentLink: file.webContentLink ?? void 0
    };
  }
};
var upload_document_default = action;
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiZ29vZ2xlL2FjdGlvbnMvdXBsb2FkLWRvY3VtZW50LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyJpbXBvcnQgeyB6IH0gZnJvbSAnem9kJztcbmltcG9ydCB7IGNyZWF0ZUFjdGlvbiB9IGZyb20gJ25hbmdvJztcbmNvbnN0IElucHV0U2NoZW1hID0gei5vYmplY3Qoe1xuICBuYW1lOiB6LnN0cmluZygpLmRlc2NyaWJlKCdUaGUgbmFtZSBvZiB0aGUgZmlsZSB0byBjcmVhdGUuIEV4YW1wbGU6IFwiZG9jdW1lbnQudHh0XCInKSxcbiAgY29udGVudDogei5zdHJpbmcoKS5kZXNjcmliZSgnVGhlIGZpbGUgY29udGVudCBhcyBwbGFpbiB0ZXh0IG9yIGJhc2U2NCBlbmNvZGVkIHN0cmluZycpLFxuICBtaW1lVHlwZTogei5zdHJpbmcoKS5kZXNjcmliZSgnVGhlIE1JTUUgdHlwZSBvZiB0aGUgZmlsZS4gRXhhbXBsZTogXCJ0ZXh0L3BsYWluXCIsIFwiYXBwbGljYXRpb24vcGRmXCInKSxcbiAgaXNCYXNlNjQ6IHouYm9vbGVhbigpLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ1doZXRoZXIgdGhlIGNvbnRlbnQgaXMgYmFzZTY0IGVuY29kZWQuIERlZmF1bHRzIHRvIGZhbHNlJyksXG4gIGZvbGRlcklkOiB6LnN0cmluZygpLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ1RoZSBJRCBvZiB0aGUgZm9sZGVyIHRvIHVwbG9hZCB0aGUgZmlsZSBpbnRvLiBJZiBub3QgcHJvdmlkZWQsIGRlZmF1bHRzIHRvIHJvb3QuIEV4YW1wbGU6IFwiMWEyYjNjNGQ1ZTZmN2c4aFwiJyksXG4gIGRlc2NyaXB0aW9uOiB6LnN0cmluZygpLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ0EgZGVzY3JpcHRpb24gb2YgdGhlIGZpbGUnKVxufSk7XG5jb25zdCBPdXRwdXRTY2hlbWEgPSB6Lm9iamVjdCh7XG4gIGlkOiB6LnN0cmluZygpLmRlc2NyaWJlKCdUaGUgSUQgb2YgdGhlIGNyZWF0ZWQgZmlsZScpLFxuICBuYW1lOiB6LnN0cmluZygpLmRlc2NyaWJlKCdUaGUgbmFtZSBvZiB0aGUgY3JlYXRlZCBmaWxlJyksXG4gIG1pbWVUeXBlOiB6LnN0cmluZygpLmRlc2NyaWJlKCdUaGUgTUlNRSB0eXBlIG9mIHRoZSBmaWxlJyksXG4gIHdlYlZpZXdMaW5rOiB6LnN0cmluZygpLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ0EgbGluayBmb3Igb3BlbmluZyB0aGUgZmlsZSBpbiBhIHJlbGV2YW50IEdvb2dsZSBlZGl0b3Igb3Igdmlld2VyJyksXG4gIHdlYkNvbnRlbnRMaW5rOiB6LnN0cmluZygpLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ0EgbGluayBmb3IgZG93bmxvYWRpbmcgdGhlIGNvbnRlbnQgb2YgdGhlIGZpbGUgaW4gYSBicm93c2VyJylcbn0pO1xuY29uc3QgYWN0aW9uID0ge1xuICB0eXBlOiBcImFjdGlvblwiLFxuICBkZXNjcmlwdGlvbjogJ1VwbG9hZCBwbGFpbiB0ZXh0IG9yIGJhc2U2NCBmaWxlIGNvbnRlbnQgdXAgdG8gNSBNQiwgb3B0aW9uYWxseSBpbnRvIGEgZm9sZGVyIHdpdGggYSBkZXNjcmlwdGlvbjsgZGVmYXVsdHMgdG8gcm9vdCcsXG4gIHZlcnNpb246ICcxLjAuMCcsXG4gIGVuZHBvaW50OiB7XG4gICAgbWV0aG9kOiAnUE9TVCcsXG4gICAgcGF0aDogJy9hY3Rpb25zL3VwbG9hZC1kb2N1bWVudCcsXG4gICAgZ3JvdXA6ICdGaWxlcydcbiAgfSxcbiAgaW5wdXQ6IElucHV0U2NoZW1hLFxuICBvdXRwdXQ6IE91dHB1dFNjaGVtYSxcbiAgc2NvcGVzOiBbJ2h0dHBzOi8vd3d3Lmdvb2dsZWFwaXMuY29tL2F1dGgvZHJpdmUuZmlsZSddLFxuICBleGVjOiBhc3luYyAobmFuZ28sIGlucHV0KTogUHJvbWlzZTx6LmluZmVyPHR5cGVvZiBPdXRwdXRTY2hlbWE+PiA9PiB7XG4gICAgLy8gRGVjb2RlIGJhc2U2NCBjb250ZW50IGlmIG5lZWRlZFxuICAgIGxldCBmaWxlQ29udGVudDogc3RyaW5nO1xuICAgIGlmIChpbnB1dC5pc0Jhc2U2NCkge1xuICAgICAgZmlsZUNvbnRlbnQgPSBCdWZmZXIuZnJvbShpbnB1dC5jb250ZW50LCAnYmFzZTY0JykudG9TdHJpbmcoJ2JpbmFyeScpO1xuICAgIH0gZWxzZSB7XG4gICAgICBmaWxlQ29udGVudCA9IGlucHV0LmNvbnRlbnQ7XG4gICAgfVxuXG4gICAgLy8gU3RlcCAxOiBDcmVhdGUgZmlsZSBtZXRhZGF0YVxuICAgIC8vIGh0dHBzOi8vZGV2ZWxvcGVycy5nb29nbGUuY29tL3dvcmtzcGFjZS9kcml2ZS9hcGkvcmVmZXJlbmNlL3Jlc3QvdjMvZmlsZXMvY3JlYXRlXG4gICAgY29uc3QgbWV0YWRhdGFCb2R5OiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiA9IHtcbiAgICAgIG5hbWU6IGlucHV0Lm5hbWUsXG4gICAgICBtaW1lVHlwZTogaW5wdXQubWltZVR5cGVcbiAgICB9O1xuICAgIGlmIChpbnB1dC5kZXNjcmlwdGlvbikge1xuICAgICAgbWV0YWRhdGFCb2R5WydkZXNjcmlwdGlvbiddID0gaW5wdXQuZGVzY3JpcHRpb247XG4gICAgfVxuICAgIGlmIChpbnB1dC5mb2xkZXJJZCkge1xuICAgICAgbWV0YWRhdGFCb2R5WydwYXJlbnRzJ10gPSBbaW5wdXQuZm9sZGVySWRdO1xuICAgIH1cbiAgICBjb25zdCBjcmVhdGVSZXNwb25zZSA9IGF3YWl0IG5hbmdvLnBvc3Qoe1xuICAgICAgZW5kcG9pbnQ6ICcvZHJpdmUvdjMvZmlsZXMnLFxuICAgICAgcGFyYW1zOiB7XG4gICAgICAgIGZpZWxkczogJ2lkLG5hbWUsbWltZVR5cGUsd2ViVmlld0xpbmssd2ViQ29udGVudExpbmsnXG4gICAgICB9LFxuICAgICAgZGF0YTogbWV0YWRhdGFCb2R5LFxuICAgICAgcmV0cmllczogM1xuICAgIH0pO1xuICAgIGlmICghY3JlYXRlUmVzcG9uc2UuZGF0YSB8fCAhY3JlYXRlUmVzcG9uc2UuZGF0YS5pZCkge1xuICAgICAgdGhyb3cgbmV3IG5hbmdvLkFjdGlvbkVycm9yKHtcbiAgICAgICAgdHlwZTogJ2NyZWF0ZV9mYWlsZWQnLFxuICAgICAgICBtZXNzYWdlOiAnRmFpbGVkIHRvIGNyZWF0ZSBmaWxlIG1ldGFkYXRhIGluIEdvb2dsZSBEcml2ZSdcbiAgICAgIH0pO1xuICAgIH1cbiAgICBjb25zdCBmaWxlSWQgPSBjcmVhdGVSZXNwb25zZS5kYXRhLmlkO1xuXG4gICAgLy8gU3RlcCAyOiBVcGxvYWQgY29udGVudCB1c2luZyBtZWRpYSB1cGxvYWRcbiAgICAvLyBodHRwczovL2RldmVsb3BlcnMuZ29vZ2xlLmNvbS93b3Jrc3BhY2UvZHJpdmUvYXBpL3JlZmVyZW5jZS9yZXN0L3YzL2ZpbGVzL3VwZGF0ZVxuICAgIGNvbnN0IGNvbnRlbnRSZXNwb25zZSA9IGF3YWl0IG5hbmdvLnBhdGNoKHtcbiAgICAgIGVuZHBvaW50OiBgL3VwbG9hZC9kcml2ZS92My9maWxlcy8ke2ZpbGVJZH1gLFxuICAgICAgcGFyYW1zOiB7XG4gICAgICAgIHVwbG9hZFR5cGU6ICdtZWRpYScsXG4gICAgICAgIGZpZWxkczogJ2lkLG5hbWUsbWltZVR5cGUsd2ViVmlld0xpbmssd2ViQ29udGVudExpbmsnXG4gICAgICB9LFxuICAgICAgaGVhZGVyczoge1xuICAgICAgICAnQ29udGVudC1UeXBlJzogaW5wdXQubWltZVR5cGVcbiAgICAgIH0sXG4gICAgICBkYXRhOiBmaWxlQ29udGVudCxcbiAgICAgIHJldHJpZXM6IDNcbiAgICB9KTtcbiAgICBpZiAoIWNvbnRlbnRSZXNwb25zZS5kYXRhKSB7XG4gICAgICB0aHJvdyBuZXcgbmFuZ28uQWN0aW9uRXJyb3Ioe1xuICAgICAgICB0eXBlOiAndXBsb2FkX2ZhaWxlZCcsXG4gICAgICAgIG1lc3NhZ2U6ICdGYWlsZWQgdG8gdXBsb2FkIGZpbGUgY29udGVudCB0byBHb29nbGUgRHJpdmUnXG4gICAgICB9KTtcbiAgICB9XG4gICAgY29uc3QgZmlsZSA9IGNvbnRlbnRSZXNwb25zZS5kYXRhO1xuICAgIHJldHVybiB7XG4gICAgICBpZDogZmlsZS5pZCxcbiAgICAgIG5hbWU6IGZpbGUubmFtZSxcbiAgICAgIG1pbWVUeXBlOiBmaWxlLm1pbWVUeXBlLFxuICAgICAgd2ViVmlld0xpbms6IGZpbGUud2ViVmlld0xpbmsgPz8gdW5kZWZpbmVkLFxuICAgICAgd2ViQ29udGVudExpbms6IGZpbGUud2ViQ29udGVudExpbmsgPz8gdW5kZWZpbmVkXG4gICAgfTtcbiAgfVxufTtcbmV4cG9ydCB0eXBlIE5hbmdvQWN0aW9uTG9jYWwgPSBQYXJhbWV0ZXJzPCh0eXBlb2YgYWN0aW9uKVsnZXhlYyddPlswXTtcbmV4cG9ydCBkZWZhdWx0IGFjdGlvbjsiXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxpQkFBa0I7QUFFbEIsSUFBTSxjQUFjLGFBQUUsT0FBTztBQUFBLEVBQzNCLE1BQU0sYUFBRSxPQUFPLEVBQUUsU0FBUyx5REFBeUQ7QUFBQSxFQUNuRixTQUFTLGFBQUUsT0FBTyxFQUFFLFNBQVMseURBQXlEO0FBQUEsRUFDdEYsVUFBVSxhQUFFLE9BQU8sRUFBRSxTQUFTLHFFQUFxRTtBQUFBLEVBQ25HLFVBQVUsYUFBRSxRQUFRLEVBQUUsU0FBUyxFQUFFLFNBQVMsMERBQTBEO0FBQUEsRUFDcEcsVUFBVSxhQUFFLE9BQU8sRUFBRSxTQUFTLEVBQUUsU0FBUyw4R0FBOEc7QUFBQSxFQUN2SixhQUFhLGFBQUUsT0FBTyxFQUFFLFNBQVMsRUFBRSxTQUFTLDJCQUEyQjtBQUN6RSxDQUFDO0FBQ0QsSUFBTSxlQUFlLGFBQUUsT0FBTztBQUFBLEVBQzVCLElBQUksYUFBRSxPQUFPLEVBQUUsU0FBUyw0QkFBNEI7QUFBQSxFQUNwRCxNQUFNLGFBQUUsT0FBTyxFQUFFLFNBQVMsOEJBQThCO0FBQUEsRUFDeEQsVUFBVSxhQUFFLE9BQU8sRUFBRSxTQUFTLDJCQUEyQjtBQUFBLEVBQ3pELGFBQWEsYUFBRSxPQUFPLEVBQUUsU0FBUyxFQUFFLFNBQVMsbUVBQW1FO0FBQUEsRUFDL0csZ0JBQWdCLGFBQUUsT0FBTyxFQUFFLFNBQVMsRUFBRSxTQUFTLDZEQUE2RDtBQUM5RyxDQUFDO0FBQ0QsSUFBTSxTQUFTO0FBQUEsRUFDYixNQUFNO0FBQUEsRUFDTixhQUFhO0FBQUEsRUFDYixTQUFTO0FBQUEsRUFDVCxVQUFVO0FBQUEsSUFDUixRQUFRO0FBQUEsSUFDUixNQUFNO0FBQUEsSUFDTixPQUFPO0FBQUEsRUFDVDtBQUFBLEVBQ0EsT0FBTztBQUFBLEVBQ1AsUUFBUTtBQUFBLEVBQ1IsUUFBUSxDQUFDLDRDQUE0QztBQUFBLEVBQ3JELE1BQU0sT0FBTyxPQUFPLFVBQWlEO0FBRW5FLFFBQUk7QUFDSixRQUFJLE1BQU0sVUFBVTtBQUNsQixvQkFBYyxPQUFPLEtBQUssTUFBTSxTQUFTLFFBQVEsRUFBRSxTQUFTLFFBQVE7QUFBQSxJQUN0RSxPQUFPO0FBQ0wsb0JBQWMsTUFBTTtBQUFBLElBQ3RCO0FBSUEsVUFBTSxlQUF3QztBQUFBLE1BQzVDLE1BQU0sTUFBTTtBQUFBLE1BQ1osVUFBVSxNQUFNO0FBQUEsSUFDbEI7QUFDQSxRQUFJLE1BQU0sYUFBYTtBQUNyQixtQkFBYSxhQUFhLElBQUksTUFBTTtBQUFBLElBQ3RDO0FBQ0EsUUFBSSxNQUFNLFVBQVU7QUFDbEIsbUJBQWEsU0FBUyxJQUFJLENBQUMsTUFBTSxRQUFRO0FBQUEsSUFDM0M7QUFDQSxVQUFNLGlCQUFpQixNQUFNLE1BQU0sS0FBSztBQUFBLE1BQ3RDLFVBQVU7QUFBQSxNQUNWLFFBQVE7QUFBQSxRQUNOLFFBQVE7QUFBQSxNQUNWO0FBQUEsTUFDQSxNQUFNO0FBQUEsTUFDTixTQUFTO0FBQUEsSUFDWCxDQUFDO0FBQ0QsUUFBSSxDQUFDLGVBQWUsUUFBUSxDQUFDLGVBQWUsS0FBSyxJQUFJO0FBQ25ELFlBQU0sSUFBSSxNQUFNLFlBQVk7QUFBQSxRQUMxQixNQUFNO0FBQUEsUUFDTixTQUFTO0FBQUEsTUFDWCxDQUFDO0FBQUEsSUFDSDtBQUNBLFVBQU0sU0FBUyxlQUFlLEtBQUs7QUFJbkMsVUFBTSxrQkFBa0IsTUFBTSxNQUFNLE1BQU07QUFBQSxNQUN4QyxVQUFVLDBCQUEwQixNQUFNO0FBQUEsTUFDMUMsUUFBUTtBQUFBLFFBQ04sWUFBWTtBQUFBLFFBQ1osUUFBUTtBQUFBLE1BQ1Y7QUFBQSxNQUNBLFNBQVM7QUFBQSxRQUNQLGdCQUFnQixNQUFNO0FBQUEsTUFDeEI7QUFBQSxNQUNBLE1BQU07QUFBQSxNQUNOLFNBQVM7QUFBQSxJQUNYLENBQUM7QUFDRCxRQUFJLENBQUMsZ0JBQWdCLE1BQU07QUFDekIsWUFBTSxJQUFJLE1BQU0sWUFBWTtBQUFBLFFBQzFCLE1BQU07QUFBQSxRQUNOLFNBQVM7QUFBQSxNQUNYLENBQUM7QUFBQSxJQUNIO0FBQ0EsVUFBTSxPQUFPLGdCQUFnQjtBQUM3QixXQUFPO0FBQUEsTUFDTCxJQUFJLEtBQUs7QUFBQSxNQUNULE1BQU0sS0FBSztBQUFBLE1BQ1gsVUFBVSxLQUFLO0FBQUEsTUFDZixhQUFhLEtBQUssZUFBZTtBQUFBLE1BQ2pDLGdCQUFnQixLQUFLLGtCQUFrQjtBQUFBLElBQ3pDO0FBQUEsRUFDRjtBQUNGO0FBRUEsSUFBTywwQkFBUTsiLAogICJuYW1lcyI6IFtdCn0K
