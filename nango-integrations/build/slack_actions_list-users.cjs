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

// slack/actions/list-users.ts
var list_users_exports = {};
__export(list_users_exports, {
  default: () => list_users_default
});
module.exports = __toCommonJS(list_users_exports);
var import_zod = require("zod");
var UserSchema = import_zod.z.object({
  id: import_zod.z.string(),
  team_id: import_zod.z.string(),
  name: import_zod.z.string(),
  deleted: import_zod.z.boolean(),
  real_name: import_zod.z.string().optional(),
  profile: import_zod.z.object({
    real_name: import_zod.z.string().optional(),
    display_name: import_zod.z.string().optional(),
    email: import_zod.z.string().optional(),
    avatar_hash: import_zod.z.string().optional(),
    image_24: import_zod.z.string().optional(),
    image_32: import_zod.z.string().optional(),
    image_48: import_zod.z.string().optional(),
    image_72: import_zod.z.string().optional(),
    image_192: import_zod.z.string().optional(),
    image_512: import_zod.z.string().optional()
  }).passthrough(),
  is_admin: import_zod.z.boolean(),
  is_owner: import_zod.z.boolean(),
  is_bot: import_zod.z.boolean(),
  updated: import_zod.z.number()
});
var InputSchema = import_zod.z.object({
  cursor: import_zod.z.string().optional().describe("Pagination cursor from previous response. Omit for first page.")
});
var OutputSchema = import_zod.z.object({
  items: import_zod.z.array(UserSchema),
  next_cursor: import_zod.z.string().optional().describe("Pagination cursor for the next page. Omitted if no more pages.")
});
var action = {
  type: "action",
  description: "List all users in the workspace",
  version: "1.0.0",
  endpoint: {
    method: "POST",
    path: "/actions/list-users",
    group: "Users"
  },
  input: InputSchema,
  output: OutputSchema,
  scopes: ["users:read"],
  exec: async (nango, input) => {
    const config = {
      endpoint: "users.list",
      params: {
        limit: "200",
        ...input.cursor && {
          cursor: input.cursor
        }
      },
      retries: 3
    };
    const response = await nango.get(config);
    if (!response.data || !response.data.members) {
      throw new nango.ActionError({
        type: "api_error",
        message: "Unexpected API response: missing members data"
      });
    }
    const members = response.data.members.map((member) => ({
      id: member.id,
      team_id: member.team_id,
      name: member.name,
      deleted: member.deleted,
      real_name: member.real_name ?? void 0,
      profile: {
        real_name: member.profile?.real_name ?? void 0,
        display_name: member.profile?.display_name ?? void 0,
        email: member.profile?.email ?? void 0,
        avatar_hash: member.profile?.avatar_hash ?? void 0,
        image_24: member.profile?.image_24 ?? void 0,
        image_32: member.profile?.image_32 ?? void 0,
        image_48: member.profile?.image_48 ?? void 0,
        image_72: member.profile?.image_72 ?? void 0,
        image_192: member.profile?.image_192 ?? void 0,
        image_512: member.profile?.image_512 ?? void 0
      },
      is_admin: member.is_admin ?? false,
      is_owner: member.is_owner ?? false,
      is_bot: member.is_bot ?? false,
      updated: member.updated ?? 0
    }));
    return {
      items: members,
      next_cursor: response.data.response_metadata?.next_cursor || void 0
    };
  }
};
var list_users_default = action;
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsic2xhY2svYWN0aW9ucy9saXN0LXVzZXJzLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyJpbXBvcnQgeyB6IH0gZnJvbSAnem9kJztcbmltcG9ydCB7IGNyZWF0ZUFjdGlvbiB9IGZyb20gJ25hbmdvJztcbmNvbnN0IFVzZXJTY2hlbWEgPSB6Lm9iamVjdCh7XG4gIGlkOiB6LnN0cmluZygpLFxuICB0ZWFtX2lkOiB6LnN0cmluZygpLFxuICBuYW1lOiB6LnN0cmluZygpLFxuICBkZWxldGVkOiB6LmJvb2xlYW4oKSxcbiAgcmVhbF9uYW1lOiB6LnN0cmluZygpLm9wdGlvbmFsKCksXG4gIHByb2ZpbGU6IHoub2JqZWN0KHtcbiAgICByZWFsX25hbWU6IHouc3RyaW5nKCkub3B0aW9uYWwoKSxcbiAgICBkaXNwbGF5X25hbWU6IHouc3RyaW5nKCkub3B0aW9uYWwoKSxcbiAgICBlbWFpbDogei5zdHJpbmcoKS5vcHRpb25hbCgpLFxuICAgIGF2YXRhcl9oYXNoOiB6LnN0cmluZygpLm9wdGlvbmFsKCksXG4gICAgaW1hZ2VfMjQ6IHouc3RyaW5nKCkub3B0aW9uYWwoKSxcbiAgICBpbWFnZV8zMjogei5zdHJpbmcoKS5vcHRpb25hbCgpLFxuICAgIGltYWdlXzQ4OiB6LnN0cmluZygpLm9wdGlvbmFsKCksXG4gICAgaW1hZ2VfNzI6IHouc3RyaW5nKCkub3B0aW9uYWwoKSxcbiAgICBpbWFnZV8xOTI6IHouc3RyaW5nKCkub3B0aW9uYWwoKSxcbiAgICBpbWFnZV81MTI6IHouc3RyaW5nKCkub3B0aW9uYWwoKVxuICB9KS5wYXNzdGhyb3VnaCgpLFxuICBpc19hZG1pbjogei5ib29sZWFuKCksXG4gIGlzX293bmVyOiB6LmJvb2xlYW4oKSxcbiAgaXNfYm90OiB6LmJvb2xlYW4oKSxcbiAgdXBkYXRlZDogei5udW1iZXIoKVxufSk7XG5jb25zdCBJbnB1dFNjaGVtYSA9IHoub2JqZWN0KHtcbiAgY3Vyc29yOiB6LnN0cmluZygpLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ1BhZ2luYXRpb24gY3Vyc29yIGZyb20gcHJldmlvdXMgcmVzcG9uc2UuIE9taXQgZm9yIGZpcnN0IHBhZ2UuJylcbn0pO1xuY29uc3QgT3V0cHV0U2NoZW1hID0gei5vYmplY3Qoe1xuICBpdGVtczogei5hcnJheShVc2VyU2NoZW1hKSxcbiAgbmV4dF9jdXJzb3I6IHouc3RyaW5nKCkub3B0aW9uYWwoKS5kZXNjcmliZSgnUGFnaW5hdGlvbiBjdXJzb3IgZm9yIHRoZSBuZXh0IHBhZ2UuIE9taXR0ZWQgaWYgbm8gbW9yZSBwYWdlcy4nKVxufSk7XG5jb25zdCBhY3Rpb24gPSB7XG4gIHR5cGU6IFwiYWN0aW9uXCIsXG4gIGRlc2NyaXB0aW9uOiAnTGlzdCBhbGwgdXNlcnMgaW4gdGhlIHdvcmtzcGFjZScsXG4gIHZlcnNpb246ICcxLjAuMCcsXG4gIGVuZHBvaW50OiB7XG4gICAgbWV0aG9kOiAnUE9TVCcsXG4gICAgcGF0aDogJy9hY3Rpb25zL2xpc3QtdXNlcnMnLFxuICAgIGdyb3VwOiAnVXNlcnMnXG4gIH0sXG4gIGlucHV0OiBJbnB1dFNjaGVtYSxcbiAgb3V0cHV0OiBPdXRwdXRTY2hlbWEsXG4gIHNjb3BlczogWyd1c2VyczpyZWFkJ10sXG4gIGV4ZWM6IGFzeW5jIChuYW5nbywgaW5wdXQpOiBQcm9taXNlPHouaW5mZXI8dHlwZW9mIE91dHB1dFNjaGVtYT4+ID0+IHtcbiAgICAvLyBodHRwczovL2FwaS5zbGFjay5jb20vbWV0aG9kcy91c2Vycy5saXN0XG4gICAgY29uc3QgY29uZmlnID0ge1xuICAgICAgZW5kcG9pbnQ6ICd1c2Vycy5saXN0JyxcbiAgICAgIHBhcmFtczoge1xuICAgICAgICBsaW1pdDogJzIwMCcsXG4gICAgICAgIC4uLihpbnB1dC5jdXJzb3IgJiYge1xuICAgICAgICAgIGN1cnNvcjogaW5wdXQuY3Vyc29yXG4gICAgICAgIH0pXG4gICAgICB9LFxuICAgICAgcmV0cmllczogM1xuICAgIH07XG4gICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBuYW5nby5nZXQoY29uZmlnKTtcbiAgICBpZiAoIXJlc3BvbnNlLmRhdGEgfHwgIXJlc3BvbnNlLmRhdGEubWVtYmVycykge1xuICAgICAgdGhyb3cgbmV3IG5hbmdvLkFjdGlvbkVycm9yKHtcbiAgICAgICAgdHlwZTogJ2FwaV9lcnJvcicsXG4gICAgICAgIG1lc3NhZ2U6ICdVbmV4cGVjdGVkIEFQSSByZXNwb25zZTogbWlzc2luZyBtZW1iZXJzIGRhdGEnXG4gICAgICB9KTtcbiAgICB9XG4gICAgY29uc3QgbWVtYmVycyA9IHJlc3BvbnNlLmRhdGEubWVtYmVycy5tYXAoKG1lbWJlcjogYW55KSA9PiAoe1xuICAgICAgaWQ6IG1lbWJlci5pZCxcbiAgICAgIHRlYW1faWQ6IG1lbWJlci50ZWFtX2lkLFxuICAgICAgbmFtZTogbWVtYmVyLm5hbWUsXG4gICAgICBkZWxldGVkOiBtZW1iZXIuZGVsZXRlZCxcbiAgICAgIHJlYWxfbmFtZTogbWVtYmVyLnJlYWxfbmFtZSA/PyB1bmRlZmluZWQsXG4gICAgICBwcm9maWxlOiB7XG4gICAgICAgIHJlYWxfbmFtZTogbWVtYmVyLnByb2ZpbGU/LnJlYWxfbmFtZSA/PyB1bmRlZmluZWQsXG4gICAgICAgIGRpc3BsYXlfbmFtZTogbWVtYmVyLnByb2ZpbGU/LmRpc3BsYXlfbmFtZSA/PyB1bmRlZmluZWQsXG4gICAgICAgIGVtYWlsOiBtZW1iZXIucHJvZmlsZT8uZW1haWwgPz8gdW5kZWZpbmVkLFxuICAgICAgICBhdmF0YXJfaGFzaDogbWVtYmVyLnByb2ZpbGU/LmF2YXRhcl9oYXNoID8/IHVuZGVmaW5lZCxcbiAgICAgICAgaW1hZ2VfMjQ6IG1lbWJlci5wcm9maWxlPy5pbWFnZV8yNCA/PyB1bmRlZmluZWQsXG4gICAgICAgIGltYWdlXzMyOiBtZW1iZXIucHJvZmlsZT8uaW1hZ2VfMzIgPz8gdW5kZWZpbmVkLFxuICAgICAgICBpbWFnZV80ODogbWVtYmVyLnByb2ZpbGU/LmltYWdlXzQ4ID8/IHVuZGVmaW5lZCxcbiAgICAgICAgaW1hZ2VfNzI6IG1lbWJlci5wcm9maWxlPy5pbWFnZV83MiA/PyB1bmRlZmluZWQsXG4gICAgICAgIGltYWdlXzE5MjogbWVtYmVyLnByb2ZpbGU/LmltYWdlXzE5MiA/PyB1bmRlZmluZWQsXG4gICAgICAgIGltYWdlXzUxMjogbWVtYmVyLnByb2ZpbGU/LmltYWdlXzUxMiA/PyB1bmRlZmluZWRcbiAgICAgIH0sXG4gICAgICBpc19hZG1pbjogbWVtYmVyLmlzX2FkbWluID8/IGZhbHNlLFxuICAgICAgaXNfb3duZXI6IG1lbWJlci5pc19vd25lciA/PyBmYWxzZSxcbiAgICAgIGlzX2JvdDogbWVtYmVyLmlzX2JvdCA/PyBmYWxzZSxcbiAgICAgIHVwZGF0ZWQ6IG1lbWJlci51cGRhdGVkID8/IDBcbiAgICB9KSk7XG4gICAgcmV0dXJuIHtcbiAgICAgIGl0ZW1zOiBtZW1iZXJzLFxuICAgICAgbmV4dF9jdXJzb3I6IHJlc3BvbnNlLmRhdGEucmVzcG9uc2VfbWV0YWRhdGE/Lm5leHRfY3Vyc29yIHx8IHVuZGVmaW5lZFxuICAgIH07XG4gIH1cbn07XG5leHBvcnQgdHlwZSBOYW5nb0FjdGlvbkxvY2FsID0gUGFyYW1ldGVyczwodHlwZW9mIGFjdGlvbilbJ2V4ZWMnXT5bMF07XG5leHBvcnQgZGVmYXVsdCBhY3Rpb247Il0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsaUJBQWtCO0FBRWxCLElBQU0sYUFBYSxhQUFFLE9BQU87QUFBQSxFQUMxQixJQUFJLGFBQUUsT0FBTztBQUFBLEVBQ2IsU0FBUyxhQUFFLE9BQU87QUFBQSxFQUNsQixNQUFNLGFBQUUsT0FBTztBQUFBLEVBQ2YsU0FBUyxhQUFFLFFBQVE7QUFBQSxFQUNuQixXQUFXLGFBQUUsT0FBTyxFQUFFLFNBQVM7QUFBQSxFQUMvQixTQUFTLGFBQUUsT0FBTztBQUFBLElBQ2hCLFdBQVcsYUFBRSxPQUFPLEVBQUUsU0FBUztBQUFBLElBQy9CLGNBQWMsYUFBRSxPQUFP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
