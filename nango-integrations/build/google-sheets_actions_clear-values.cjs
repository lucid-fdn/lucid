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

// google-sheets/actions/clear-values.ts
var clear_values_exports = {};
__export(clear_values_exports, {
  default: () => clear_values_default
});
module.exports = __toCommonJS(clear_values_exports);
var import_zod = require("zod");
var InputSchema = import_zod.z.object({
  spreadsheetId: import_zod.z.string().describe('The ID of the spreadsheet to update. Example: "1a2b3c4d5e6f7g8h9i0j"'),
  range: import_zod.z.string().describe('The A1 notation or R1C1 notation of the values to clear. Example: "Sheet1!A1:D10"')
});
var OutputSchema = import_zod.z.object({
  spreadsheetId: import_zod.z.string(),
  clearedRange: import_zod.z.string()
});
var action = {
  type: "action",
  description: "Clear values from a range, preserving formatting",
  version: "1.0.0",
  endpoint: {
    method: "POST",
    path: "/actions/clear-values",
    group: "Values"
  },
  input: InputSchema,
  output: OutputSchema,
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  exec: async (nango, input) => {
    const response = await nango.post({
      endpoint: `v4/spreadsheets/${input.spreadsheetId}/values/${encodeURIComponent(input.range)}:clear`,
      data: {},
      retries: 3
    });
    return {
      spreadsheetId: response.data.spreadsheetId,
      clearedRange: response.data.clearedRange
    };
  }
};
var clear_values_default = action;
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiZ29vZ2xlLXNoZWV0cy9hY3Rpb25zL2NsZWFyLXZhbHVlcy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiaW1wb3J0IHsgeiB9IGZyb20gJ3pvZCc7XG5pbXBvcnQgeyBjcmVhdGVBY3Rpb24gfSBmcm9tICduYW5nbyc7XG5jb25zdCBJbnB1dFNjaGVtYSA9IHoub2JqZWN0KHtcbiAgc3ByZWFkc2hlZXRJZDogei5zdHJpbmcoKS5kZXNjcmliZSgnVGhlIElEIG9mIHRoZSBzcHJlYWRzaGVldCB0byB1cGRhdGUuIEV4YW1wbGU6IFwiMWEyYjNjNGQ1ZTZmN2c4aDlpMGpcIicpLFxuICByYW5nZTogei5zdHJpbmcoKS5kZXNjcmliZSgnVGhlIEExIG5vdGF0aW9uIG9yIFIxQzEgbm90YXRpb24gb2YgdGhlIHZhbHVlcyB0byBjbGVhci4gRXhhbXBsZTogXCJTaGVldDEhQTE6RDEwXCInKVxufSk7XG5jb25zdCBPdXRwdXRTY2hlbWEgPSB6Lm9iamVjdCh7XG4gIHNwcmVhZHNoZWV0SWQ6IHouc3RyaW5nKCksXG4gIGNsZWFyZWRSYW5nZTogei5zdHJpbmcoKVxufSk7XG5jb25zdCBhY3Rpb24gPSB7XG4gIHR5cGU6IFwiYWN0aW9uXCIsXG4gIGRlc2NyaXB0aW9uOiAnQ2xlYXIgdmFsdWVzIGZyb20gYSByYW5nZSwgcHJlc2VydmluZyBmb3JtYXR0aW5nJyxcbiAgdmVyc2lvbjogJzEuMC4wJyxcbiAgZW5kcG9pbnQ6IHtcbiAgICBtZXRob2Q6ICdQT1NUJyxcbiAgICBwYXRoOiAnL2FjdGlvbnMvY2xlYXItdmFsdWVzJyxcbiAgICBncm91cDogJ1ZhbHVlcydcbiAgfSxcbiAgaW5wdXQ6IElucHV0U2NoZW1hLFxuICBvdXRwdXQ6IE91dHB1dFNjaGVtYSxcbiAgc2NvcGVzOiBbJ2h0dHBzOi8vd3d3Lmdvb2dsZWFwaXMuY29tL2F1dGgvc3ByZWFkc2hlZXRzJ10sXG4gIGV4ZWM6IGFzeW5jIChuYW5nbywgaW5wdXQpOiBQcm9taXNlPHouaW5mZXI8dHlwZW9mIE91dHB1dFNjaGVtYT4+ID0+IHtcbiAgICAvLyBodHRwczovL2RldmVsb3BlcnMuZ29vZ2xlLmNvbS9zaGVldHMvYXBpL3JlZmVyZW5jZS9yZXN0L3Y0L3NwcmVhZHNoZWV0cy52YWx1ZXMvY2xlYXJcbiAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IG5hbmdvLnBvc3Qoe1xuICAgICAgZW5kcG9pbnQ6IGB2NC9zcHJlYWRzaGVldHMvJHtpbnB1dC5zcHJlYWRzaGVldElkfS92YWx1ZXMvJHtlbmNvZGVVUklDb21wb25lbnQoaW5wdXQucmFuZ2UpfTpjbGVhcmAsXG4gICAgICBkYXRhOiB7fSxcbiAgICAgIHJldHJpZXM6IDNcbiAgICB9KTtcbiAgICByZXR1cm4ge1xuICAgICAgc3ByZWFkc2hlZXRJZDogcmVzcG9uc2UuZGF0YS5zcHJlYWRzaGVldElkLFxuICAgICAgY2xlYXJlZFJhbmdlOiByZXNwb25zZS5kYXRhLmNsZWFyZWRSYW5nZVxuICAgIH07XG4gIH1cbn07XG5leHBvcnQgdHlwZSBOYW5nb0FjdGlvbkxvY2FsID0gUGFyYW1ldGVyczwodHlwZW9mIGFjdGlvbilbJ2V4ZWMnXT5bMF07XG5leHBvcnQgZGVmYXVsdCBhY3Rpb247Il0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsaUJBQWtCO0FBRWxCLElBQU0sY0FBYyxhQUFFLE9BQU87QUFBQSxFQUMzQixlQUFlLGFBQUUsT0FBTyxFQUFFLFNBQVMsc0VBQXNFO0FBQUEsRUFDekcsT0FBTyxhQUFFLE9BQU8sRUFBRSxTQUFTLG1GQUFtRjtBQUNoSCxDQUFDO0FBQ0QsSUFBTSxlQUFlLGFBQUUsT0FBTztBQUFBLEVBQzVCLGVBQWUsYUFBRSxPQUFPO0FBQUEsRUFDeEIsY0FBYyxhQUFFLE9BQU87QUFDekIsQ0FBQztBQUNELElBQU0sU0FBUztBQUFBLEVBQ2IsTUFBTTtBQUFBLEVBQ04sYUFBYTtBQUFBLEVBQ2IsU0FBUztBQUFBLEVBQ1QsVUFBVTtBQUFBLElBQ1IsUUFBUTtBQUFBLElBQ1IsTUFBTTtBQUFBLElBQ04sT0FBTztBQUFBLEVBQ1Q7QUFBQSxFQUNBLE9BQU87QUFBQSxFQUNQLFFBQVE7QUFBQSxFQUNSLFFBQVEsQ0FBQyw4Q0FBOEM7QUFBQSxFQUN2RCxNQUFNLE9BQU8sT0FBTyxVQUFpRDtBQUVuRSxVQUFNLFdBQVcsTUFBTSxNQUFNLEtBQUs7QUFBQSxNQUNoQyxVQUFVLG1CQUFtQixNQUFNLGFBQWEsV0FBVyxtQkFBbUIsTUFBTSxLQUFLLENBQUM7QUFBQSxNQUMxRixNQUFNLENBQUM7QUFBQSxNQUNQLFNBQVM7QUFBQSxJQUNYLENBQUM7QUFDRCxXQUFPO0FBQUEsTUFDTCxlQUFlLFNBQVMsS0FBSztBQUFBLE1BQzdCLGNBQWMsU0FBUyxLQUFLO0FBQUEsSUFDOUI7QUFBQSxFQUNGO0FBQ0Y7QUFFQSxJQUFPLHVCQUFROyIsCiAgIm5hbWVzIjogW10KfQo=
