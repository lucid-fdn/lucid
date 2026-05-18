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

// google/actions/delete-file.ts
var delete_file_exports = {};
__export(delete_file_exports, {
  default: () => delete_file_default
});
module.exports = __toCommonJS(delete_file_exports);
var import_zod = require("zod");
var InputSchema = import_zod.z.object({
  fileId: import_zod.z.string().describe('The ID of the file or folder to delete. Example: "1aBcDeFgHiJkLmNoPqRsTuVwXyZ123456"')
});
var OutputSchema = import_zod.z.object({
  success: import_zod.z.boolean().describe("Whether the file was successfully deleted"),
  fileId: import_zod.z.string().describe("The ID of the deleted file")
});
var action = {
  type: "action",
  description: "Delete a file or folder from Google Drive",
  version: "1.0.0",
  endpoint: {
    method: "POST",
    path: "/actions/delete-file",
    group: "Files"
  },
  input: InputSchema,
  output: OutputSchema,
  scopes: ["https://www.googleapis.com/auth/drive.file"],
  exec: async (nango, input) => {
    await nango.delete({
      endpoint: `/drive/v3/files/${input.fileId}`,
      retries: 3
    });
    return {
      success: true,
      fileId: input.fileId
    };
  }
};
var delete_file_default = action;
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiZ29vZ2xlL2FjdGlvbnMvZGVsZXRlLWZpbGUudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImltcG9ydCB7IHogfSBmcm9tICd6b2QnO1xuaW1wb3J0IHsgY3JlYXRlQWN0aW9uIH0gZnJvbSAnbmFuZ28nO1xuY29uc3QgSW5wdXRTY2hlbWEgPSB6Lm9iamVjdCh7XG4gIGZpbGVJZDogei5zdHJpbmcoKS5kZXNjcmliZSgnVGhlIElEIG9mIHRoZSBmaWxlIG9yIGZvbGRlciB0byBkZWxldGUuIEV4YW1wbGU6IFwiMWFCY0RlRmdIaUprTG1Ob1BxUnNUdVZ3WHlaMTIzNDU2XCInKVxufSk7XG5jb25zdCBPdXRwdXRTY2hlbWEgPSB6Lm9iamVjdCh7XG4gIHN1Y2Nlc3M6IHouYm9vbGVhbigpLmRlc2NyaWJlKCdXaGV0aGVyIHRoZSBmaWxlIHdhcyBzdWNjZXNzZnVsbHkgZGVsZXRlZCcpLFxuICBmaWxlSWQ6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ1RoZSBJRCBvZiB0aGUgZGVsZXRlZCBmaWxlJylcbn0pO1xuY29uc3QgYWN0aW9uID0ge1xuICB0eXBlOiBcImFjdGlvblwiLFxuICBkZXNjcmlwdGlvbjogJ0RlbGV0ZSBhIGZpbGUgb3IgZm9sZGVyIGZyb20gR29vZ2xlIERyaXZlJyxcbiAgdmVyc2lvbjogJzEuMC4wJyxcbiAgZW5kcG9pbnQ6IHtcbiAgICBtZXRob2Q6ICdQT1NUJyxcbiAgICBwYXRoOiAnL2FjdGlvbnMvZGVsZXRlLWZpbGUnLFxuICAgIGdyb3VwOiAnRmlsZXMnXG4gIH0sXG4gIGlucHV0OiBJbnB1dFNjaGVtYSxcbiAgb3V0cHV0OiBPdXRwdXRTY2hlbWEsXG4gIHNjb3BlczogWydodHRwczovL3d3dy5nb29nbGVhcGlzLmNvbS9hdXRoL2RyaXZlLmZpbGUnXSxcbiAgZXhlYzogYXN5bmMgKG5hbmdvLCBpbnB1dCk6IFByb21pc2U8ei5pbmZlcjx0eXBlb2YgT3V0cHV0U2NoZW1hPj4gPT4ge1xuICAgIC8vIGh0dHBzOi8vZGV2ZWxvcGVycy5nb29nbGUuY29tL3dvcmtzcGFjZS9kcml2ZS9hcGkvcmVmZXJlbmNlL3Jlc3QvdjMvZmlsZXMvZGVsZXRlXG4gICAgYXdhaXQgbmFuZ28uZGVsZXRlKHtcbiAgICAgIGVuZHBvaW50OiBgL2RyaXZlL3YzL2ZpbGVzLyR7aW5wdXQuZmlsZUlkfWAsXG4gICAgICByZXRyaWVzOiAzXG4gICAgfSk7XG4gICAgcmV0dXJuIHtcbiAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICBmaWxlSWQ6IGlucHV0LmZpbGVJZFxuICAgIH07XG4gIH1cbn07XG5leHBvcnQgdHlwZSBOYW5nb0FjdGlvbkxvY2FsID0gUGFyYW1ldGVyczwodHlwZW9mIGFjdGlvbilbJ2V4ZWMnXT5bMF07XG5leHBvcnQgZGVmYXVsdCBhY3Rpb247Il0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsaUJBQWtCO0FBRWxCLElBQU0sY0FBYyxhQUFFLE9BQU87QUFBQSxFQUMzQixRQUFRLGFBQUUsT0FBTyxFQUFFLFNBQVMsc0ZBQXNGO0FBQ3BILENBQUM7QUFDRCxJQUFNLGVBQWUsYUFBRSxPQUFPO0FBQUEsRUFDNUIsU0FBUyxhQUFFLFFBQVEsRUFBRSxTQUFTLDJDQUEyQztBQUFBLEVBQ3pFLFFBQVEsYUFBRSxPQUFPLEVBQUUsU0FBUyw0QkFBNEI7QUFDMUQsQ0FBQztBQUNELElBQU0sU0FBUztBQUFBLEVBQ2IsTUFBTTtBQUFBLEVBQ04sYUFBYTtBQUFBLEVBQ2IsU0FBUztBQUFBLEVBQ1QsVUFBVTtBQUFBLElBQ1IsUUFBUTtBQUFBLElBQ1IsTUFBTTtBQUFBLElBQ04sT0FBTztBQUFBLEVBQ1Q7QUFBQSxFQUNBLE9BQU87QUFBQSxFQUNQLFFBQVE7QUFBQSxFQUNSLFFBQVEsQ0FBQyw0Q0FBNEM7QUFBQSxFQUNyRCxNQUFNLE9BQU8sT0FBTyxVQUFpRDtBQUVuRSxVQUFNLE1BQU0sT0FBTztBQUFBLE1BQ2pCLFVBQVUsbUJBQW1CLE1BQU0sTUFBTTtBQUFBLE1BQ3pDLFNBQVM7QUFBQSxJQUNYLENBQUM7QUFDRCxXQUFPO0FBQUEsTUFDTCxTQUFTO0FBQUEsTUFDVCxRQUFRLE1BQU07QUFBQSxJQUNoQjtBQUFBLEVBQ0Y7QUFDRjtBQUVBLElBQU8sc0JBQVE7IiwKICAibmFtZXMiOiBbXQp9Cg==
