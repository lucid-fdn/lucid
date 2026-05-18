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

// google/actions/copy-file.ts
var copy_file_exports = {};
__export(copy_file_exports, {
  default: () => copy_file_default
});
module.exports = __toCommonJS(copy_file_exports);
var import_zod = require("zod");
var InputSchema = import_zod.z.object({
  fileId: import_zod.z.string().describe('The ID of the file to copy. Example: "123abc"'),
  name: import_zod.z.string().optional().describe("The new name for the copied file. If not provided, the original name is used."),
  destinationFolderId: import_zod.z.string().optional().describe("The ID of the folder where the copy should be placed. If not provided, the copy is placed in the same folder as the original.")
});
var OutputSchema = import_zod.z.object({
  id: import_zod.z.string().describe("The ID of the copied file"),
  name: import_zod.z.string().describe("The name of the copied file"),
  mimeType: import_zod.z.string().describe("The MIME type of the copied file"),
  createdTime: import_zod.z.string().optional().describe("The creation time of the copied file (RFC 3339)")
});
var action = {
  type: "action",
  description: "Copy a file to a destination",
  version: "1.0.0",
  endpoint: {
    method: "POST",
    path: "/actions/copy-file",
    group: "Files"
  },
  input: InputSchema,
  output: OutputSchema,
  scopes: ["https://www.googleapis.com/auth/drive.file"],
  exec: async (nango, input) => {
    const requestBody = {};
    if (input.name) {
      requestBody.name = input.name;
    }
    if (input.destinationFolderId) {
      requestBody.parents = [input.destinationFolderId];
    }
    const response = await nango.post({
      endpoint: `/drive/v3/files/${input.fileId}/copy`,
      data: requestBody,
      retries: 3
    });
    if (!response.data) {
      throw new nango.ActionError({
        type: "copy_failed",
        message: "Failed to copy file",
        fileId: input.fileId
      });
    }
    return {
      id: response.data.id,
      name: response.data.name,
      mimeType: response.data.mimeType,
      createdTime: response.data.createdTime ?? void 0
    };
  }
};
var copy_file_default = action;
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiZ29vZ2xlL2FjdGlvbnMvY29weS1maWxlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyJpbXBvcnQgeyB6IH0gZnJvbSAnem9kJztcbmltcG9ydCB7IGNyZWF0ZUFjdGlvbiB9IGZyb20gJ25hbmdvJztcbmNvbnN0IElucHV0U2NoZW1hID0gei5vYmplY3Qoe1xuICBmaWxlSWQ6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ1RoZSBJRCBvZiB0aGUgZmlsZSB0byBjb3B5LiBFeGFtcGxlOiBcIjEyM2FiY1wiJyksXG4gIG5hbWU6IHouc3RyaW5nKCkub3B0aW9uYWwoKS5kZXNjcmliZSgnVGhlIG5ldyBuYW1lIGZvciB0aGUgY29waWVkIGZpbGUuIElmIG5vdCBwcm92aWRlZCwgdGhlIG9yaWdpbmFsIG5hbWUgaXMgdXNlZC4nKSxcbiAgZGVzdGluYXRpb25Gb2xkZXJJZDogei5zdHJpbmcoKS5vcHRpb25hbCgpLmRlc2NyaWJlKCdUaGUgSUQgb2YgdGhlIGZvbGRlciB3aGVyZSB0aGUgY29weSBzaG91bGQgYmUgcGxhY2VkLiBJZiBub3QgcHJvdmlkZWQsIHRoZSBjb3B5IGlzIHBsYWNlZCBpbiB0aGUgc2FtZSBmb2xkZXIgYXMgdGhlIG9yaWdpbmFsLicpXG59KTtcbmNvbnN0IE91dHB1dFNjaGVtYSA9IHoub2JqZWN0KHtcbiAgaWQ6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ1RoZSBJRCBvZiB0aGUgY29waWVkIGZpbGUnKSxcbiAgbmFtZTogei5zdHJpbmcoKS5kZXNjcmliZSgnVGhlIG5hbWUgb2YgdGhlIGNvcGllZCBmaWxlJyksXG4gIG1pbWVUeXBlOiB6LnN0cmluZygpLmRlc2NyaWJlKCdUaGUgTUlNRSB0eXBlIG9mIHRoZSBjb3BpZWQgZmlsZScpLFxuICBjcmVhdGVkVGltZTogei5zdHJpbmcoKS5vcHRpb25hbCgpLmRlc2NyaWJlKCdUaGUgY3JlYXRpb24gdGltZSBvZiB0aGUgY29waWVkIGZpbGUgKFJGQyAzMzM5KScpXG59KTtcbmNvbnN0IGFjdGlvbiA9IHtcbiAgdHlwZTogXCJhY3Rpb25cIixcbiAgZGVzY3JpcHRpb246ICdDb3B5IGEgZmlsZSB0byBhIGRlc3RpbmF0aW9uJyxcbiAgdmVyc2lvbjogJzEuMC4wJyxcbiAgZW5kcG9pbnQ6IHtcbiAgICBtZXRob2Q6ICdQT1NUJyxcbiAgICBwYXRoOiAnL2FjdGlvbnMvY29weS1maWxlJyxcbiAgICBncm91cDogJ0ZpbGVzJ1xuICB9LFxuICBpbnB1dDogSW5wdXRTY2hlbWEsXG4gIG91dHB1dDogT3V0cHV0U2NoZW1hLFxuICBzY29wZXM6IFsnaHR0cHM6Ly93d3cuZ29vZ2xlYXBpcy5jb20vYXV0aC9kcml2ZS5maWxlJ10sXG4gIGV4ZWM6IGFzeW5jIChuYW5nbywgaW5wdXQpOiBQcm9taXNlPHouaW5mZXI8dHlwZW9mIE91dHB1dFNjaGVtYT4+ID0+IHtcbiAgICBjb25zdCByZXF1ZXN0Qm9keToge1xuICAgICAgbmFtZT86IHN0cmluZztcbiAgICAgIHBhcmVudHM/OiBzdHJpbmdbXTtcbiAgICB9ID0ge307XG4gICAgaWYgKGlucHV0Lm5hbWUpIHtcbiAgICAgIHJlcXVlc3RCb2R5Lm5hbWUgPSBpbnB1dC5uYW1lO1xuICAgIH1cbiAgICBpZiAoaW5wdXQuZGVzdGluYXRpb25Gb2xkZXJJZCkge1xuICAgICAgcmVxdWVzdEJvZHkucGFyZW50cyA9IFtpbnB1dC5kZXN0aW5hdGlvbkZvbGRlcklkXTtcbiAgICB9XG5cbiAgICAvLyBodHRwczovL2RldmVsb3BlcnMuZ29vZ2xlLmNvbS9kcml2ZS9hcGkvcmVmZXJlbmNlL3Jlc3QvdjMvZmlsZXMvY29weVxuICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgbmFuZ28ucG9zdCh7XG4gICAgICBlbmRwb2ludDogYC9kcml2ZS92My9maWxlcy8ke2lucHV0LmZpbGVJZH0vY29weWAsXG4gICAgICBkYXRhOiByZXF1ZXN0Qm9keSxcbiAgICAgIHJldHJpZXM6IDNcbiAgICB9KTtcbiAgICBpZiAoIXJlc3BvbnNlLmRhdGEpIHtcbiAgICAgIHRocm93IG5ldyBuYW5nby5BY3Rpb25FcnJvcih7XG4gICAgICAgIHR5cGU6ICdjb3B5X2ZhaWxlZCcsXG4gICAgICAgIG1lc3NhZ2U6ICdGYWlsZWQgdG8gY29weSBmaWxlJyxcbiAgICAgICAgZmlsZUlkOiBpbnB1dC5maWxlSWRcbiAgICAgIH0pO1xuICAgIH1cbiAgICByZXR1cm4ge1xuICAgICAgaWQ6IHJlc3BvbnNlLmRhdGEuaWQsXG4gICAgICBuYW1lOiByZXNwb25zZS5kYXRhLm5hbWUsXG4gICAgICBtaW1lVHlwZTogcmVzcG9uc2UuZGF0YS5taW1lVHlwZSxcbiAgICAgIGNyZWF0ZWRUaW1lOiByZXNwb25zZS5kYXRhLmNyZWF0ZWRUaW1lID8/IHVuZGVmaW5lZFxuICAgIH07XG4gIH1cbn07XG5leHBvcnQgdHlwZSBOYW5nb0FjdGlvbkxvY2FsID0gUGFyYW1ldGVyczwodHlwZW9mIGFjdGlvbilbJ2V4ZWMnXT5bMF07XG5leHBvcnQgZGVmYXVsdCBhY3Rpb247Il0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsaUJBQWtCO0FBRWxCLElBQU0sY0FBYyxhQUFFLE9BQU87QUFBQSxFQUMzQixRQUFRLGFBQUUsT0FBTyxFQUFFLFNBQVMsK0NBQStDO0FBQUEsRUFDM0UsTUFBTSxhQUFFLE9BQU8sRUFBRSxTQUFTLEVBQUUsU0FBUywrRUFBK0U7QUFBQSxFQUNwSCxxQkFBcUIsYUFBRSxPQUFPLEVBQUUsU0FBUyxFQUFFLFNBQVMsK0hBQStIO0FBQ3JMLENBQUM7QUFDRCxJQUFNLGVBQWUsYUFBRSxPQUFPO0FBQUEsRUFDNUIsSUFBSSxhQUFFLE9BQU8sRUFBRSxTQUFTLDJCQUEyQjtBQUFBLEVBQ25ELE1BQU0sYUFBRSxPQUFPLEVBQUUsU0FBUyw2QkFBNkI7QUFBQSxFQUN2RCxVQUFVLGFBQUUsT0FBTyxFQUFFLFNBQVMsa0NBQWtDO0FBQUEsRUFDaEUsYUFBYSxhQUFFLE9BQU8sRUFBRSxTQUFTLEVBQUUsU0FBUyxpREFBaUQ7QUFDL0YsQ0FBQztBQUNELElBQU0sU0FBUztBQUFBLEVBQ2IsTUFBTTtBQUFBLEVBQ04sYUFBYTtBQUFBLEVBQ2IsU0FBUztBQUFBLEVBQ1QsVUFBVTtBQUFBLElBQ1IsUUFBUTtBQUFBLElBQ1IsTUFBTTtBQUFBLElBQ04sT0FBTztBQUFBLEVBQ1Q7QUFBQSxFQUNBLE9BQU87QUFBQSxFQUNQLFFBQVE7QUFBQSxFQUNSLFFBQVEsQ0FBQyw0Q0FBNEM7QUFBQSxFQUNyRCxNQUFNLE9BQU8sT0FBTyxVQUFpRDtBQUNuRSxVQUFNLGNBR0YsQ0FBQztBQUNMLFFBQUksTUFBTSxNQUFNO0FBQ2Qsa0JBQVksT0FBTyxNQUFNO0FBQUEsSUFDM0I7QUFDQSxRQUFJLE1BQU0scUJBQXFCO0FBQzdCLGtCQUFZLFVBQVUsQ0FBQyxNQUFNLG1CQUFtQjtBQUFBLElBQ2xEO0FBR0EsVUFBTSxXQUFXLE1BQU0sTUFBTSxLQUFLO0FBQUEsTUFDaEMsVUFBVSxtQkFBbUIsTUFBTSxNQUFNO0FBQUEsTUFDekMsTUFBTTtBQUFBLE1BQ04sU0FBUztBQUFBLElBQ1gsQ0FBQztBQUNELFFBQUksQ0FBQyxTQUFTLE1BQU07QUFDbEIsWUFBTSxJQUFJLE1BQU0sWUFBWTtBQUFBLFFBQzFCLE1BQU07QUFBQSxRQUNOLFNBQVM7QUFBQSxRQUNULFFBQVEsTUFBTTtBQUFBLE1BQ2hCLENBQUM7QUFBQSxJQUNIO0FBQ0EsV0FBTztBQUFBLE1BQ0wsSUFBSSxTQUFTLEtBQUs7QUFBQSxNQUNsQixNQUFNLFNBQVMsS0FBSztBQUFBLE1BQ3BCLFVBQVUsU0FBUyxLQUFLO0FBQUEsTUFDeEIsYUFBYSxTQUFTLEtBQUssZUFBZTtBQUFBLElBQzVDO0FBQUEsRUFDRjtBQUNGO0FBRUEsSUFBTyxvQkFBUTsiLAogICJuYW1lcyI6IFtdCn0K
