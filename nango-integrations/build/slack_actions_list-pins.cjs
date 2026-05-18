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

// slack/actions/list-pins.ts
var list_pins_exports = {};
__export(list_pins_exports, {
  default: () => list_pins_default
});
module.exports = __toCommonJS(list_pins_exports);
var import_zod = require("zod");
var InputSchema = import_zod.z.object({
  channel_id: import_zod.z.string().describe('The channel ID to list pinned items for. Example: "C1234567890"')
});
var MessageSchema = import_zod.z.object({
  type: import_zod.z.string(),
  user: import_zod.z.string(),
  text: import_zod.z.string(),
  ts: import_zod.z.string(),
  permalink: import_zod.z.string(),
  pinned_to: import_zod.z.array(import_zod.z.string()).optional()
});
var FileSchema = import_zod.z.object({
  id: import_zod.z.string(),
  created: import_zod.z.number(),
  timestamp: import_zod.z.number(),
  name: import_zod.z.string().optional(),
  title: import_zod.z.string().optional(),
  mimetype: import_zod.z.string().optional(),
  filetype: import_zod.z.string().optional(),
  user: import_zod.z.string(),
  permalink: import_zod.z.string()
});
var CommentSchema = import_zod.z.object({
  id: import_zod.z.string(),
  created: import_zod.z.number(),
  timestamp: import_zod.z.number(),
  user: import_zod.z.string(),
  comment: import_zod.z.string()
});
var PinnedItemSchema = import_zod.z.object({
  type: import_zod.z.enum(["message", "file", "file_comment"]),
  created: import_zod.z.number().describe("Unix timestamp when the item was pinned"),
  created_by: import_zod.z.string().describe("User ID who pinned the item"),
  channel: import_zod.z.string().describe("Channel ID where the item is pinned"),
  message: MessageSchema.optional(),
  file: FileSchema.optional(),
  comment: CommentSchema.optional()
});
var OutputSchema = import_zod.z.object({
  items: import_zod.z.array(PinnedItemSchema).describe("List of pinned items in the channel")
});
var action = {
  type: "action",
  description: "List all items pinned in a specific channel",
  version: "1.0.0",
  endpoint: {
    method: "POST",
    path: "/actions/list-pins",
    group: "Pins"
  },
  input: InputSchema,
  output: OutputSchema,
  scopes: ["pins:read"],
  exec: async (nango, input) => {
    const response = await nango.get({
      endpoint: "pins.list",
      params: {
        channel: input.channel_id
      },
      retries: 3
    });
    if (!response.data || !response.data.ok) {
      throw new nango.ActionError({
        type: "slack_api_error",
        message: response.data?.error || "Failed to list pinned items",
        channel_id: input.channel_id
      });
    }
    return {
      items: response.data.items || []
    };
  }
};
var list_pins_default = action;
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsic2xhY2svYWN0aW9ucy9saXN0LXBpbnMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImltcG9ydCB7IHogfSBmcm9tICd6b2QnO1xuaW1wb3J0IHsgY3JlYXRlQWN0aW9uIH0gZnJvbSAnbmFuZ28nO1xuY29uc3QgSW5wdXRTY2hlbWEgPSB6Lm9iamVjdCh7XG4gIGNoYW5uZWxfaWQ6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ1RoZSBjaGFubmVsIElEIHRvIGxpc3QgcGlubmVkIGl0ZW1zIGZvci4gRXhhbXBsZTogXCJDMTIzNDU2Nzg5MFwiJylcbn0pO1xuY29uc3QgTWVzc2FnZVNjaGVtYSA9IHoub2JqZWN0KHtcbiAgdHlwZTogei5zdHJpbmcoKSxcbiAgdXNlcjogei5zdHJpbmcoKSxcbiAgdGV4dDogei5zdHJpbmcoKSxcbiAgdHM6IHouc3RyaW5nKCksXG4gIHBlcm1hbGluazogei5zdHJpbmcoKSxcbiAgcGlubmVkX3RvOiB6LmFycmF5KHouc3RyaW5nKCkpLm9wdGlvbmFsKClcbn0pO1xuY29uc3QgRmlsZVNjaGVtYSA9IHoub2JqZWN0KHtcbiAgaWQ6IHouc3RyaW5nKCksXG4gIGNyZWF0ZWQ6IHoubnVtYmVyKCksXG4gIHRpbWVzdGFtcDogei5udW1iZXIoKSxcbiAgbmFtZTogei5zdHJpbmcoKS5vcHRpb25hbCgpLFxuICB0aXRsZTogei5zdHJpbmcoKS5vcHRpb25hbCgpLFxuICBtaW1ldHlwZTogei5zdHJpbmcoKS5vcHRpb25hbCgpLFxuICBmaWxldHlwZTogei5zdHJpbmcoKS5vcHRpb25hbCgpLFxuICB1c2VyOiB6LnN0cmluZygpLFxuICBwZXJtYWxpbms6IHouc3RyaW5nKClcbn0pO1xuY29uc3QgQ29tbWVudFNjaGVtYSA9IHoub2JqZWN0KHtcbiAgaWQ6IHouc3RyaW5nKCksXG4gIGNyZWF0ZWQ6IHoubnVtYmVyKCksXG4gIHRpbWVzdGFtcDogei5udW1iZXIoKSxcbiAgdXNlcjogei5zdHJpbmcoKSxcbiAgY29tbWVudDogei5zdHJpbmcoKVxufSk7XG5jb25zdCBQaW5uZWRJdGVtU2NoZW1hID0gei5vYmplY3Qoe1xuICB0eXBlOiB6LmVudW0oWydtZXNzYWdlJywgJ2ZpbGUnLCAnZmlsZV9jb21tZW50J10pLFxuICBjcmVhdGVkOiB6Lm51bWJlcigpLmRlc2NyaWJlKCdVbml4IHRpbWVzdGFtcCB3aGVuIHRoZSBpdGVtIHdhcyBwaW5uZWQnKSxcbiAgY3JlYXRlZF9ieTogei5zdHJpbmcoKS5kZXNjcmliZSgnVXNlciBJRCB3aG8gcGlubmVkIHRoZSBpdGVtJyksXG4gIGNoYW5uZWw6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ0NoYW5uZWwgSUQgd2hlcmUgdGhlIGl0ZW0gaXMgcGlubmVkJyksXG4gIG1lc3NhZ2U6IE1lc3NhZ2VTY2hlbWEub3B0aW9uYWwoKSxcbiAgZmlsZTogRmlsZVNjaGVtYS5vcHRpb25hbCgpLFxuICBjb21tZW50OiBDb21tZW50U2NoZW1hLm9wdGlvbmFsKClcbn0pO1xuY29uc3QgT3V0cHV0U2NoZW1hID0gei5vYmplY3Qoe1xuICBpdGVtczogei5hcnJheShQaW5uZWRJdGVtU2NoZW1hKS5kZXNjcmliZSgnTGlzdCBvZiBwaW5uZWQgaXRlbXMgaW4gdGhlIGNoYW5uZWwnKVxufSk7XG5jb25zdCBhY3Rpb24gPSB7XG4gIHR5cGU6IFwiYWN0aW9uXCIsXG4gIGRlc2NyaXB0aW9uOiAnTGlzdCBhbGwgaXRlbXMgcGlubmVkIGluIGEgc3BlY2lmaWMgY2hhbm5lbCcsXG4gIHZlcnNpb246ICcxLjAuMCcsXG4gIGVuZHBvaW50OiB7XG4gICAgbWV0aG9kOiAnUE9TVCcsXG4gICAgcGF0aDogJy9hY3Rpb25zL2xpc3QtcGlucycsXG4gICAgZ3JvdXA6ICdQaW5zJ1xuICB9LFxuICBpbnB1dDogSW5wdXRTY2hlbWEsXG4gIG91dHB1dDogT3V0cHV0U2NoZW1hLFxuICBzY29wZXM6IFsncGluczpyZWFkJ10sXG4gIGV4ZWM6IGFzeW5jIChuYW5nbywgaW5wdXQpOiBQcm9taXNlPHouaW5mZXI8dHlwZW9mIE91dHB1dFNjaGVtYT4+ID0+IHtcbiAgICAvLyBodHRwczovL2FwaS5zbGFjay5jb20vbWV0aG9kcy9waW5zLmxpc3RcbiAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IG5hbmdvLmdldCh7XG4gICAgICBlbmRwb2ludDogJ3BpbnMubGlzdCcsXG4gICAgICBwYXJhbXM6IHtcbiAgICAgICAgY2hhbm5lbDogaW5wdXQuY2hhbm5lbF9pZFxuICAgICAgfSxcbiAgICAgIHJldHJpZXM6IDNcbiAgICB9KTtcbiAgICBpZiAoIXJlc3BvbnNlLmRhdGEgfHwgIXJlc3BvbnNlLmRhdGEub2spIHtcbiAgICAgIHRocm93IG5ldyBuYW5nby5BY3Rpb25FcnJvcih7XG4gICAgICAgIHR5cGU6ICdzbGFja19hcGlfZXJyb3InLFxuICAgICAgICBtZXNzYWdlOiByZXNwb25zZS5kYXRhPy5lcnJvciB8fCAnRmFpbGVkIHRvIGxpc3QgcGlubmVkIGl0ZW1zJyxcbiAgICAgICAgY2hhbm5lbF9pZDogaW5wdXQuY2hhbm5lbF9pZFxuICAgICAgfSk7XG4gICAgfVxuICAgIHJldHVybiB7XG4gICAgICBpdGVtczogcmVzcG9uc2UuZGF0YS5pdGVtcyB8fCBbXVxuICAgIH07XG4gIH1cbn07XG5leHBvcnQgdHlwZSBOYW5nb0FjdGlvbkxvY2FsID0gUGFyYW1ldGVyczwodHlwZW9mIGFjdGlvbilbJ2V4ZWMnXT5bMF07XG5leHBvcnQgZGVmYXVsdCBhY3Rpb247Il0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsaUJBQWtCO0FBRWxCLElBQU0sY0FBYyxhQUFFLE9BQU87QUFBQSxFQUMzQixZQUFZLGFBQUUsT0FBTyxFQUFFLFNBQVMsaUVBQWlFO0FBQ25HLENBQUM7QUFDRCxJQUFNLGdCQUFnQixhQUFFLE9BQU87QUFBQSxFQUM3QixNQUFNLGFBQUUsT0FBTztBQUFBLEVBQ2YsTUFBTSxhQUFFLE9BQU87QUFBQSxFQUNmLE1BQU0sYUFB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
