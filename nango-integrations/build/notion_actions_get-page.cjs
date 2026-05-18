"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
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
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// notion/actions/get-page.ts
var get_page_exports = {};
__export(get_page_exports, {
  default: () => get_page_default
});
module.exports = __toCommonJS(get_page_exports);
var z = __toESM(require("zod"), 1);
var inputSchema = z.object({
  page_id: z.string().describe("The Notion page ID to retrieve")
});
var blockSchema = z.object({
  id: z.string(),
  type: z.string(),
  text: z.string().optional()
});
var outputSchema = z.object({
  id: z.string(),
  title: z.string(),
  url: z.string().optional(),
  created_time: z.string().optional(),
  last_edited_time: z.string().optional(),
  properties: z.record(z.string(), z.unknown()),
  blocks: z.array(blockSchema)
});
function extractBlockText(block) {
  const richText = block[block.type]?.rich_text;
  if (!richText) return "";
  return richText.map((t) => t.plain_text).join("");
}
var action = {
  type: "action",
  description: "Get a Notion page with its properties and content blocks",
  version: "1.0.0",
  endpoint: {
    method: "GET",
    path: "/notion/pages/{page_id}",
    group: "Pages"
  },
  input: inputSchema,
  output: outputSchema,
  exec: async (nango, input) => {
    const [pageRes, blocksRes] = await Promise.all([nango.proxy({
      method: "GET",
      endpoint: `/v1/pages/${input.page_id}`,
      headers: {
        "Notion-Version": "2022-06-28"
      }
    }), nango.proxy({
      method: "GET",
      endpoint: `/v1/blocks/${input.page_id}/children`,
      params: {
        page_size: "100"
      },
      headers: {
        "Notion-Version": "2022-06-28"
      }
    })]);
    if (pageRes.data?.object === "error") {
      throw new Error(`Notion API error: ${pageRes.data.message}`);
    }
    if (blocksRes.data?.object === "error") {
      throw new Error(`Notion API error (blocks): ${blocksRes.data.message}`);
    }
    const page = pageRes.data;
    const titleProp = page.properties?.title ?? page.properties?.Name;
    const titleArr = titleProp?.title ?? [];
    const title = titleArr.map((t) => t.plain_text).join("") || "Untitled";
    const properties = {};
    for (const [key, val] of Object.entries(page.properties || {})) {
      const prop = val;
      if (prop.type === "title") {
        properties[key] = prop.title?.map((t) => t.plain_text).join("");
      } else if (prop.type === "rich_text") {
        properties[key] = prop.rich_text?.map((t) => t.plain_text).join("");
      } else if (prop.type === "number") {
        properties[key] = prop.number;
      } else if (prop.type === "select") {
        properties[key] = prop.select?.name;
      } else if (prop.type === "checkbox") {
        properties[key] = prop.checkbox;
      } else if (prop.type === "date") {
        properties[key] = prop.date?.start;
      } else {
        properties[key] = `[${prop.type}]`;
      }
    }
    const blocks = (blocksRes.data?.results || []).map((b) => ({
      id: b.id,
      type: b.type,
      text: extractBlockText(b) || void 0
    }));
    return {
      id: page.id,
      title,
      url: page.url,
      created_time: page.created_time,
      last_edited_time: page.last_edited_time,
      properties,
      blocks
    };
  }
};
var get_page_default = action;
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsibm90aW9uL2FjdGlvbnMvZ2V0LXBhZ2UudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImltcG9ydCB7IGNyZWF0ZUFjdGlvbiB9IGZyb20gJ25hbmdvJztcbmltcG9ydCAqIGFzIHogZnJvbSAnem9kJztcbmNvbnN0IGlucHV0U2NoZW1hID0gei5vYmplY3Qoe1xuICBwYWdlX2lkOiB6LnN0cmluZygpLmRlc2NyaWJlKCdUaGUgTm90aW9uIHBhZ2UgSUQgdG8gcmV0cmlldmUnKVxufSk7XG5jb25zdCBibG9ja1NjaGVtYSA9IHoub2JqZWN0KHtcbiAgaWQ6IHouc3RyaW5nKCksXG4gIHR5cGU6IHouc3RyaW5nKCksXG4gIHRleHQ6IHouc3RyaW5nKCkub3B0aW9uYWwoKVxufSk7XG5jb25zdCBvdXRwdXRTY2hlbWEgPSB6Lm9iamVjdCh7XG4gIGlkOiB6LnN0cmluZygpLFxuICB0aXRsZTogei5zdHJpbmcoKSxcbiAgdXJsOiB6LnN0cmluZygpLm9wdGlvbmFsKCksXG4gIGNyZWF0ZWRfdGltZTogei5zdHJpbmcoKS5vcHRpb25hbCgpLFxuICBsYXN0X2VkaXRlZF90aW1lOiB6LnN0cmluZygpLm9wdGlvbmFsKCksXG4gIHByb3BlcnRpZXM6IHoucmVjb3JkKHouc3RyaW5nKCksIHoudW5rbm93bigpKSxcbiAgYmxvY2tzOiB6LmFycmF5KGJsb2NrU2NoZW1hKVxufSk7XG5cbi8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tZXhwbGljaXQtYW55XG5mdW5jdGlvbiBleHRyYWN0QmxvY2tUZXh0KGJsb2NrOiBhbnkpOiBzdHJpbmcge1xuICBjb25zdCByaWNoVGV4dCA9IGJsb2NrW2Jsb2NrLnR5cGVdPy5yaWNoX3RleHQ7XG4gIGlmICghcmljaFRleHQpIHJldHVybiAnJztcbiAgcmV0dXJuIHJpY2hUZXh0Lm1hcCgodDoge1xuICAgIHBsYWluX3RleHQ6IHN0cmluZztcbiAgfSkgPT4gdC5wbGFpbl90ZXh0KS5qb2luKCcnKTtcbn1cbmNvbnN0IGFjdGlvbiA9IHtcbiAgdHlwZTogXCJhY3Rpb25cIixcbiAgZGVzY3JpcHRpb246ICdHZXQgYSBOb3Rpb24gcGFnZSB3aXRoIGl0cyBwcm9wZXJ0aWVzIGFuZCBjb250ZW50IGJsb2NrcycsXG4gIHZlcnNpb246ICcxLjAuMCcsXG4gIGVuZHBvaW50OiB7XG4gICAgbWV0aG9kOiAnR0VUJyxcbiAgICBwYXRoOiAnL25vdGlvbi9wYWdlcy97cGFnZV9pZH0nLFxuICAgIGdyb3VwOiAnUGFnZXMnXG4gIH0sXG4gIGlucHV0OiBpbnB1dFNjaGVtYSxcbiAgb3V0cHV0OiBvdXRwdXRTY2hlbWEsXG4gIGV4ZWM6IGFzeW5jIChuYW5nbywgaW5wdXQpID0+IHtcbiAgICAvLyBGZXRjaCBwYWdlICsgYmxvY2tzIGluIHBhcmFsbGVsXG4gICAgY29uc3QgW3BhZ2VSZXMsIGJsb2Nrc1Jlc10gPSBhd2FpdCBQcm9taXNlLmFsbChbbmFuZ28ucHJveHkoe1xuICAgICAgbWV0aG9kOiAnR0VUJyxcbiAgICAgIGVuZHBvaW50OiBgL3YxL3BhZ2VzLyR7aW5wdXQucGFnZV9pZH1gLFxuICAgICAgaGVhZGVyczoge1xuICAgICAgICAnTm90aW9uLVZlcnNpb24nOiAnMjAyMi0wNi0yOCdcbiAgICAgIH1cbiAgICB9KSwgbmFuZ28ucHJveHkoe1xuICAgICAgbWV0aG9kOiAnR0VUJyxcbiAgICAgIGVuZHBvaW50OiBgL3YxL2Jsb2Nrcy8ke2lucHV0LnBhZ2VfaWR9L2NoaWxkcmVuYCxcbiAgICAgIHBhcmFtczoge1xuICAgICAgICBwYWdlX3NpemU6ICcxMDAnXG4gICAgICB9LFxuICAgICAgaGVhZGVyczoge1xuICAgICAgICAnTm90aW9uLVZlcnNpb24nOiAnMjAyMi0wNi0yOCdcbiAgICAgIH1cbiAgICB9KV0pO1xuICAgIGlmIChwYWdlUmVzLmRhdGE/Lm9iamVjdCA9PT0gJ2Vycm9yJykge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKGBOb3Rpb24gQVBJIGVycm9yOiAke3BhZ2VSZXMuZGF0YS5tZXNzYWdlfWApO1xuICAgIH1cbiAgICBpZiAoYmxvY2tzUmVzLmRhdGE/Lm9iamVjdCA9PT0gJ2Vycm9yJykge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKGBOb3Rpb24gQVBJIGVycm9yIChibG9ja3MpOiAke2Jsb2Nrc1Jlcy5kYXRhLm1lc3NhZ2V9YCk7XG4gICAgfVxuICAgIGNvbnN0IHBhZ2UgPSBwYWdlUmVzLmRhdGE7XG4gICAgY29uc3QgdGl0bGVQcm9wID0gcGFnZS5wcm9wZXJ0aWVzPy50aXRsZSA/PyBwYWdlLnByb3BlcnRpZXM/Lk5hbWU7XG4gICAgY29uc3QgdGl0bGVBcnIgPSB0aXRsZVByb3A/LnRpdGxlID8/IFtdO1xuICAgIGNvbnN0IHRpdGxlID0gdGl0bGVBcnIubWFwKCh0OiB7XG4gICAgICBwbGFpbl90ZXh0OiBzdHJpbmc7XG4gICAgfSkgPT4gdC5wbGFpbl90ZXh0KS5qb2luKCcnKSB8fCAnVW50aXRsZWQnO1xuXG4gICAgLy8gU2ltcGxpZnkgcHJvcGVydGllc1xuICAgIGNvbnN0IHByb3BlcnRpZXM6IFJlY29yZDxzdHJpbmcsIHVua25vd24+ID0ge307XG4gICAgZm9yIChjb25zdCBba2V5LCB2YWxdIG9mIE9iamVjdC5lbnRyaWVzKHBhZ2UucHJvcGVydGllcyB8fCB7fSkpIHtcbiAgICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tZXhwbGljaXQtYW55XG4gICAgICBjb25zdCBwcm9wID0gdmFsIGFzIGFueTtcbiAgICAgIGlmIChwcm9wLnR5cGUgPT09ICd0aXRsZScpIHtcbiAgICAgICAgcHJvcGVydGllc1trZXldID0gcHJvcC50aXRsZT8ubWFwKCh0OiB7XG4gICAgICAgICAgcGxhaW5fdGV4dDogc3RyaW5nO1xuICAgICAgICB9KSA9PiB0LnBsYWluX3RleHQpLmpvaW4oJycpO1xuICAgICAgfSBlbHNlIGlmIChwcm9wLnR5cGUgPT09ICdyaWNoX3RleHQnKSB7XG4gICAgICAgIHByb3BlcnRpZXNba2V5XSA9IHByb3AucmljaF90ZXh0Py5tYXAoKHQ6IHtcbiAgICAgICAgICBwbGFpbl90ZXh0OiBzdHJpbmc7XG4gICAgICAgIH0pID0+IHQucGxhaW5fdGV4dCkuam9pbignJyk7XG4gICAgICB9IGVsc2UgaWYgKHByb3AudHlwZSA9PT0gJ251bWJlcicpIHtcbiAgICAgICAgcHJvcGVydGllc1trZXldID0gcHJvcC5udW1iZXI7XG4gICAgICB9IGVsc2UgaWYgKHByb3AudHlwZSA9PT0gJ3NlbGVjdCcpIHtcbiAgICAgICAgcHJvcGVydGllc1trZXldID0gcHJvcC5zZWxlY3Q/Lm5hbWU7XG4gICAgICB9IGVsc2UgaWYgKHByb3AudHlwZSA9PT0gJ2NoZWNrYm94Jykge1xuICAgICAgICBwcm9wZXJ0aWVzW2tleV0gPSBwcm9wLmNoZWNrYm94O1xuICAgICAgfSBlbHNlIGlmIChwcm9wLnR5cGUgPT09ICdkYXRlJykge1xuICAgICAgICBwcm9wZXJ0aWVzW2tleV0gPSBwcm9wLmRhdGU/LnN0YXJ0O1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcHJvcGVydGllc1trZXldID0gYFske3Byb3AudHlwZX1dYDtcbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBFeHRyYWN0IGJsb2NrIGNvbnRlbnRcbiAgICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgQHR5cGVzY3JpcHQtZXNsaW50L25vLWV4cGxpY2l0LWFueVxuICAgIGNvbnN0IGJsb2NrcyA9IChibG9ja3NSZXMuZGF0YT8ucmVzdWx0cyB8fCBbXSkubWFwKChiOiBhbnkpID0+ICh7XG4gICAgICBpZDogYi5pZCxcbiAgICAgIHR5cGU6IGIudHlwZSxcbiAgICAgIHRleHQ6IGV4dHJhY3RCbG9ja1RleHQoYikgfHwgdW5kZWZpbmVkXG4gICAgfSkpO1xuICAgIHJldHVybiB7XG4gICAgICBpZDogcGFnZS5pZCxcbiAgICAgIHRpdGxlLFxuICAgICAgdXJsOiBwYWdlLnVybCxcbiAgICAgIGNyZWF0ZWRfdGltZTogcGFnZS5jcmVhdGVkX3RpbWUsXG4gICAgICBsYXN0X2VkaXRlZF90aW1lOiBwYWdlLmxhc3RfZWRpdGVkX3RpbWUsXG4gICAgICBwcm9wZXJ0aWVzLFxuICAgICAgYmxvY2tzXG4gICAgfTtcbiAgfVxufTtcbmV4cG9ydCBkZWZhdWx0IGFjdGlvbjsiXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQ0EsUUFBbUI7QUFDbkIsSUFBTSxjQUFnQixTQUFPO0FBQUEsRUFDM0IsU0FBVyxTQUFPLEVBQUUsU0FBUyxnQ0FBZ0M7QUFDL0QsQ0FBQztBQUNELElBQU0sY0FBZ0IsU0FBTztBQUFBLEVBQzNCLElBQU0sU0FBTztBQUFBLEVBQ2IsTUFBUSxTQUFPO0FBQUEsRUFDZixNQUFRLFNBQU8sRUFBRSxTQUFTO0FBQzVCLENBQUM7QUFDRCxJQUFNLGVBQWlCLFNBQU87QUFBQSxFQUM1QixJQUFNLFNBQU87QUFBQSxFQUNiLE9BQVMsU0FBTztBQUFBLEVBQ2hCLEtBQU8sU0FBTyxFQUFFLFNBQVM7QUFBQSxFQUN6QixjQUFnQixTQUFPLEVBQUUsU0FBUztBQUFBLEVBQ2xDLGtCQUFvQixTQUFPLEVBQUUsU0FBUztBQUFBLEVBQ3RDLFlBQWMsU0FBUyxTQUFPLEdBQUssVUFBUSxDQUFDO0FBQUEsRUFDNUMsUUFBVSxRQUFNLFdBQVc7QUFDN0IsQ0FBQztBQUdELFNBQVMsaUJBQWlCLE9BQW9CO0FBQzVDLFFBQU0sV0FBVyxNQUFNLE1BQU0sSUFBSSxHQUFHO0FBQ3BDLE1BQUksQ0FBQyxTQUFVLFFBQU87QUFDdEIsU0FBTyxTQUFTLElBQUksQ0FBQyxNQUVmLEVBQUUsVUFBVSxFQUFFLEtBQUssRUFBRTtBQUM3QjtBQUNBLElBQU0sU0FBUztBQUFBLEVBQ2IsTUFBTTtBQUFBLEVBQ04sYUFBYTtBQUFBLEVBQ2IsU0FBUztBQUFBLEVBQ1QsVUFBVTtBQUFBLElBQ1IsUUFBUTtBQUFBLElBQ1IsTUFBTTtBQUFBLElBQ04sT0FBTztB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
