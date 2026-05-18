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

// slack/actions/find-user-by-email.ts
var find_user_by_email_exports = {};
__export(find_user_by_email_exports, {
  default: () => find_user_by_email_default
});
module.exports = __toCommonJS(find_user_by_email_exports);
var import_zod = require("zod");
var InputSchema = import_zod.z.object({
  email: import_zod.z.string().email().describe('Email address of the user to look up. Example: "user@example.com"')
});
var OutputSchema = import_zod.z.object({
  id: import_zod.z.string(),
  team_id: import_zod.z.string(),
  name: import_zod.z.string(),
  real_name: import_zod.z.string().optional(),
  email: import_zod.z.string(),
  is_admin: import_zod.z.boolean(),
  is_bot: import_zod.z.boolean(),
  is_restricted: import_zod.z.boolean(),
  is_ultra_restricted: import_zod.z.boolean(),
  is_deleted: import_zod.z.boolean(),
  profile: import_zod.z.object({
    avatar_hash: import_zod.z.string().optional(),
    status_text: import_zod.z.string().optional(),
    status_emoji: import_zod.z.string().optional(),
    real_name: import_zod.z.string().optional(),
    display_name: import_zod.z.string().optional(),
    email: import_zod.z.string().optional(),
    image_24: import_zod.z.string().optional(),
    image_32: import_zod.z.string().optional(),
    image_48: import_zod.z.string().optional(),
    image_72: import_zod.z.string().optional(),
    image_192: import_zod.z.string().optional(),
    image_512: import_zod.z.string().optional()
  })
});
var action = {
  type: "action",
  description: "Look up a user by email address",
  version: "1.0.0",
  endpoint: {
    method: "POST",
    path: "/actions/find-user-by-email",
    group: "Users"
  },
  input: InputSchema,
  output: OutputSchema,
  scopes: ["users:read.email"],
  exec: async (nango, input) => {
    const response = await nango.get({
      endpoint: "users.lookupByEmail",
      params: {
        email: input.email
      },
      retries: 3
    });
    if (!response.data || !response.data.ok) {
      const errorMsg = response.data?.error || "User not found";
      throw new nango.ActionError({
        type: "not_found",
        message: errorMsg,
        email: input.email
      });
    }
    const user = response.data.user;
    return {
      id: user.id,
      team_id: user.team_id,
      name: user.name,
      real_name: user.real_name ?? void 0,
      email: user.profile?.email || input.email,
      is_admin: user.is_admin || false,
      is_bot: user.is_bot || false,
      is_restricted: user.is_restricted || false,
      is_ultra_restricted: user.is_ultra_restricted || false,
      is_deleted: user.deleted || false,
      profile: {
        avatar_hash: user.profile?.avatar_hash ?? void 0,
        status_text: user.profile?.status_text ?? void 0,
        status_emoji: user.profile?.status_emoji ?? void 0,
        real_name: user.profile?.real_name ?? void 0,
        display_name: user.profile?.display_name ?? void 0,
        email: user.profile?.email ?? void 0,
        image_24: user.profile?.image_24 ?? void 0,
        image_32: user.profile?.image_32 ?? void 0,
        image_48: user.profile?.image_48 ?? void 0,
        image_72: user.profile?.image_72 ?? void 0,
        image_192: user.profile?.image_192 ?? void 0,
        image_512: user.profile?.image_512 ?? void 0
      }
    };
  }
};
var find_user_by_email_default = action;
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsic2xhY2svYWN0aW9ucy9maW5kLXVzZXItYnktZW1haWwudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImltcG9ydCB7IHogfSBmcm9tICd6b2QnO1xuaW1wb3J0IHsgY3JlYXRlQWN0aW9uIH0gZnJvbSAnbmFuZ28nO1xuY29uc3QgSW5wdXRTY2hlbWEgPSB6Lm9iamVjdCh7XG4gIGVtYWlsOiB6LnN0cmluZygpLmVtYWlsKCkuZGVzY3JpYmUoJ0VtYWlsIGFkZHJlc3Mgb2YgdGhlIHVzZXIgdG8gbG9vayB1cC4gRXhhbXBsZTogXCJ1c2VyQGV4YW1wbGUuY29tXCInKVxufSk7XG5jb25zdCBPdXRwdXRTY2hlbWEgPSB6Lm9iamVjdCh7XG4gIGlkOiB6LnN0cmluZygpLFxuICB0ZWFtX2lkOiB6LnN0cmluZygpLFxuICBuYW1lOiB6LnN0cmluZygpLFxuICByZWFsX25hbWU6IHouc3RyaW5nKCkub3B0aW9uYWwoKSxcbiAgZW1haWw6IHouc3RyaW5nKCksXG4gIGlzX2FkbWluOiB6LmJvb2xlYW4oKSxcbiAgaXNfYm90OiB6LmJvb2xlYW4oKSxcbiAgaXNfcmVzdHJpY3RlZDogei5ib29sZWFuKCksXG4gIGlzX3VsdHJhX3Jlc3RyaWN0ZWQ6IHouYm9vbGVhbigpLFxuICBpc19kZWxldGVkOiB6LmJvb2xlYW4oKSxcbiAgcHJvZmlsZTogei5vYmplY3Qoe1xuICAgIGF2YXRhcl9oYXNoOiB6LnN0cmluZygpLm9wdGlvbmFsKCksXG4gICAgc3RhdHVzX3RleHQ6IHouc3RyaW5nKCkub3B0aW9uYWwoKSxcbiAgICBzdGF0dXNfZW1vamk6IHouc3RyaW5nKCkub3B0aW9uYWwoKSxcbiAgICByZWFsX25hbWU6IHouc3RyaW5nKCkub3B0aW9uYWwoKSxcbiAgICBkaXNwbGF5X25hbWU6IHouc3RyaW5nKCkub3B0aW9uYWwoKSxcbiAgICBlbWFpbDogei5zdHJpbmcoKS5vcHRpb25hbCgpLFxuICAgIGltYWdlXzI0OiB6LnN0cmluZygpLm9wdGlvbmFsKCksXG4gICAgaW1hZ2VfMzI6IHouc3RyaW5nKCkub3B0aW9uYWwoKSxcbiAgICBpbWFnZV80ODogei5zdHJpbmcoKS5vcHRpb25hbCgpLFxuICAgIGltYWdlXzcyOiB6LnN0cmluZygpLm9wdGlvbmFsKCksXG4gICAgaW1hZ2VfMTkyOiB6LnN0cmluZygpLm9wdGlvbmFsKCksXG4gICAgaW1hZ2VfNTEyOiB6LnN0cmluZygpLm9wdGlvbmFsKClcbiAgfSlcbn0pO1xuY29uc3QgYWN0aW9uID0ge1xuICB0eXBlOiBcImFjdGlvblwiLFxuICBkZXNjcmlwdGlvbjogJ0xvb2sgdXAgYSB1c2VyIGJ5IGVtYWlsIGFkZHJlc3MnLFxuICB2ZXJzaW9uOiAnMS4wLjAnLFxuICBlbmRwb2ludDoge1xuICAgIG1ldGhvZDogJ1BPU1QnLFxuICAgIHBhdGg6ICcvYWN0aW9ucy9maW5kLXVzZXItYnktZW1haWwnLFxuICAgIGdyb3VwOiAnVXNlcnMnXG4gIH0sXG4gIGlucHV0OiBJbnB1dFNjaGVtYSxcbiAgb3V0cHV0OiBPdXRwdXRTY2hlbWEsXG4gIHNjb3BlczogWyd1c2VyczpyZWFkLmVtYWlsJ10sXG4gIGV4ZWM6IGFzeW5jIChuYW5nbywgaW5wdXQpOiBQcm9taXNlPHouaW5mZXI8dHlwZW9mIE91dHB1dFNjaGVtYT4+ID0+IHtcbiAgICAvLyBodHRwczovL2FwaS5zbGFjay5kZXYvcmVmZXJlbmNlL21ldGhvZHMvdXNlcnMubG9va3VwQnlFbWFpbFxuICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgbmFuZ28uZ2V0KHtcbiAgICAgIGVuZHBvaW50OiAndXNlcnMubG9va3VwQnlFbWFpbCcsXG4gICAgICBwYXJhbXM6IHtcbiAgICAgICAgZW1haWw6IGlucHV0LmVtYWlsXG4gICAgICB9LFxuICAgICAgcmV0cmllczogM1xuICAgIH0pO1xuICAgIGlmICghcmVzcG9uc2UuZGF0YSB8fCAhcmVzcG9uc2UuZGF0YS5vaykge1xuICAgICAgY29uc3QgZXJyb3JNc2cgPSByZXNwb25zZS5kYXRhPy5lcnJvciB8fCAnVXNlciBub3QgZm91bmQnO1xuICAgICAgdGhyb3cgbmV3IG5hbmdvLkFjdGlvbkVycm9yKHtcbiAgICAgICAgdHlwZTogJ25vdF9mb3VuZCcsXG4gICAgICAgIG1lc3NhZ2U6IGVycm9yTXNnLFxuICAgICAgICBlbWFpbDogaW5wdXQuZW1haWxcbiAgICAgIH0pO1xuICAgIH1cbiAgICBjb25zdCB1c2VyID0gcmVzcG9uc2UuZGF0YS51c2VyO1xuICAgIHJldHVybiB7XG4gICAgICBpZDogdXNlci5pZCxcbiAgICAgIHRlYW1faWQ6IHVzZXIudGVhbV9pZCxcbiAgICAgIG5hbWU6IHVzZXIubmFtZSxcbiAgICAgIHJlYWxfbmFtZTogdXNlci5yZWFsX25hbWUgPz8gdW5kZWZpbmVkLFxuICAgICAgZW1haWw6IHVzZXIucHJvZmlsZT8uZW1haWwgfHwgaW5wdXQuZW1haWwsXG4gICAgICBpc19hZG1pbjogdXNlci5pc19hZG1pbiB8fCBmYWxzZSxcbiAgICAgIGlzX2JvdDogdXNlci5pc19ib3QgfHwgZmFsc2UsXG4gICAgICBpc19yZXN0cmljdGVkOiB1c2VyLmlzX3Jlc3RyaWN0ZWQgfHwgZmFsc2UsXG4gICAgICBpc191bHRyYV9yZXN0cmljdGVkOiB1c2VyLmlzX3VsdHJhX3Jlc3RyaWN0ZWQgfHwgZmFsc2UsXG4gICAgICBpc19kZWxldGVkOiB1c2VyLmRlbGV0ZWQgfHwgZmFsc2UsXG4gICAgICBwcm9maWxlOiB7XG4gICAgICAgIGF2YXRhcl9oYXNoOiB1c2VyLnByb2ZpbGU/LmF2YXRhcl9oYXNoID8/IHVuZGVmaW5lZCxcbiAgICAgICAgc3RhdHVzX3RleHQ6IHVzZXIucHJvZmlsZT8uc3RhdHVzX3RleHQgPz8gdW5kZWZpbmVkLFxuICAgICAgICBzdGF0dXNfZW1vamk6IHVzZXIucHJvZmlsZT8uc3RhdHVzX2Vtb2ppID8/IHVuZGVmaW5lZCxcbiAgICAgICAgcmVhbF9uYW1lOiB1c2VyLnByb2ZpbGU/LnJlYWxfbmFtZSA/PyB1bmRlZmluZWQsXG4gICAgICAgIGRpc3BsYXlfbmFtZTogdXNlci5wcm9maWxlPy5kaXNwbGF5X25hbWUgPz8gdW5kZWZpbmVkLFxuICAgICAgICBlbWFpbDogdXNlci5wcm9maWxlPy5lbWFpbCA/PyB1bmRlZmluZWQsXG4gICAgICAgIGltYWdlXzI0OiB1c2VyLnByb2ZpbGU/LmltYWdlXzI0ID8/IHVuZGVmaW5lZCxcbiAgICAgICAgaW1hZ2VfMzI6IHVzZXIucHJvZmlsZT8uaW1hZ2VfMzIgPz8gdW5kZWZpbmVkLFxuICAgICAgICBpbWFnZV80ODogdXNlci5wcm9maWxlPy5pbWFnZV80OCA/PyB1bmRlZmluZWQsXG4gICAgICAgIGltYWdlXzcyOiB1c2VyLnByb2ZpbGU/LmltYWdlXzcyID8/IHVuZGVmaW5lZCxcbiAgICAgICAgaW1hZ2VfMTkyOiB1c2VyLnByb2ZpbGU/LmltYWdlXzE5MiA/PyB1bmRlZmluZWQsXG4gICAgICAgIGltYWdlXzUxMjogdXNlci5wcm9maWxlPy5pbWFnZV81MTIgPz8gdW5kZWZpbmVkXG4gICAgICB9XG4gICAgfTtcbiAgfVxufTtcbmV4cG9ydCB0eXBlIE5hbmdvQWN0aW9uTG9jYWwgPSBQYXJhbWV0ZXJzPCh0eXBlb2YgYWN0aW9uKVsnZXhlYyddPlswXTtcbmV4cG9ydCBkZWZhdWx0IGFjdGlvbjsiXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxpQkFBa0I7QUFFbEIsSUFBTSxjQUFjLGFBQUUsT0FBTztBQUFBLEVBQzNCLE9BQU8sYUFBRSxPQUFPLEVBQUUsTUFBTSxFQUFFLFNBQVMsbUVBQW1FO0FBQ3hHLENBQUM7QUFDRCxJQUFNLGVBQWUsYUFBRSxPQUFPO0FBQUEsRUFDNUIsSUFBSSxhQUFFLE9BQU87QUFBQSxFQUNiLFNBQVMsYUFBRSxPQUFPO0FBQUEsRUFDbEIsTUFBTSxhQUFFLE9BQU87QUFBQSxFQUNmLFdBQVcsYUFBRSxPQUFPLEVBQUUsU0FBUztBQUFBLEVBQy9CLE9BQU8sYUFBRSxPQUFPO0FBQUEsRUFDaEIsVUFB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
