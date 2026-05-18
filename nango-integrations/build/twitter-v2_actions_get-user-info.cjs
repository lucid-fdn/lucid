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

// twitter-v2/actions/get-user-info.ts
var get_user_info_exports = {};
__export(get_user_info_exports, {
  default: () => get_user_info_default
});
module.exports = __toCommonJS(get_user_info_exports);
var z = __toESM(require("zod"), 1);
var inputSchema = z.object({
  username: z.string().optional().describe("Twitter username (without @). If omitted, returns the authenticated user.")
});
var outputSchema = z.object({
  id: z.string(),
  name: z.string(),
  username: z.string(),
  description: z.string().optional(),
  profile_image_url: z.string().optional(),
  verified: z.boolean().optional(),
  followers_count: z.number().optional(),
  following_count: z.number().optional(),
  tweet_count: z.number().optional(),
  created_at: z.string().optional()
});
var action = {
  type: "action",
  description: "Get Twitter user profile information by username or for the authenticated user",
  version: "1.0.0",
  endpoint: {
    method: "GET",
    path: "/twitter/user",
    group: "Users"
  },
  input: inputSchema,
  output: outputSchema,
  exec: async (nango, input) => {
    const endpoint = input.username ? `/2/users/by/username/${input.username}` : "/2/users/me";
    const response = await nango.proxy({
      method: "GET",
      endpoint,
      params: {
        "user.fields": "description,profile_image_url,public_metrics,created_at,verified"
      }
    });
    if (response.data?.errors?.length) {
      const err = response.data.errors[0];
      throw new Error(`Twitter API error: ${err.detail || err.message || err.title}`);
    }
    const user = response.data?.data;
    if (!user) {
      throw new Error(input.username ? `User @${input.username} not found` : "Could not resolve authenticated user");
    }
    return {
      id: user.id,
      name: user.name,
      username: user.username,
      description: user.description,
      profile_image_url: user.profile_image_url,
      verified: user.verified,
      followers_count: user.public_metrics?.followers_count,
      following_count: user.public_metrics?.following_count,
      tweet_count: user.public_metrics?.tweet_count,
      created_at: user.created_at
    };
  }
};
var get_user_info_default = action;
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidHdpdHRlci12Mi9hY3Rpb25zL2dldC11c2VyLWluZm8udHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImltcG9ydCB7IGNyZWF0ZUFjdGlvbiB9IGZyb20gJ25hbmdvJztcbmltcG9ydCAqIGFzIHogZnJvbSAnem9kJztcbmNvbnN0IGlucHV0U2NoZW1hID0gei5vYmplY3Qoe1xuICB1c2VybmFtZTogei5zdHJpbmcoKS5vcHRpb25hbCgpLmRlc2NyaWJlKCdUd2l0dGVyIHVzZXJuYW1lICh3aXRob3V0IEApLiBJZiBvbWl0dGVkLCByZXR1cm5zIHRoZSBhdXRoZW50aWNhdGVkIHVzZXIuJylcbn0pO1xuY29uc3Qgb3V0cHV0U2NoZW1hID0gei5vYmplY3Qoe1xuICBpZDogei5zdHJpbmcoKSxcbiAgbmFtZTogei5zdHJpbmcoKSxcbiAgdXNlcm5hbWU6IHouc3RyaW5nKCksXG4gIGRlc2NyaXB0aW9uOiB6LnN0cmluZygpLm9wdGlvbmFsKCksXG4gIHByb2ZpbGVfaW1hZ2VfdXJsOiB6LnN0cmluZygpLm9wdGlvbmFsKCksXG4gIHZlcmlmaWVkOiB6LmJvb2xlYW4oKS5vcHRpb25hbCgpLFxuICBmb2xsb3dlcnNfY291bnQ6IHoubnVtYmVyKCkub3B0aW9uYWwoKSxcbiAgZm9sbG93aW5nX2NvdW50OiB6Lm51bWJlcigpLm9wdGlvbmFsKCksXG4gIHR3ZWV0X2NvdW50OiB6Lm51bWJlcigpLm9wdGlvbmFsKCksXG4gIGNyZWF0ZWRfYXQ6IHouc3RyaW5nKCkub3B0aW9uYWwoKVxufSk7XG5jb25zdCBhY3Rpb24gPSB7XG4gIHR5cGU6IFwiYWN0aW9uXCIsXG4gIGRlc2NyaXB0aW9uOiAnR2V0IFR3aXR0ZXIgdXNlciBwcm9maWxlIGluZm9ybWF0aW9uIGJ5IHVzZXJuYW1lIG9yIGZvciB0aGUgYXV0aGVudGljYXRlZCB1c2VyJyxcbiAgdmVyc2lvbjogJzEuMC4wJyxcbiAgZW5kcG9pbnQ6IHtcbiAgICBtZXRob2Q6ICdHRVQnLFxuICAgIHBhdGg6ICcvdHdpdHRlci91c2VyJyxcbiAgICBncm91cDogJ1VzZXJzJ1xuICB9LFxuICBpbnB1dDogaW5wdXRTY2hlbWEsXG4gIG91dHB1dDogb3V0cHV0U2NoZW1hLFxuICBleGVjOiBhc3luYyAobmFuZ28sIGlucHV0KSA9PiB7XG4gICAgY29uc3QgZW5kcG9pbnQgPSBpbnB1dC51c2VybmFtZSA/IGAvMi91c2Vycy9ieS91c2VybmFtZS8ke2lucHV0LnVzZXJuYW1lfWAgOiAnLzIvdXNlcnMvbWUnO1xuICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgbmFuZ28ucHJveHkoe1xuICAgICAgbWV0aG9kOiAnR0VUJyxcbiAgICAgIGVuZHBvaW50LFxuICAgICAgcGFyYW1zOiB7XG4gICAgICAgICd1c2VyLmZpZWxkcyc6ICdkZXNjcmlwdGlvbixwcm9maWxlX2ltYWdlX3VybCxwdWJsaWNfbWV0cmljcyxjcmVhdGVkX2F0LHZlcmlmaWVkJ1xuICAgICAgfVxuICAgIH0pO1xuICAgIGlmIChyZXNwb25zZS5kYXRhPy5lcnJvcnM/Lmxlbmd0aCkge1xuICAgICAgY29uc3QgZXJyID0gcmVzcG9uc2UuZGF0YS5lcnJvcnNbMF07XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoYFR3aXR0ZXIgQVBJIGVycm9yOiAke2Vyci5kZXRhaWwgfHwgZXJyLm1lc3NhZ2UgfHwgZXJyLnRpdGxlfWApO1xuICAgIH1cbiAgICBjb25zdCB1c2VyID0gcmVzcG9uc2UuZGF0YT8uZGF0YTtcbiAgICBpZiAoIXVzZXIpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihpbnB1dC51c2VybmFtZSA/IGBVc2VyIEAke2lucHV0LnVzZXJuYW1lfSBub3QgZm91bmRgIDogJ0NvdWxkIG5vdCByZXNvbHZlIGF1dGhlbnRpY2F0ZWQgdXNlcicpO1xuICAgIH1cbiAgICByZXR1cm4ge1xuICAgICAgaWQ6IHVzZXIuaWQsXG4gICAgICBuYW1lOiB1c2VyLm5hbWUsXG4gICAgICB1c2VybmFtZTogdXNlci51c2VybmFtZSxcbiAgICAgIGRlc2NyaXB0aW9uOiB1c2VyLmRlc2NyaXB0aW9uLFxuICAgICAgcHJvZmlsZV9pbWFnZV91cmw6IHVzZXIucHJvZmlsZV9pbWFnZV91cmwsXG4gICAgICB2ZXJpZmllZDogdXNlci52ZXJpZmllZCxcbiAgICAgIGZvbGxvd2Vyc19jb3VudDogdXNlci5wdWJsaWNfbWV0cmljcz8uZm9sbG93ZXJzX2NvdW50LFxuICAgICAgZm9sbG93aW5nX2NvdW50OiB1c2VyLnB1YmxpY19tZXRyaWNzPy5mb2xsb3dpbmdfY291bnQsXG4gICAgICB0d2VldF9jb3VudDogdXNlci5wdWJsaWNfbWV0cmljcz8udHdlZXRfY291bnQsXG4gICAgICBjcmVhdGVkX2F0OiB1c2VyLmNyZWF0ZWRfYXRcbiAgICB9O1xuICB9XG59O1xuZXhwb3J0IGRlZmF1bHQgYWN0aW9uOyJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFDQSxRQUFtQjtBQUNuQixJQUFNLGNBQWdCLFNBQU87QUFBQSxFQUMzQixVQUFZLFNBQU8sRUFBRSxTQUFTLEVBQUUsU0FBUywyRUFBMkU7QUFDdEgsQ0FBQztBQUNELElBQU0sZUFBaUIsU0FBTztBQUFBLEVBQzVCLElBQU0sU0FBTztBQUFBLEVBQ2IsTUFBUSxTQUFPO0FBQUEsRUFDZixVQUFZLFNBQU87QUFBQSxFQUNuQixhQUFlLFNBQU8sRUFBRSxTQUFTO0FBQUEsRUFDakMsbUJBQXFCLFNBQU8sRUFBRSxTQUFTO0FBQUEsRUFDdkMsVUFBWSxVQUFRLEVBQUUsU0FBUztBQUFBLEVBQy9CLGlCQUFtQixTQUFPLEVBQUUsU0FBUztBQUFBLEVBQ3JDLGlCQUFtQixTQUFPLEVBQUUsU0FBUztBQUFBLEVBQ3JDLGFBQWUsU0FBTyxFQUFFLFNBQVM7QUFBQSxFQUNqQyxZQUFjLFNBQU8sRUFBRSxTQUFTO0FBQ2xDLENBQUM7QUFDRCxJQUFNLFNBQVM7QUFBQSxFQUNiLE1BQU07QUFBQSxFQUNOLGFBQWE7QUFBQSxFQUNiLFNBQVM7QUFBQSxFQUNULFVBQVU7QUFBQSxJQUNSLFFBQVE7QUFBQSxJQUNSLE1BQU07QUFBQSxJQUNOLE9BQU87QUFBQSxFQUNUO0FBQUEsRUFDQSxPQUFPO0FBQUEsRUFDUCxRQUFRO0FBQUEsRUFDUixNQUFNLE9BQU8sT0FBTyxVQUFVO0FBQzVCLFVBQU0sV0FBVyxNQUFNLFdBQVcsd0JBQXdCLE1BQU0sUUFBUSxLQUFLO0FBQzdFLFVBQU0sV0FBVyxNQUFNLE1BQU0sTUFBTTtBQUFBLE1BQ2pDLFFBQVE7QUFBQSxNQUNSO0FBQUEsTUFDQSxRQUFRO0FBQUEsUUFDTixlQUFlO0FBQUEsTUFDakI7QUFBQSxJQUNGLENBQUM7QUFDRCxRQUFJLFNBQVMsTUFBTSxRQUFRLFFBQVE7QUFDakMsWUFBTSxNQUFNLFNBQVMsS0FBSyxPQUFPLENBQUM7QUFDbEMsWUFBTSxJQUFJLE1BQU0sc0JBQXNCLElBQUksVUFBVSxJQUFJLFdBQVcsSUFBSSxLQUFLLEVBQUU7QUFBQSxJQUNoRjtBQUNBLFVBQU0sT0FBTyxTQUFTLE1BQU07QUFDNUIsUUFBSSxDQUFDLE1BQU07QUFDVCxZQUFNLElBQUksTUFBTSxNQUFNLFdBQVcsU0FBUyxNQUFNLFFBQVEsZUFBZSxzQ0FBc0M7QUFBQSxJQUMvRztBQUNBLFdBQU87QUFBQSxNQUNMLElBQUksS0FBSztBQUFBLE1BQ1QsTUFBTSxLQUFLO0FBQUEsTUFDWCxVQUFVLEtBQUs7QUFBQSxNQUNmLGFBQWEsS0FBSztBQUFBLE1BQ2xCLG1CQUFtQixLQUFLO0FBQUEsTUFDeEIsVUFBVSxLQUFLO0FBQUEsTUFDZixpQkFBaUIsS0FBSyxnQkFBZ0I7QUFBQSxNQUN0QyxpQkFBaUIsS0FBSyxnQkFBZ0I7QUFBQSxNQUN0QyxhQUFhLEtBQUssZ0JBQWdCO0FBQUEsTUFDbEMsWUFBWSxLQUFLO0FBQUEsSUFDbkI7QUFBQSxFQUNGO0FBQ0Y7QUFDQSxJQUFPLHdCQUFROyIsCiAgIm5hbWVzIjogW10KfQo=
