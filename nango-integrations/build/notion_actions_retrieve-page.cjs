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

// notion/actions/retrieve-page.ts
var retrieve_page_exports = {};
__export(retrieve_page_exports, {
  default: () => retrieve_page_default
});
module.exports = __toCommonJS(retrieve_page_exports);
var import_zod = require("zod");
var InputSchema = import_zod.z.object({
  page_id: import_zod.z.string().describe('The ID of the page to retrieve. Example: "2b6ce298-3121-80ae-bfe1-f8984b993639"')
});
var OutputSchema = import_zod.z.object({
  id: import_zod.z.string(),
  object: import_zod.z.string(),
  created_time: import_zod.z.string(),
  last_edited_time: import_zod.z.string(),
  created_by: import_zod.z.object({
    object: import_zod.z.string(),
    id: import_zod.z.string()
  }),
  last_edited_by: import_zod.z.object({
    object: import_zod.z.string(),
    id: import_zod.z.string()
  }),
  parent: import_zod.z.object({
    type: import_zod.z.string(),
    page_id: import_zod.z.union([import_zod.z.string(), import_zod.z.null()]),
    database_id: import_zod.z.union([import_zod.z.string(), import_zod.z.null()]),
    workspace: import_zod.z.union([import_zod.z.boolean(), import_zod.z.null()])
  }),
  archived: import_zod.z.boolean(),
  in_trash: import_zod.z.boolean(),
  properties: import_zod.z.record(import_zod.z.string(), import_zod.z.any()),
  url: import_zod.z.string(),
  public_url: import_zod.z.union([import_zod.z.string(), import_zod.z.null()])
});
var action = {
  type: "action",
  description: "Fetches page properties and metadata by page ID.",
  version: "1.0.0",
  endpoint: {
    method: "GET",
    path: "/pages",
    group: "Pages"
  },
  input: InputSchema,
  output: OutputSchema,
  scopes: [],
  exec: async (nango, input) => {
    const config = {
      // https://developers.notion.com/reference/retrieve-a-page
      endpoint: `v1/pages/${input.page_id}`,
      retries: 3
    };
    const response = await nango.get(config);
    const data = response.data;
    return {
      id: data.id,
      object: data.object,
      created_time: data.created_time,
      last_edited_time: data.last_edited_time,
      created_by: {
        object: data.created_by.object,
        id: data.created_by.id
      },
      last_edited_by: {
        object: data.last_edited_by.object,
        id: data.last_edited_by.id
      },
      parent: {
        type: data.parent.type,
        page_id: data.parent.page_id ?? null,
        database_id: data.parent.database_id ?? null,
        workspace: data.parent.workspace ?? null
      },
      archived: data.archived,
      in_trash: data.in_trash,
      properties: data.properties,
      url: data.url,
      public_url: data.public_url ?? null
    };
  }
};
var retrieve_page_default = action;
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsibm90aW9uL2FjdGlvbnMvcmV0cmlldmUtcGFnZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiaW1wb3J0IHsgeiB9IGZyb20gJ3pvZCc7XG5pbXBvcnQgeyBjcmVhdGVBY3Rpb24gfSBmcm9tICduYW5nbyc7XG5pbXBvcnQgdHlwZSB7IFByb3h5Q29uZmlndXJhdGlvbiB9IGZyb20gJ25hbmdvJztcbmNvbnN0IElucHV0U2NoZW1hID0gei5vYmplY3Qoe1xuICBwYWdlX2lkOiB6LnN0cmluZygpLmRlc2NyaWJlKCdUaGUgSUQgb2YgdGhlIHBhZ2UgdG8gcmV0cmlldmUuIEV4YW1wbGU6IFwiMmI2Y2UyOTgtMzEyMS04MGFlLWJmZTEtZjg5ODRiOTkzNjM5XCInKVxufSk7XG5jb25zdCBPdXRwdXRTY2hlbWEgPSB6Lm9iamVjdCh7XG4gIGlkOiB6LnN0cmluZygpLFxuICBvYmplY3Q6IHouc3RyaW5nKCksXG4gIGNyZWF0ZWRfdGltZTogei5zdHJpbmcoKSxcbiAgbGFzdF9lZGl0ZWRfdGltZTogei5zdHJpbmcoKSxcbiAgY3JlYXRlZF9ieTogei5vYmplY3Qoe1xuICAgIG9iamVjdDogei5zdHJpbmcoKSxcbiAgICBpZDogei5zdHJpbmcoKVxuICB9KSxcbiAgbGFzdF9lZGl0ZWRfYnk6IHoub2JqZWN0KHtcbiAgICBvYmplY3Q6IHouc3RyaW5nKCksXG4gICAgaWQ6IHouc3RyaW5nKClcbiAgfSksXG4gIHBhcmVudDogei5vYmplY3Qoe1xuICAgIHR5cGU6IHouc3RyaW5nKCksXG4gICAgcGFnZV9pZDogei51bmlvbihbei5zdHJpbmcoKSwgei5udWxsKCldKSxcbiAgICBkYXRhYmFzZV9pZDogei51bmlvbihbei5zdHJpbmcoKSwgei5udWxsKCldKSxcbiAgICB3b3Jrc3BhY2U6IHoudW5pb24oW3ouYm9vbGVhbigpLCB6Lm51bGwoKV0pXG4gIH0pLFxuICBhcmNoaXZlZDogei5ib29sZWFuKCksXG4gIGluX3RyYXNoOiB6LmJvb2xlYW4oKSxcbiAgcHJvcGVydGllczogei5yZWNvcmQoei5zdHJpbmcoKSwgei5hbnkoKSksXG4gIHVybDogei5zdHJpbmcoKSxcbiAgcHVibGljX3VybDogei51bmlvbihbei5zdHJpbmcoKSwgei5udWxsKCldKVxufSk7XG5jb25zdCBhY3Rpb24gPSB7XG4gIHR5cGU6IFwiYWN0aW9uXCIsXG4gIGRlc2NyaXB0aW9uOiAnRmV0Y2hlcyBwYWdlIHByb3BlcnRpZXMgYW5kIG1ldGFkYXRhIGJ5IHBhZ2UgSUQuJyxcbiAgdmVyc2lvbjogJzEuMC4wJyxcbiAgZW5kcG9pbnQ6IHtcbiAgICBtZXRob2Q6ICdHRVQnLFxuICAgIHBhdGg6ICcvcGFnZXMnLFxuICAgIGdyb3VwOiAnUGFnZXMnXG4gIH0sXG4gIGlucHV0OiBJbnB1dFNjaGVtYSxcbiAgb3V0cHV0OiBPdXRwdXRTY2hlbWEsXG4gIHNjb3BlczogW10sXG4gIGV4ZWM6IGFzeW5jIChuYW5nbywgaW5wdXQpOiBQcm9taXNlPHouaW5mZXI8dHlwZW9mIE91dHB1dFNjaGVtYT4+ID0+IHtcbiAgICBjb25zdCBjb25maWc6IFByb3h5Q29uZmlndXJhdGlvbiA9IHtcbiAgICAgIC8vIGh0dHBzOi8vZGV2ZWxvcGVycy5ub3Rpb24uY29tL3JlZmVyZW5jZS9yZXRyaWV2ZS1hLXBhZ2VcbiAgICAgIGVuZHBvaW50OiBgdjEvcGFnZXMvJHtpbnB1dC5wYWdlX2lkfWAsXG4gICAgICByZXRyaWVzOiAzXG4gICAgfTtcbiAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IG5hbmdvLmdldChjb25maWcpO1xuICAgIGNvbnN0IGRhdGEgPSByZXNwb25zZS5kYXRhO1xuICAgIHJldHVybiB7XG4gICAgICBpZDogZGF0YS5pZCxcbiAgICAgIG9iamVjdDogZGF0YS5vYmplY3QsXG4gICAgICBjcmVhdGVkX3RpbWU6IGRhdGEuY3JlYXRlZF90aW1lLFxuICAgICAgbGFzdF9lZGl0ZWRfdGltZTogZGF0YS5sYXN0X2VkaXRlZF90aW1lLFxuICAgICAgY3JlYXRlZF9ieToge1xuICAgICAgICBvYmplY3Q6IGRhdGEuY3JlYXRlZF9ieS5vYmplY3QsXG4gICAgICAgIGlkOiBkYXRhLmNyZWF0ZWRfYnkuaWRcbiAgICAgIH0sXG4gICAgICBsYXN0X2VkaXRlZF9ieToge1xuICAgICAgICBvYmplY3Q6IGRhdGEubGFzdF9lZGl0ZWRfYnkub2JqZWN0LFxuICAgICAgICBpZDogZGF0YS5sYXN0X2VkaXRlZF9ieS5pZFxuICAgICAgfSxcbiAgICAgIHBhcmVudDoge1xuICAgICAgICB0eXBlOiBkYXRhLnBhcmVudC50eXBlLFxuICAgICAgICBwYWdlX2lkOiBkYXRhLnBhcmVudC5wYWdlX2lkID8/IG51bGwsXG4gICAgICAgIGRhdGFiYXNlX2lkOiBkYXRhLnBhcmVudC5kYXRhYmFzZV9pZCA/PyBudWxsLFxuICAgICAgICB3b3Jrc3BhY2U6IGRhdGEucGFyZW50LndvcmtzcGFjZSA/PyBudWxsXG4gICAgICB9LFxuICAgICAgYXJjaGl2ZWQ6IGRhdGEuYXJjaGl2ZWQsXG4gICAgICBpbl90cmFzaDogZGF0YS5pbl90cmFzaCxcbiAgICAgIHByb3BlcnRpZXM6IGRhdGEucHJvcGVydGllcyxcbiAgICAgIHVybDogZGF0YS51cmwsXG4gICAgICBwdWJsaWNfdXJsOiBkYXRhLnB1YmxpY191cmwgPz8gbnVsbFxuICAgIH07XG4gIH1cbn07XG5leHBvcnQgdHlwZSBOYW5nb0FjdGlvbkxvY2FsID0gUGFyYW1ldGVyczwodHlwZW9mIGFjdGlvbilbJ2V4ZWMnXT5bMF07XG5leHBvcnQgZGVmYXVsdCBhY3Rpb247Il0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsaUJBQWtCO0FBR2xCLElBQU0sY0FBYyxhQUFFLE9BQU87QUFBQSxFQUMzQixTQUFTLGFBQUUsT0FBTyxFQUFFLFNBQVMsaUZBQWlGO0FBQ2hILENBQUM7QUFDRCxJQUFNLGVBQWUsYUFBRSxPQUFPO0FBQUEsRUFDNUIsSUFBSSxhQUFFLE9BQU87QUFB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
