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

// notion/actions/update-page.ts
var update_page_exports = {};
__export(update_page_exports, {
  default: () => update_page_default
});
module.exports = __toCommonJS(update_page_exports);
var import_zod = require("zod");
var InputSchema = import_zod.z.object({
  page_id: import_zod.z.string().describe('The ID of the page to update. Example: "2b6ce298-3121-80ae-bfe1-f8984b993639"'),
  properties: import_zod.z.record(import_zod.z.string(), import_zod.z.any()).optional().describe("Page properties to update."),
  icon: import_zod.z.object({
    type: import_zod.z.string().optional(),
    emoji: import_zod.z.string().optional(),
    external: import_zod.z.object({
      url: import_zod.z.string()
    }).optional()
  }).optional().describe("Page icon as emoji or external URL."),
  cover: import_zod.z.object({
    type: import_zod.z.string().optional(),
    external: import_zod.z.object({
      url: import_zod.z.string()
    }).optional()
  }).optional().describe("Page cover image as external URL."),
  archived: import_zod.z.boolean().optional().describe("Set to true to archive the page.")
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
  description: "Modifies page properties, icon, cover, or archived status.",
  version: "1.0.0",
  endpoint: {
    method: "PATCH",
    path: "/pages/update",
    group: "Pages"
  },
  input: InputSchema,
  output: OutputSchema,
  scopes: [],
  exec: async (nango, input) => {
    const config = {
      // https://developers.notion.com/reference/patch-page
      endpoint: `v1/pages/${input.page_id}`,
      data: {
        ...input.properties && {
          properties: input.properties
        },
        ...input.icon && {
          icon: input.icon
        },
        ...input.cover && {
          cover: input.cover
        },
        ...input.archived !== void 0 && {
          archived: input.archived
        }
      },
      retries: 3
    };
    const response = await nango.patch(config);
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
var update_page_default = action;
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsibm90aW9uL2FjdGlvbnMvdXBkYXRlLXBhZ2UudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImltcG9ydCB7IHogfSBmcm9tICd6b2QnO1xuaW1wb3J0IHsgY3JlYXRlQWN0aW9uIH0gZnJvbSAnbmFuZ28nO1xuaW1wb3J0IHR5cGUgeyBQcm94eUNvbmZpZ3VyYXRpb24gfSBmcm9tICduYW5nbyc7XG5jb25zdCBJbnB1dFNjaGVtYSA9IHoub2JqZWN0KHtcbiAgcGFnZV9pZDogei5zdHJpbmcoKS5kZXNjcmliZSgnVGhlIElEIG9mIHRoZSBwYWdlIHRvIHVwZGF0ZS4gRXhhbXBsZTogXCIyYjZjZTI5OC0zMTIxLTgwYWUtYmZlMS1mODk4NGI5OTM2MzlcIicpLFxuICBwcm9wZXJ0aWVzOiB6LnJlY29yZCh6LnN0cmluZygpLCB6LmFueSgpKS5vcHRpb25hbCgpLmRlc2NyaWJlKCdQYWdlIHByb3BlcnRpZXMgdG8gdXBkYXRlLicpLFxuICBpY29uOiB6Lm9iamVjdCh7XG4gICAgdHlwZTogei5zdHJpbmcoKS5vcHRpb25hbCgpLFxuICAgIGVtb2ppOiB6LnN0cmluZygpLm9wdGlvbmFsKCksXG4gICAgZXh0ZXJuYWw6IHoub2JqZWN0KHtcbiAgICAgIHVybDogei5zdHJpbmcoKVxuICAgIH0pLm9wdGlvbmFsKClcbiAgfSkub3B0aW9uYWwoKS5kZXNjcmliZSgnUGFnZSBpY29uIGFzIGVtb2ppIG9yIGV4dGVybmFsIFVSTC4nKSxcbiAgY292ZXI6IHoub2JqZWN0KHtcbiAgICB0eXBlOiB6LnN0cmluZygpLm9wdGlvbmFsKCksXG4gICAgZXh0ZXJuYWw6IHoub2JqZWN0KHtcbiAgICAgIHVybDogei5zdHJpbmcoKVxuICAgIH0pLm9wdGlvbmFsKClcbiAgfSkub3B0aW9uYWwoKS5kZXNjcmliZSgnUGFnZSBjb3ZlciBpbWFnZSBhcyBleHRlcm5hbCBVUkwuJyksXG4gIGFyY2hpdmVkOiB6LmJvb2xlYW4oKS5vcHRpb25hbCgpLmRlc2NyaWJlKCdTZXQgdG8gdHJ1ZSB0byBhcmNoaXZlIHRoZSBwYWdlLicpXG59KTtcbmNvbnN0IE91dHB1dFNjaGVtYSA9IHoub2JqZWN0KHtcbiAgaWQ6IHouc3RyaW5nKCksXG4gIG9iamVjdDogei5zdHJpbmcoKSxcbiAgY3JlYXRlZF90aW1lOiB6LnN0cmluZygpLFxuICBsYXN0X2VkaXRlZF90aW1lOiB6LnN0cmluZygpLFxuICBjcmVhdGVkX2J5OiB6Lm9iamVjdCh7XG4gICAgb2JqZWN0OiB6LnN0cmluZygpLFxuICAgIGlkOiB6LnN0cmluZygpXG4gIH0pLFxuICBsYXN0X2VkaXRlZF9ieTogei5vYmplY3Qoe1xuICAgIG9iamVjdDogei5zdHJpbmcoKSxcbiAgICBpZDogei5zdHJpbmcoKVxuICB9KSxcbiAgcGFyZW50OiB6Lm9iamVjdCh7XG4gICAgdHlwZTogei5zdHJpbmcoKSxcbiAgICBwYWdlX2lkOiB6LnVuaW9uKFt6LnN0cmluZygpLCB6Lm51bGwoKV0pLFxuICAgIGRhdGFiYXNlX2lkOiB6LnVuaW9uKFt6LnN0cmluZygpLCB6Lm51bGwoKV0pLFxuICAgIHdvcmtzcGFjZTogei51bmlvbihbei5ib29sZWFuKCksIHoubnVsbCgpXSlcbiAgfSksXG4gIGFyY2hpdmVkOiB6LmJvb2xlYW4oKSxcbiAgaW5fdHJhc2g6IHouYm9vbGVhbigpLFxuICBwcm9wZXJ0aWVzOiB6LnJlY29yZCh6LnN0cmluZygpLCB6LmFueSgpKSxcbiAgdXJsOiB6LnN0cmluZygpLFxuICBwdWJsaWNfdXJsOiB6LnVuaW9uKFt6LnN0cmluZygpLCB6Lm51bGwoKV0pXG59KTtcbmNvbnN0IGFjdGlvbiA9IHtcbiAgdHlwZTogXCJhY3Rpb25cIixcbiAgZGVzY3JpcHRpb246ICdNb2RpZmllcyBwYWdlIHByb3BlcnRpZXMsIGljb24sIGNvdmVyLCBvciBhcmNoaXZlZCBzdGF0dXMuJyxcbiAgdmVyc2lvbjogJzEuMC4wJyxcbiAgZW5kcG9pbnQ6IHtcbiAgICBtZXRob2Q6ICdQQVRDSCcsXG4gICAgcGF0aDogJy9wYWdlcy91cGRhdGUnLFxuICAgIGdyb3VwOiAnUGFnZXMnXG4gIH0sXG4gIGlucHV0OiBJbnB1dFNjaGVtYSxcbiAgb3V0cHV0OiBPdXRwdXRTY2hlbWEsXG4gIHNjb3BlczogW10sXG4gIGV4ZWM6IGFzeW5jIChuYW5nbywgaW5wdXQpOiBQcm9taXNlPHouaW5mZXI8dHlwZW9mIE91dHB1dFNjaGVtYT4+ID0+IHtcbiAgICBjb25zdCBjb25maWc6IFByb3h5Q29uZmlndXJhdGlvbiA9IHtcbiAgICAgIC8vIGh0dHBzOi8vZGV2ZWxvcGVycy5ub3Rpb24uY29tL3JlZmVyZW5jZS9wYXRjaC1wYWdlXG4gICAgICBlbmRwb2ludDogYHYxL3BhZ2VzLyR7aW5wdXQucGFnZV9pZH1gLFxuICAgICAgZGF0YToge1xuICAgICAgICAuLi4oaW5wdXQucHJvcGVydGllcyAmJiB7XG4gICAgICAgICAgcHJvcGVydGllczogaW5wdXQucHJvcGVydGllc1xuICAgICAgICB9KSxcbiAgICAgICAgLi4uKGlucHV0Lmljb24gJiYge1xuICAgICAgICAgIGljb246IGlucHV0Lmljb25cbiAgICAgICAgfSksXG4gICAgICAgIC4uLihpbnB1dC5jb3ZlciAmJiB7XG4gICAgICAgICAgY292ZXI6IGlucHV0LmNvdmVyXG4gICAgICAgIH0pLFxuICAgICAgICAuLi4oaW5wdXQuYXJjaGl2ZWQgIT09IHVuZGVmaW5lZCAmJiB7XG4gICAgICAgICAgYXJjaGl2ZWQ6IGlucHV0LmFyY2hpdmVkXG4gICAgICAgIH0pXG4gICAgICB9LFxuICAgICAgcmV0cmllczogM1xuICAgIH07XG4gICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBuYW5nby5wYXRjaChjb25maWcpO1xuICAgIGNvbnN0IGRhdGEgPSByZXNwb25zZS5kYXRhO1xuICAgIHJldHVybiB7XG4gICAgICBpZDogZGF0YS5pZCxcbiAgICAgIG9iamVjdDogZGF0YS5vYmplY3QsXG4gICAgICBjcmVhdGVkX3RpbWU6IGRhdGEuY3JlYXRlZF90aW1lLFxuICAgICAgbGFzdF9lZGl0ZWRfdGltZTogZGF0YS5sYXN0X2VkaXRlZF90aW1lLFxuICAgICAgY3JlYXRlZF9ieToge1xuICAgICAgICBvYmplY3Q6IGRhdGEuY3JlYXRlZF9ieS5vYmplY3QsXG4gICAgICAgIGlkOiBkYXRhLmNyZWF0ZWRfYnkuaWRcbiAgICAgIH0sXG4gICAgICBsYXN0X2VkaXRlZF9ieToge1xuICAgICAgICBvYmplY3Q6IGRhdGEubGFzdF9lZGl0ZWRfYnkub2JqZWN0LFxuICAgICAgICBpZDogZGF0YS5sYXN0X2VkaXRlZF9ieS5pZFxuICAgICAgfSxcbiAgICAgIHBhcmVudDoge1xuICAgICAgICB0eXBlOiBkYXRhLnBhcmVudC50eXBlLFxuICAgICAgICBwYWdlX2lkOiBkYXRhLnBhcmVudC5wYWdlX2lkID8/IG51bGwsXG4gICAgICAgIGRhdGFiYXNlX2lkOiBkYXRhLnBhcmVudC5kYXRhYmFzZV9pZCA/PyBudWxsLFxuICAgICAgICB3b3Jrc3BhY2U6IGRhdGEucGFyZW50LndvcmtzcGFjZSA/PyBudWxsXG4gICAgICB9LFxuICAgICAgYXJjaGl2ZWQ6IGRhdGEuYXJjaGl2ZWQsXG4gICAgICBpbl90cmFzaDogZGF0YS5pbl90cmFzaCxcbiAgICAgIHByb3BlcnRpZXM6IGRhdGEucHJvcGVydGllcyxcbiAgICAgIHVybDogZGF0YS51cmwsXG4gICAgICBwdWJsaWNfdXJsOiBkYXRhLnB1YmxpY191cmwgPz8gbnVsbFxuICAgIH07XG4gIH1cbn07XG5leHBvcnQgdHlwZSBOYW5nb0FjdGlvbkxvY2FsID0gUGFyYW1ldGVyczwodHlwZW9mIGFjdGlvbilbJ2V4ZWMnXT5bMF07XG5leHBvcnQgZGVmYXVsdCBhY3Rpb247Il0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsaUJBQWtCO0FBR2xCLElBQU0sY0FBYyxhQUFFLE9BQU87QUFBQSxFQUMzQixTQUFTLGFBQUUsT0FBTyxFQUFFLFNBQVMsK0VBQStFO0FBQUEsRUFDNUcsWUFB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
