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

// notion/actions/create-page.ts
var create_page_exports = {};
__export(create_page_exports, {
  default: () => create_page_default
});
module.exports = __toCommonJS(create_page_exports);
var import_zod = require("zod");
var InputSchema = import_zod.z.object({
  parent: import_zod.z.object({
    page_id: import_zod.z.string().optional().describe('Parent page ID. Example: "2b6ce298-3121-80ae-bfe1-f8984b993639"'),
    database_id: import_zod.z.string().optional().describe('Parent database ID. Example: "2b6ce298-3121-8079-a497-d3eca16d875c"')
  }).describe("Parent page or database. Must include either page_id or database_id."),
  properties: import_zod.z.record(import_zod.z.string(), import_zod.z.any()).describe("Page properties. For pages with page parent, use title property. For database parents, use database property schema."),
  children: import_zod.z.array(import_zod.z.any()).optional().describe("Array of block objects to add as page content."),
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
  }).optional().describe("Page cover image as external URL.")
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
    database_id: import_zod.z.union([import_zod.z.string(), import_zod.z.null()])
  }),
  archived: import_zod.z.boolean(),
  in_trash: import_zod.z.boolean(),
  properties: import_zod.z.record(import_zod.z.string(), import_zod.z.any()),
  url: import_zod.z.string(),
  public_url: import_zod.z.union([import_zod.z.string(), import_zod.z.null()])
});
var action = {
  type: "action",
  description: "Creates a new page as child of a page or database with optional content blocks.",
  version: "1.0.0",
  endpoint: {
    method: "POST",
    path: "/pages",
    group: "Pages"
  },
  input: InputSchema,
  output: OutputSchema,
  scopes: [],
  exec: async (nango, input) => {
    const config = {
      // https://developers.notion.com/reference/post-page
      endpoint: "v1/pages",
      data: {
        parent: input.parent,
        properties: input.properties,
        ...input.children && {
          children: input.children
        },
        ...input.icon && {
          icon: input.icon
        },
        ...input.cover && {
          cover: input.cover
        }
      },
      retries: 3
    };
    const response = await nango.post(config);
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
        database_id: data.parent.database_id ?? null
      },
      archived: data.archived,
      in_trash: data.in_trash,
      properties: data.properties,
      url: data.url,
      public_url: data.public_url ?? null
    };
  }
};
var create_page_default = action;
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsibm90aW9uL2FjdGlvbnMvY3JlYXRlLXBhZ2UudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImltcG9ydCB7IHogfSBmcm9tICd6b2QnO1xuaW1wb3J0IHsgY3JlYXRlQWN0aW9uIH0gZnJvbSAnbmFuZ28nO1xuaW1wb3J0IHR5cGUgeyBQcm94eUNvbmZpZ3VyYXRpb24gfSBmcm9tICduYW5nbyc7XG5cbi8vIElucHV0IHNjaGVtYSAtIHBhcmVudCBhbmQgcHJvcGVydGllcyBhcmUgcmVxdWlyZWQsIG90aGVycyBvcHRpb25hbFxuY29uc3QgSW5wdXRTY2hlbWEgPSB6Lm9iamVjdCh7XG4gIHBhcmVudDogei5vYmplY3Qoe1xuICAgIHBhZ2VfaWQ6IHouc3RyaW5nKCkub3B0aW9uYWwoKS5kZXNjcmliZSgnUGFyZW50IHBhZ2UgSUQuIEV4YW1wbGU6IFwiMmI2Y2UyOTgtMzEyMS04MGFlLWJmZTEtZjg5ODRiOTkzNjM5XCInKSxcbiAgICBkYXRhYmFzZV9pZDogei5zdHJpbmcoKS5vcHRpb25hbCgpLmRlc2NyaWJlKCdQYXJlbnQgZGF0YWJhc2UgSUQuIEV4YW1wbGU6IFwiMmI2Y2UyOTgtMzEyMS04MDc5LWE0OTctZDNlY2ExNmQ4NzVjXCInKVxuICB9KS5kZXNjcmliZSgnUGFyZW50IHBhZ2Ugb3IgZGF0YWJhc2UuIE11c3QgaW5jbHVkZSBlaXRoZXIgcGFnZV9pZCBvciBkYXRhYmFzZV9pZC4nKSxcbiAgcHJvcGVydGllczogei5yZWNvcmQoei5zdHJpbmcoKSwgei5hbnkoKSkuZGVzY3JpYmUoJ1BhZ2UgcHJvcGVydGllcy4gRm9yIHBhZ2VzIHdpdGggcGFnZSBwYXJlbnQsIHVzZSB0aXRsZSBwcm9wZXJ0eS4gRm9yIGRhdGFiYXNlIHBhcmVudHMsIHVzZSBkYXRhYmFzZSBwcm9wZXJ0eSBzY2hlbWEuJyksXG4gIGNoaWxkcmVuOiB6LmFycmF5KHouYW55KCkpLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ0FycmF5IG9mIGJsb2NrIG9iamVjdHMgdG8gYWRkIGFzIHBhZ2UgY29udGVudC4nKSxcbiAgaWNvbjogei5vYmplY3Qoe1xuICAgIHR5cGU6IHouc3RyaW5nKCkub3B0aW9uYWwoKSxcbiAgICBlbW9qaTogei5zdHJpbmcoKS5vcHRpb25hbCgpLFxuICAgIGV4dGVybmFsOiB6Lm9iamVjdCh7XG4gICAgICB1cmw6IHouc3RyaW5nKClcbiAgICB9KS5vcHRpb25hbCgpXG4gIH0pLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ1BhZ2UgaWNvbiBhcyBlbW9qaSBvciBleHRlcm5hbCBVUkwuJyksXG4gIGNvdmVyOiB6Lm9iamVjdCh7XG4gICAgdHlwZTogei5zdHJpbmcoKS5vcHRpb25hbCgpLFxuICAgIGV4dGVybmFsOiB6Lm9iamVjdCh7XG4gICAgICB1cmw6IHouc3RyaW5nKClcbiAgICB9KS5vcHRpb25hbCgpXG4gIH0pLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ1BhZ2UgY292ZXIgaW1hZ2UgYXMgZXh0ZXJuYWwgVVJMLicpXG59KTtcblxuLy8gT3V0cHV0IHNjaGVtYVxuY29uc3QgT3V0cHV0U2NoZW1hID0gei5vYmplY3Qoe1xuICBpZDogei5zdHJpbmcoKSxcbiAgb2JqZWN0OiB6LnN0cmluZygpLFxuICBjcmVhdGVkX3RpbWU6IHouc3RyaW5nKCksXG4gIGxhc3RfZWRpdGVkX3RpbWU6IHouc3RyaW5nKCksXG4gIGNyZWF0ZWRfYnk6IHoub2JqZWN0KHtcbiAgICBvYmplY3Q6IHouc3RyaW5nKCksXG4gICAgaWQ6IHouc3RyaW5nKClcbiAgfSksXG4gIGxhc3RfZWRpdGVkX2J5OiB6Lm9iamVjdCh7XG4gICAgb2JqZWN0OiB6LnN0cmluZygpLFxuICAgIGlkOiB6LnN0cmluZygpXG4gIH0pLFxuICBwYXJlbnQ6IHoub2JqZWN0KHtcbiAgICB0eXBlOiB6LnN0cmluZygpLFxuICAgIHBhZ2VfaWQ6IHoudW5pb24oW3ouc3RyaW5nKCksIHoubnVsbCgpXSksXG4gICAgZGF0YWJhc2VfaWQ6IHoudW5pb24oW3ouc3RyaW5nKCksIHoubnVsbCgpXSlcbiAgfSksXG4gIGFyY2hpdmVkOiB6LmJvb2xlYW4oKSxcbiAgaW5fdHJhc2g6IHouYm9vbGVhbigpLFxuICBwcm9wZXJ0aWVzOiB6LnJlY29yZCh6LnN0cmluZygpLCB6LmFueSgpKSxcbiAgdXJsOiB6LnN0cmluZygpLFxuICBwdWJsaWNfdXJsOiB6LnVuaW9uKFt6LnN0cmluZygpLCB6Lm51bGwoKV0pXG59KTtcbmNvbnN0IGFjdGlvbiA9IHtcbiAgdHlwZTogXCJhY3Rpb25cIixcbiAgZGVzY3JpcHRpb246ICdDcmVhdGVzIGEgbmV3IHBhZ2UgYXMgY2hpbGQgb2YgYSBwYWdlIG9yIGRhdGFiYXNlIHdpdGggb3B0aW9uYWwgY29udGVudCBibG9ja3MuJyxcbiAgdmVyc2lvbjogJzEuMC4wJyxcbiAgZW5kcG9pbnQ6IHtcbiAgICBtZXRob2Q6ICdQT1NUJyxcbiAgICBwYXRoOiAnL3BhZ2VzJyxcbiAgICBncm91cDogJ1BhZ2VzJ1xuICB9LFxuICBpbnB1dDogSW5wdXRTY2hlbWEsXG4gIG91dHB1dDogT3V0cHV0U2NoZW1hLFxuICBzY29wZXM6IFtdLFxuICBleGVjOiBhc3luYyAobmFuZ28sIGlucHV0KTogUHJvbWlzZTx6LmluZmVyPHR5cGVvZiBPdXRwdXRTY2hlbWE+PiA9PiB7XG4gICAgY29uc3QgY29uZmlnOiBQcm94eUNvbmZpZ3VyYXRpb24gPSB7XG4gICAgICAvLyBodHRwczovL2RldmVsb3BlcnMubm90aW9uLmNvbS9yZWZlcmVuY2UvcG9zdC1wYWdlXG4gICAgICBlbmRwb2ludDogJ3YxL3BhZ2VzJyxcbiAgICAgIGRhdGE6IHtcbiAgICAgICAgcGFyZW50OiBpbnB1dC5wYXJlbnQsXG4gICAgICAgIHByb3BlcnRpZXM6IGlucHV0LnByb3BlcnRpZXMsXG4gICAgICAgIC4uLihpbnB1dC5jaGlsZHJlbiAmJiB7XG4gICAgICAgICAgY2hpbGRyZW46IGlucHV0LmNoaWxkcmVuXG4gICAgICAgIH0pLFxuICAgICAgICAuLi4oaW5wdXQuaWNvbiAmJiB7XG4gICAgICAgICAgaWNvbjogaW5wdXQuaWNvblxuICAgICAgICB9KSxcbiAgICAgICAgLi4uKGlucHV0LmNvdmVyICYmIHtcbiAgICAgICAgICBjb3ZlcjogaW5wdXQuY292ZXJcbiAgICAgICAgfSlcbiAgICAgIH0sXG4gICAgICByZXRyaWVzOiAzXG4gICAgfTtcbiAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IG5hbmdvLnBvc3QoY29uZmlnKTtcbiAgICBjb25zdCBkYXRhID0gcmVzcG9uc2UuZGF0YTtcbiAgICByZXR1cm4ge1xuICAgICAgaWQ6IGRhdGEuaWQsXG4gICAgICBvYmplY3Q6IGRhdGEub2JqZWN0LFxuICAgICAgY3JlYXRlZF90aW1lOiBkYXRhLmNyZWF0ZWRfdGltZSxcbiAgICAgIGxhc3RfZWRpdGVkX3RpbWU6IGRhdGEubGFzdF9lZGl0ZWRfdGltZSxcbiAgICAgIGNyZWF0ZWRfYnk6IHtcbiAgICAgICAgb2JqZWN0OiBkYXRhLmNyZWF0ZWRfYnkub2JqZWN0LFxuICAgICAgICBpZDogZGF0YS5jcmVhdGVkX2J5LmlkXG4gICAgICB9LFxuICAgICAgbGFzdF9lZGl0ZWRfYnk6IHtcbiAgICAgICAgb2JqZWN0OiBkYXRhLmxhc3RfZWRpdGVkX2J5Lm9iamVjdCxcbiAgICAgICAgaWQ6IGRhdGEubGFzdF9lZGl0ZWRfYnkuaWRcbiAgICAgIH0sXG4gICAgICBwYXJlbnQ6IHtcbiAgICAgICAgdHlwZTogZGF0YS5wYXJlbnQudHlwZSxcbiAgICAgICAgcGFnZV9pZDogZGF0YS5wYXJlbnQucGFnZV9pZCA/PyBudWxsLFxuICAgICAgICBkYXRhYmFzZV9pZDogZGF0YS5wYXJlbnQuZGF0YWJhc2VfaWQgPz8gbnVsbFxuICAgICAgfSxcbiAgICAgIGFyY2hpdmVkOiBkYXRhLmFyY2hpdmVkLFxuICAgICAgaW5fdHJhc2g6IGRhdGEuaW5fdHJhc2gsXG4gICAgICBwcm9wZXJ0aWVzOiBkYXRhLnByb3BlcnRpZXMsXG4gICAgICB1cmw6IGRhdGEudXJsLFxuICAgICAgcHVibGljX3VybDogZGF0YS5wdWJsaWNfdXJsID8/IG51bGxcbiAgICB9O1xuICB9XG59O1xuZXhwb3J0IHR5cGUgTmFuZ29BY3Rpb25Mb2NhbCA9IFBhcmFtZXRlcnM8KHR5cGVvZiBhY3Rpb24pWydleGVjJ10+WzBdO1xuZXhwb3J0IGRlZmF1bHQgYWN0aW9uOyJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLGlCQUFrQjtBQUtsQixJQUFNLGNBQWMsYUFBRSxPQUFPO0FBQUEsRUFDM0IsUUFBUSxhQUFFLE9BQU87QUFBQSxJQUNmLFNBQVMsYUFBRSxPQUFPLEVBQUUsU0FBUyxFQUFFLFNBQVMsaUVBQWlFO0FBQUEsSUFDekcsYUFBYSxhQUFFLE9BQU8sRUFBRSxTQUFTLEVBQUUsU0FBUyxxRUFBcUU7QUFBQSxFQUNuSCxDQUFDLEVBQUUsU0FBUyxzRUFBc0U7QUFBQSxFQUNsRixZQUFZLGFBQUUsT0FBTyxhQUFFLE9BQU8sR0FBRyxhQUFFLElBQUksQ0FBQyxFQUFFLFNBQVMsc0hBQXNIO0FBQUEsRUFDekssVUFBVSxhQUFFLE1BQU0sYUFBRSxJQUFJLENBQUMsRUFBRSxTQUFTLEVBQUUsU0FBUyxnREFBZ0Q7QUFBQSxFQUMvRixNQUFNLGFBQUUsT0FBTztBQUFBLElBQ2IsTUFBTSxhQUFFLE9BQU8sRUFBRSxTQUFTO0FBQUEsSUFDMUIsT0FBTyxhQUFFLE9BQU8sRUFBRSxTQUFTO0FBQUEsSUFDM0IsVUFBVSxhQUFFLE9BQU87QUFBQSxNQUNqQixLQUFLLGFBQUUsT0FBTztBQUFBLElBQ2hCLENBQUMsRUFBRSxTQUFTO0FBQUEsRUFDZCxDQUFDLEVBQUUsU0FBUyxFQUFFLFNBQVMscUNBQXFDO0FBQUEsRUFDNUQsT0FBTyxhQUFFLE9BQU87QUFBQSxJQUNkLE1BQU0sYUFBRSxPQUFPLEVBQUUsU0FBUztBQUFBLElBQzFCLFVBQVUsYUFBRSxPQUFPO0FBQUEsTUFDakIsS0FBSyxhQUFFLE9BQU87QUFBQSxJQUNoQixDQUFDLEVBQUUsU0FBUztBQUFBLEVBQ2QsQ0FB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
