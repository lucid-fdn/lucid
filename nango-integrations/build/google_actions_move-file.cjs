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

// google/actions/move-file.ts
var move_file_exports = {};
__export(move_file_exports, {
  default: () => move_file_default
});
module.exports = __toCommonJS(move_file_exports);
var import_zod = require("zod");
var InputSchema = import_zod.z.object({
  fileId: import_zod.z.string().describe('The ID of the file to move. Example: "1mD3ukEAmRqo8u0RF_Cr6IJl9f_uWTYH03vesDhB5Svw"'),
  fromFolderId: import_zod.z.string().describe('The ID of the current parent folder. Example: "1SpnQKJHqNDh-qhbj_zGD2aIm-G-RKC_k"'),
  toFolderId: import_zod.z.string().describe('The ID of the destination folder. Example: "1Bl1rB7hkBbdzmKUka3zSj0bhAK3pGypD"')
});
var OutputSchema = import_zod.z.object({
  id: import_zod.z.string(),
  name: import_zod.z.string().optional(),
  mimeType: import_zod.z.string().optional(),
  parents: import_zod.z.array(import_zod.z.string())
});
var action = {
  type: "action",
  description: "Move a file to a different folder",
  version: "1.0.0",
  endpoint: {
    method: "POST",
    path: "/actions/move-file",
    group: "Files"
  },
  input: InputSchema,
  output: OutputSchema,
  scopes: ["https://www.googleapis.com/auth/drive.file"],
  exec: async (nango, input) => {
    const response = await nango.patch({
      endpoint: `/drive/v3/files/${input.fileId}`,
      params: {
        addParents: input.toFolderId,
        removeParents: input.fromFolderId,
        fields: "id,name,mimeType,parents"
      },
      retries: 3
    });
    if (!response.data) {
      throw new nango.ActionError({
        type: "not_found",
        message: "File not found or could not be moved",
        fileId: input.fileId
      });
    }
    return {
      id: response.data.id,
      name: response.data.name ?? void 0,
      mimeType: response.data.mimeType ?? void 0,
      parents: response.data.parents || []
    };
  }
};
var move_file_default = action;
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiZ29vZ2xlL2FjdGlvbnMvbW92ZS1maWxlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyJpbXBvcnQgeyB6IH0gZnJvbSAnem9kJztcbmltcG9ydCB7IGNyZWF0ZUFjdGlvbiB9IGZyb20gJ25hbmdvJztcbmNvbnN0IElucHV0U2NoZW1hID0gei5vYmplY3Qoe1xuICBmaWxlSWQ6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ1RoZSBJRCBvZiB0aGUgZmlsZSB0byBtb3ZlLiBFeGFtcGxlOiBcIjFtRDN1a0VBbVJxbzh1MFJGX0NyNklKbDlmX3VXVFlIMDN2ZXNEaEI1U3Z3XCInKSxcbiAgZnJvbUZvbGRlcklkOiB6LnN0cmluZygpLmRlc2NyaWJlKCdUaGUgSUQgb2YgdGhlIGN1cnJlbnQgcGFyZW50IGZvbGRlci4gRXhhbXBsZTogXCIxU3BuUUtKSHFORGgtcWhial96R0QyYUltLUctUktDX2tcIicpLFxuICB0b0ZvbGRlcklkOiB6LnN0cmluZygpLmRlc2NyaWJlKCdUaGUgSUQgb2YgdGhlIGRlc3RpbmF0aW9uIGZvbGRlci4gRXhhbXBsZTogXCIxQmwxckI3aGtCYmR6bUtVa2EzelNqMGJoQUszcEd5cERcIicpXG59KTtcbmNvbnN0IE91dHB1dFNjaGVtYSA9IHoub2JqZWN0KHtcbiAgaWQ6IHouc3RyaW5nKCksXG4gIG5hbWU6IHouc3RyaW5nKCkub3B0aW9uYWwoKSxcbiAgbWltZVR5cGU6IHouc3RyaW5nKCkub3B0aW9uYWwoKSxcbiAgcGFyZW50czogei5hcnJheSh6LnN0cmluZygpKVxufSk7XG5jb25zdCBhY3Rpb24gPSB7XG4gIHR5cGU6IFwiYWN0aW9uXCIsXG4gIGRlc2NyaXB0aW9uOiAnTW92ZSBhIGZpbGUgdG8gYSBkaWZmZXJlbnQgZm9sZGVyJyxcbiAgdmVyc2lvbjogJzEuMC4wJyxcbiAgZW5kcG9pbnQ6IHtcbiAgICBtZXRob2Q6ICdQT1NUJyxcbiAgICBwYXRoOiAnL2FjdGlvbnMvbW92ZS1maWxlJyxcbiAgICBncm91cDogJ0ZpbGVzJ1xuICB9LFxuICBpbnB1dDogSW5wdXRTY2hlbWEsXG4gIG91dHB1dDogT3V0cHV0U2NoZW1hLFxuICBzY29wZXM6IFsnaHR0cHM6Ly93d3cuZ29vZ2xlYXBpcy5jb20vYXV0aC9kcml2ZS5maWxlJ10sXG4gIGV4ZWM6IGFzeW5jIChuYW5nbywgaW5wdXQpOiBQcm9taXNlPHouaW5mZXI8dHlwZW9mIE91dHB1dFNjaGVtYT4+ID0+IHtcbiAgICAvLyBodHRwczovL2RldmVsb3BlcnMuZ29vZ2xlLmNvbS93b3Jrc3BhY2UvZHJpdmUvYXBpL3JlZmVyZW5jZS9yZXN0L3YzL2ZpbGVzL3VwZGF0ZVxuICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgbmFuZ28ucGF0Y2goe1xuICAgICAgZW5kcG9pbnQ6IGAvZHJpdmUvdjMvZmlsZXMvJHtpbnB1dC5maWxlSWR9YCxcbiAgICAgIHBhcmFtczoge1xuICAgICAgICBhZGRQYXJlbnRzOiBpbnB1dC50b0ZvbGRlcklkLFxuICAgICAgICByZW1vdmVQYXJlbnRzOiBpbnB1dC5mcm9tRm9sZGVySWQsXG4gICAgICAgIGZpZWxkczogJ2lkLG5hbWUsbWltZVR5cGUscGFyZW50cydcbiAgICAgIH0sXG4gICAgICByZXRyaWVzOiAzXG4gICAgfSk7XG4gICAgaWYgKCFyZXNwb25zZS5kYXRhKSB7XG4gICAgICB0aHJvdyBuZXcgbmFuZ28uQWN0aW9uRXJyb3Ioe1xuICAgICAgICB0eXBlOiAnbm90X2ZvdW5kJyxcbiAgICAgICAgbWVzc2FnZTogJ0ZpbGUgbm90IGZvdW5kIG9yIGNvdWxkIG5vdCBiZSBtb3ZlZCcsXG4gICAgICAgIGZpbGVJZDogaW5wdXQuZmlsZUlkXG4gICAgICB9KTtcbiAgICB9XG4gICAgcmV0dXJuIHtcbiAgICAgIGlkOiByZXNwb25zZS5kYXRhLmlkLFxuICAgICAgbmFtZTogcmVzcG9uc2UuZGF0YS5uYW1lID8/IHVuZGVmaW5lZCxcbiAgICAgIG1pbWVUeXBlOiByZXNwb25zZS5kYXRhLm1pbWVUeXBlID8/IHVuZGVmaW5lZCxcbiAgICAgIHBhcmVudHM6IHJlc3BvbnNlLmRhdGEucGFyZW50cyB8fCBbXVxuICAgIH07XG4gIH1cbn07XG5leHBvcnQgdHlwZSBOYW5nb0FjdGlvbkxvY2FsID0gUGFyYW1ldGVyczwodHlwZW9mIGFjdGlvbilbJ2V4ZWMnXT5bMF07XG5leHBvcnQgZGVmYXVsdCBhY3Rpb247Il0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsaUJBQWtCO0FBRWxCLElBQU0sY0FBYyxhQUFFLE9BQU87QUFBQSxFQUMzQixRQUFRLGFBQUUsT0FBTyxFQUFFLFNBQVMscUZBQXFGO0FBQUEsRUFDakgsY0FBYyxhQUFFLE9BQU8sRUFBRSxTQUFTLG1GQUFtRjtBQUFBLEVBQ3JILFlBQVksYUFBRSxPQUFPLEVBQUUsU0FBUyxnRkFBZ0Y7QUFDbEgsQ0FBQztBQUNELElBQU0sZUFBZSxhQUFFLE9BQU87QUFBQSxFQUM1QixJQUFJLGFBQUUsT0FBTztBQUFBLEVBQ2IsTUFBTSxhQUFFLE9BQU8sRUFBRSxTQUFTO0FBQUEsRUFDMUIsVUFBVSxhQUFFLE9BQU8sRUFBRSxTQUFTO0FBQUEsRUFDOUIsU0FBUyxhQUFFLE1BQU0sYUFBRSxPQUFPLENBQUM7QUFDN0IsQ0FBQztBQUNELElBQU0sU0FBUztBQUFBLEVBQ2IsTUFBTTtBQUFBLEVBQ04sYUFBYTtBQUFBLEVBQ2IsU0FBUztBQUFBLEVBQ1QsVUFBVTtBQUFBLElBQ1IsUUFBUTtBQUFBLElBQ1IsTUFBTTtBQUFBLElBQ04sT0FBTztBQUFBLEVBQ1Q7QUFBQSxFQUNBLE9BQU87QUFBQSxFQUNQLFFBQVE7QUFBQSxFQUNSLFFBQVEsQ0FBQyw0Q0FBNEM7QUFBQSxFQUNyRCxNQUFNLE9BQU8sT0FBTyxVQUFpRDtBQUVuRSxVQUFNLFdBQVcsTUFBTSxNQUFNLE1BQU07QUFBQSxNQUNqQyxVQUFVLG1CQUFtQixNQUFNLE1BQU07QUFBQSxNQUN6QyxRQUFRO0FBQUEsUUFDTixZQUFZLE1BQU07QUFBQSxRQUNsQixlQUFlLE1BQU07QUFBQSxRQUNyQixRQUFRO0FBQUEsTUFDVjtBQUFBLE1BQ0EsU0FBUztBQUFBLElBQ1gsQ0FBQztBQUNELFFBQUksQ0FBQyxTQUFTLE1BQU07QUFDbEIsWUFBTSxJQUFJLE1BQU0sWUFBWTtBQUFBLFFBQzFCLE1BQU07QUFBQSxRQUNOLFNBQVM7QUFBQSxRQUNULFFBQVEsTUFBTTtBQUFBLE1BQ2hCLENBQUM7QUFBQSxJQUNIO0FBQ0EsV0FBTztBQUFBLE1BQ0wsSUFBSSxTQUFTLEtBQUs7QUFBQSxNQUNsQixNQUFNLFNBQVMsS0FBSyxRQUFRO0FBQUEsTUFDNUIsVUFBVSxTQUFTLEtBQUssWUFBWTtBQUFBLE1BQ3BDLFNBQVMsU0FBUyxLQUFLLFdBQVcsQ0FBQztBQUFBLElBQ3JDO0FBQUEsRUFDRjtBQUNGO0FBRUEsSUFBTyxvQkFBUTsiLAogICJuYW1lcyI6IFtdCn0K
