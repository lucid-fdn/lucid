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

// notion/actions/create-comment.ts
var create_comment_exports = {};
__export(create_comment_exports, {
  default: () => create_comment_default
});
module.exports = __toCommonJS(create_comment_exports);
var import_zod = require("zod");
var InputSchema = import_zod.z.object({
  parent: import_zod.z.object({
    page_id: import_zod.z.string().describe('Page ID to add comment to. Example: "2b6ce298-3121-80ae-bfe1-f8984b993639"')
  }).describe("Parent page for the comment."),
  rich_text: import_zod.z.array(import_zod.z.any()).describe("Comment content as rich text array."),
  discussion_id: import_zod.z.string().optional().describe("Discussion thread ID to reply to.")
});
var OutputSchema = import_zod.z.object({
  id: import_zod.z.string(),
  object: import_zod.z.string(),
  created_time: import_zod.z.string(),
  rich_text: import_zod.z.array(import_zod.z.any())
});
var action = {
  type: "action",
  description: "Adds a comment to a page or existing discussion thread.",
  version: "1.0.0",
  endpoint: {
    method: "POST",
    path: "/comments",
    group: "Comments"
  },
  input: InputSchema,
  output: OutputSchema,
  scopes: [],
  exec: async (nango, input) => {
    const config = {
      // https://developers.notion.com/reference/create-comment
      endpoint: "v1/comments",
      data: {
        parent: input.parent,
        rich_text: input.rich_text,
        ...input.discussion_id && {
          discussion_id: input.discussion_id
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
      rich_text: data.rich_text
    };
  }
};
var create_comment_default = action;
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsibm90aW9uL2FjdGlvbnMvY3JlYXRlLWNvbW1lbnQudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImltcG9ydCB7IHogfSBmcm9tICd6b2QnO1xuaW1wb3J0IHsgY3JlYXRlQWN0aW9uIH0gZnJvbSAnbmFuZ28nO1xuaW1wb3J0IHR5cGUgeyBQcm94eUNvbmZpZ3VyYXRpb24gfSBmcm9tICduYW5nbyc7XG5jb25zdCBJbnB1dFNjaGVtYSA9IHoub2JqZWN0KHtcbiAgcGFyZW50OiB6Lm9iamVjdCh7XG4gICAgcGFnZV9pZDogei5zdHJpbmcoKS5kZXNjcmliZSgnUGFnZSBJRCB0byBhZGQgY29tbWVudCB0by4gRXhhbXBsZTogXCIyYjZjZTI5OC0zMTIxLTgwYWUtYmZlMS1mODk4NGI5OTM2MzlcIicpXG4gIH0pLmRlc2NyaWJlKCdQYXJlbnQgcGFnZSBmb3IgdGhlIGNvbW1lbnQuJyksXG4gIHJpY2hfdGV4dDogei5hcnJheSh6LmFueSgpKS5kZXNjcmliZSgnQ29tbWVudCBjb250ZW50IGFzIHJpY2ggdGV4dCBhcnJheS4nKSxcbiAgZGlzY3Vzc2lvbl9pZDogei5zdHJpbmcoKS5vcHRpb25hbCgpLmRlc2NyaWJlKCdEaXNjdXNzaW9uIHRocmVhZCBJRCB0byByZXBseSB0by4nKVxufSk7XG5jb25zdCBPdXRwdXRTY2hlbWEgPSB6Lm9iamVjdCh7XG4gIGlkOiB6LnN0cmluZygpLFxuICBvYmplY3Q6IHouc3RyaW5nKCksXG4gIGNyZWF0ZWRfdGltZTogei5zdHJpbmcoKSxcbiAgcmljaF90ZXh0OiB6LmFycmF5KHouYW55KCkpXG59KTtcbmNvbnN0IGFjdGlvbiA9IHtcbiAgdHlwZTogXCJhY3Rpb25cIixcbiAgZGVzY3JpcHRpb246ICdBZGRzIGEgY29tbWVudCB0byBhIHBhZ2Ugb3IgZXhpc3RpbmcgZGlzY3Vzc2lvbiB0aHJlYWQuJyxcbiAgdmVyc2lvbjogJzEuMC4wJyxcbiAgZW5kcG9pbnQ6IHtcbiAgICBtZXRob2Q6ICdQT1NUJyxcbiAgICBwYXRoOiAnL2NvbW1lbnRzJyxcbiAgICBncm91cDogJ0NvbW1lbnRzJ1xuICB9LFxuICBpbnB1dDogSW5wdXRTY2hlbWEsXG4gIG91dHB1dDogT3V0cHV0U2NoZW1hLFxuICBzY29wZXM6IFtdLFxuICBleGVjOiBhc3luYyAobmFuZ28sIGlucHV0KTogUHJvbWlzZTx6LmluZmVyPHR5cGVvZiBPdXRwdXRTY2hlbWE+PiA9PiB7XG4gICAgY29uc3QgY29uZmlnOiBQcm94eUNvbmZpZ3VyYXRpb24gPSB7XG4gICAgICAvLyBodHRwczovL2RldmVsb3BlcnMubm90aW9uLmNvbS9yZWZlcmVuY2UvY3JlYXRlLWNvbW1lbnRcbiAgICAgIGVuZHBvaW50OiAndjEvY29tbWVudHMnLFxuICAgICAgZGF0YToge1xuICAgICAgICBwYXJlbnQ6IGlucHV0LnBhcmVudCxcbiAgICAgICAgcmljaF90ZXh0OiBpbnB1dC5yaWNoX3RleHQsXG4gICAgICAgIC4uLihpbnB1dC5kaXNjdXNzaW9uX2lkICYmIHtcbiAgICAgICAgICBkaXNjdXNzaW9uX2lkOiBpbnB1dC5kaXNjdXNzaW9uX2lkXG4gICAgICAgIH0pXG4gICAgICB9LFxuICAgICAgcmV0cmllczogM1xuICAgIH07XG4gICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBuYW5nby5wb3N0KGNvbmZpZyk7XG4gICAgY29uc3QgZGF0YSA9IHJlc3BvbnNlLmRhdGE7XG4gICAgcmV0dXJuIHtcbiAgICAgIGlkOiBkYXRhLmlkLFxuICAgICAgb2JqZWN0OiBkYXRhLm9iamVjdCxcbiAgICAgIGNyZWF0ZWRfdGltZTogZGF0YS5jcmVhdGVkX3RpbWUsXG4gICAgICByaWNoX3RleHQ6IGRhdGEucmljaF90ZXh0XG4gICAgfTtcbiAgfVxufTtcbmV4cG9ydCB0eXBlIE5hbmdvQWN0aW9uTG9jYWwgPSBQYXJhbWV0ZXJzPCh0eXBlb2YgYWN0aW9uKVsnZXhlYyddPlswXTtcbmV4cG9ydCBkZWZhdWx0IGFjdGlvbjsiXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxpQkFBa0I7QUFHbEIsSUFBTSxjQUFjLGFBQUUsT0FBTztBQUFBLEVBQzNCLFFBQVEsYUFBRSxPQUFPO0FBQUEsSUFDZixTQUFTLGFBQUUsT0FBTyxFQUFFLFNBQVMsNEVBQTRFO0FBQUEsRUFDM0csQ0FBQyxFQUFFLFNBQVMsOEJBQThCO0FBQUEsRUFDMUMsV0FBVyxhQUFFLE1BQU0sYUFBRSxJQUFJLENBQUMsRUFBRSxTQUFTLHFDQUFxQztBQUFBLEVBQzFFLGVBQWUsYUFBRSxPQUFPLEVBQUUsU0FBUyxFQUFFLFNBQVMsbUNBQW1DO0FBQ25GLENBQUM7QUFDRCxJQUFNLGVBQWUsYUFBRSxPQUFPO0FBQUEsRUFDNUIsSUFBSSxhQUFFLE9BQU87QUFBQSxFQUNiLFFBQVEsYUFBRSxPQUFPO0FBQUEsRUFDakIsY0FBYyxhQUFFLE9BQU87QUFBQSxFQUN2QixXQUFXLGFBQUUsTUFBTSxhQUFFLElBQUksQ0FBQztBQUM1QixDQUFDO0FBQ0QsSUFBTSxTQUFTO0FBQUEsRUFDYixNQUFNO0FBQUEsRUFDTixhQUFhO0FBQUEsRUFDYixTQUFTO0FBQUEsRUFDVCxVQUFVO0FBQUEsSUFDUixRQUFRO0FBQUEsSUFDUixNQUFNO0FBQUEsSUFDTixPQUFPO0FBQUEsRUFDVDtBQUFBLEVBQ0EsT0FBTztBQUFBLEVBQ1AsUUFBUTtBQUFBLEVBQ1IsUUFBUSxDQUFDO0FBQUEsRUFDVCxNQUFNLE9BQU8sT0FBTyxVQUFpRDtBQUNuRSxVQUFNLFNBQTZCO0FBQUE7QUFBQSxNQUVqQyxVQUFVO0FBQUEsTUFDVixNQUFNO0FBQUEsUUFDSixRQUFRLE1BQU07QUFBQSxRQUNkLFdBQVcsTUFBTTtBQUFBLFFBQ2pCLEdBQUksTUFBTSxpQkFBaUI7QUFBQSxVQUN6QixlQUFlLE1BQU07QUFBQSxRQUN2QjtBQUFBLE1BQ0Y7QUFBQSxNQUNBLFNBQVM7QUFBQSxJQUNYO0FBQ0EsVUFBTSxXQUFXLE1BQU0sTUFBTSxLQUFLLE1BQU07QUFDeEMsVUFBTSxPQUFPLFNBQVM7QUFDdEIsV0FBTztBQUFBLE1BQ0wsSUFBSSxLQUFLO0FBQUEsTUFDVCxRQUFRLEtBQUs7QUFBQSxNQUNiLGNBQWMsS0FBSztBQUFBLE1BQ25CLFdBQVcsS0FBSztBQUFBLElBQ2xCO0FBQUEsRUFDRjtBQUNGO0FBRUEsSUFBTyx5QkFBUTsiLAogICJuYW1lcyI6IFtdCn0K
