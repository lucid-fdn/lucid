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

// slack/actions/get-user-info.ts
var get_user_info_exports = {};
__export(get_user_info_exports, {
  default: () => get_user_info_default
});
module.exports = __toCommonJS(get_user_info_exports);
var import_zod = require("zod");
var InputSchema = import_zod.z.object({
  user_id: import_zod.z.string().describe('Slack user ID. Example: "U12345678"')
});
var OutputSchema = import_zod.z.object({
  id: import_zod.z.string(),
  team_id: import_zod.z.string(),
  name: import_zod.z.string(),
  real_name: import_zod.z.string().optional(),
  display_name: import_zod.z.string().optional(),
  email: import_zod.z.string().optional(),
  avatar_url: import_zod.z.string().optional(),
  is_bot: import_zod.z.boolean(),
  is_admin: import_zod.z.boolean().optional(),
  is_owner: import_zod.z.boolean().optional(),
  is_primary_owner: import_zod.z.boolean().optional(),
  is_restricted: import_zod.z.boolean().optional(),
  is_ultra_restricted: import_zod.z.boolean().optional(),
  is_app_user: import_zod.z.boolean().optional(),
  updated: import_zod.z.number().optional()
});
var action = {
  type: "action",
  description: "Retrieve a user's account details, including profile and avatar fields",
  version: "1.0.0",
  endpoint: {
    method: "GET",
    path: "/actions/get-user-info",
    group: "Users"
  },
  input: InputSchema,
  output: OutputSchema,
  scopes: ["users:read"],
  exec: async (nango, input) => {
    const response = await nango.get({
      endpoint: "users.info",
      params: {
        user: input.user_id
      },
      retries: 3
    });
    if (!response.data || !response.data.user) {
      throw new nango.ActionError({
        type: "not_found",
        message: "User not found",
        user_id: input.user_id
      });
    }
    const user = response.data.user;
    const profile = user.profile || {};
    return {
      id: user.id,
      team_id: user.team_id,
      name: user.name,
      real_name: profile.real_name || void 0,
      display_name: profile.display_name || void 0,
      email: profile.email || void 0,
      avatar_url: profile.image_512 || profile.image_192 || profile.image_72 || profile.image_48 || void 0,
      is_bot: user.is_bot || false,
      is_admin: user.is_admin,
      is_owner: user.is_owner,
      is_primary_owner: user.is_primary_owner,
      is_restricted: user.is_restricted,
      is_ultra_restricted: user.is_ultra_restricted,
      is_app_user: user.is_app_user,
      updated: user.updated
    };
  }
};
var get_user_info_default = action;
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsic2xhY2svYWN0aW9ucy9nZXQtdXNlci1pbmZvLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyJpbXBvcnQgeyB6IH0gZnJvbSAnem9kJztcbmltcG9ydCB7IGNyZWF0ZUFjdGlvbiB9IGZyb20gJ25hbmdvJztcbmNvbnN0IElucHV0U2NoZW1hID0gei5vYmplY3Qoe1xuICB1c2VyX2lkOiB6LnN0cmluZygpLmRlc2NyaWJlKCdTbGFjayB1c2VyIElELiBFeGFtcGxlOiBcIlUxMjM0NTY3OFwiJylcbn0pO1xuY29uc3QgT3V0cHV0U2NoZW1hID0gei5vYmplY3Qoe1xuICBpZDogei5zdHJpbmcoKSxcbiAgdGVhbV9pZDogei5zdHJpbmcoKSxcbiAgbmFtZTogei5zdHJpbmcoKSxcbiAgcmVhbF9uYW1lOiB6LnN0cmluZygpLm9wdGlvbmFsKCksXG4gIGRpc3BsYXlfbmFtZTogei5zdHJpbmcoKS5vcHRpb25hbCgpLFxuICBlbWFpbDogei5zdHJpbmcoKS5vcHRpb25hbCgpLFxuICBhdmF0YXJfdXJsOiB6LnN0cmluZygpLm9wdGlvbmFsKCksXG4gIGlzX2JvdDogei5ib29sZWFuKCksXG4gIGlzX2FkbWluOiB6LmJvb2xlYW4oKS5vcHRpb25hbCgpLFxuICBpc19vd25lcjogei5ib29sZWFuKCkub3B0aW9uYWwoKSxcbiAgaXNfcHJpbWFyeV9vd25lcjogei5ib29sZWFuKCkub3B0aW9uYWwoKSxcbiAgaXNfcmVzdHJpY3RlZDogei5ib29sZWFuKCkub3B0aW9uYWwoKSxcbiAgaXNfdWx0cmFfcmVzdHJpY3RlZDogei5ib29sZWFuKCkub3B0aW9uYWwoKSxcbiAgaXNfYXBwX3VzZXI6IHouYm9vbGVhbigpLm9wdGlvbmFsKCksXG4gIHVwZGF0ZWQ6IHoubnVtYmVyKCkub3B0aW9uYWwoKVxufSk7XG5jb25zdCBhY3Rpb24gPSB7XG4gIHR5cGU6IFwiYWN0aW9uXCIsXG4gIGRlc2NyaXB0aW9uOiBcIlJldHJpZXZlIGEgdXNlcidzIGFjY291bnQgZGV0YWlscywgaW5jbHVkaW5nIHByb2ZpbGUgYW5kIGF2YXRhciBmaWVsZHNcIixcbiAgdmVyc2lvbjogJzEuMC4wJyxcbiAgZW5kcG9pbnQ6IHtcbiAgICBtZXRob2Q6ICdHRVQnLFxuICAgIHBhdGg6ICcvYWN0aW9ucy9nZXQtdXNlci1pbmZvJyxcbiAgICBncm91cDogJ1VzZXJzJ1xuICB9LFxuICBpbnB1dDogSW5wdXRTY2hlbWEsXG4gIG91dHB1dDogT3V0cHV0U2NoZW1hLFxuICBzY29wZXM6IFsndXNlcnM6cmVhZCddLFxuICBleGVjOiBhc3luYyAobmFuZ28sIGlucHV0KTogUHJvbWlzZTx6LmluZmVyPHR5cGVvZiBPdXRwdXRTY2hlbWE+PiA9PiB7XG4gICAgLy8gaHR0cHM6Ly9hcGkuc2xhY2suY29tL21ldGhvZHMvdXNlcnMuaW5mb1xuICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgbmFuZ28uZ2V0KHtcbiAgICAgIGVuZHBvaW50OiAndXNlcnMuaW5mbycsXG4gICAgICBwYXJhbXM6IHtcbiAgICAgICAgdXNlcjogaW5wdXQudXNlcl9pZFxuICAgICAgfSxcbiAgICAgIHJldHJpZXM6IDNcbiAgICB9KTtcbiAgICBpZiAoIXJlc3BvbnNlLmRhdGEgfHwgIXJlc3BvbnNlLmRhdGEudXNlcikge1xuICAgICAgdGhyb3cgbmV3IG5hbmdvLkFjdGlvbkVycm9yKHtcbiAgICAgICAgdHlwZTogJ25vdF9mb3VuZCcsXG4gICAgICAgIG1lc3NhZ2U6ICdVc2VyIG5vdCBmb3VuZCcsXG4gICAgICAgIHVzZXJfaWQ6IGlucHV0LnVzZXJfaWRcbiAgICAgIH0pO1xuICAgIH1cbiAgICBjb25zdCB1c2VyID0gcmVzcG9uc2UuZGF0YS51c2VyO1xuICAgIGNvbnN0IHByb2ZpbGUgPSB1c2VyLnByb2ZpbGUgfHwge307XG4gICAgcmV0dXJuIHtcbiAgICAgIGlkOiB1c2VyLmlkLFxuICAgICAgdGVhbV9pZDogdXNlci50ZWFtX2lkLFxuICAgICAgbmFtZTogdXNlci5uYW1lLFxuICAgICAgcmVhbF9uYW1lOiBwcm9maWxlLnJlYWxfbmFtZSB8fCB1bmRlZmluZWQsXG4gICAgICBkaXNwbGF5X25hbWU6IHByb2ZpbGUuZGlzcGxheV9uYW1lIHx8IHVuZGVmaW5lZCxcbiAgICAgIGVtYWlsOiBwcm9maWxlLmVtYWlsIHx8IHVuZGVmaW5lZCxcbiAgICAgIGF2YXRhcl91cmw6IHByb2ZpbGUuaW1hZ2VfNTEyIHx8IHByb2ZpbGUuaW1hZ2VfMTkyIHx8IHByb2ZpbGUuaW1hZ2VfNzIgfHwgcHJvZmlsZS5pbWFnZV80OCB8fCB1bmRlZmluZWQsXG4gICAgICBpc19ib3Q6IHVzZXIuaXNfYm90IHx8IGZhbHNlLFxuICAgICAgaXNfYWRtaW46IHVzZXIuaXNfYWRtaW4sXG4gICAgICBpc19vd25lcjogdXNlci5pc19vd25lcixcbiAgICAgIGlzX3ByaW1hcnlfb3duZXI6IHVzZXIuaXNfcHJpbWFyeV9vd25lcixcbiAgICAgIGlzX3Jlc3RyaWN0ZWQ6IHVzZXIuaXNfcmVzdHJpY3RlZCxcbiAgICAgIGlzX3VsdHJhX3Jlc3RyaWN0ZWQ6IHVzZXIuaXNfdWx0cmFfcmVzdHJpY3RlZCxcbiAgICAgIGlzX2FwcF91c2VyOiB1c2VyLmlzX2FwcF91c2VyLFxuICAgICAgdXBkYXRlZDogdXNlci51cGRhdGVkXG4gICAgfTtcbiAgfVxufTtcbmV4cG9ydCB0eXBlIE5hbmdvQWN0aW9uTG9jYWwgPSBQYXJhbWV0ZXJzPCh0eXBlb2YgYWN0aW9uKVsnZXhlYyddPlswXTtcbmV4cG9ydCBkZWZhdWx0IGFjdGlvbjsiXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxpQkFBa0I7QUFFbEIsSUFBTSxjQUFjLGFBQUUsT0FBTztBQUFBLEVBQzNCLFNBQVMsYUFBRSxPQUFPLEVBQUUsU0FBUyxxQ0FBcUM7QUFDcEUsQ0FBQztBQUNELElBQU0sZUFBZSxhQUFFLE9BQU87QUFBQSxFQUM1QixJQUFJLGFBQUUsT0FBTztBQUFBLEVBQ2IsU0FBUyxhQUFFLE9BQU87QUFBQSxFQUNsQixNQUFNLGFBQUUsT0FBTztBQUFBLEVBQ2YsV0FBVyxhQUFFLE9BQU8sRUFBRSxTQUFTO0FBQUEsRUFDL0IsY0FBYyxhQUFFLE9BQU8sRUFBRSxTQUFTO0FBQUEsRUFDbEMsT0FBTyxhQUFFLE9BQU8sRUFBRSxTQUFTO0FBQUEsRUFDM0IsWUFBWSxhQUFFLE9BQU8sRUFBRSxTQUFTO0FBQUEsRUFDaEMsUUFBUSxhQUFFLFFBQVE7QUFBQSxFQUNsQixVQUFVLGFBQUUsUUFBUSxFQUFFLFNBQVM7QUFBQSxFQUMvQixVQUFVLGFBQUUsUUFBUSxFQUFFLFNBQVM7QUFBQSxFQUMvQixrQkFBa0IsYUFBRSxRQUFRLEVBQUUsU0FBUztBQUFBLEVBQ3ZDLGVBQWUsYUFBRSxRQUFRLEVBQUUsU0FBUztBQUFBLEVBQ3BDLHFCQUFxQixhQUFFLFFBQVEsRUFBRSxTQUFTO0FBQUEsRUFDMUMsYUFBYSxhQUFFLFFBQVEsRUFBRSxTQUFTO0FBQUEsRUFDbEMsU0FBUyxhQUFFLE9BQU8sRUFBRSxTQUFTO0FBQy9CLENBQUM7QUFDRCxJQUFNLFNBQVM7QUFBQSxFQUNiLE1BQU07QUFBQSxFQUNOLGFBQWE7QUFBQSxFQUNiLFNBQVM7QUFBQSxFQUNULFVBQVU7QUFBQSxJQUNSLFFBQVE7QUFBQSxJQUNSLE1BQU07QUFBQSxJQUNOLE9BQU87QUFBQSxFQUNUO0FBQUEsRUFDQSxPQUFPO0FBQUEsRUFDUCxRQUFRO0FBQUEsRUFDUixRQUFRLENBQUMsWUFBWTtBQUFBLEVBQ3JCLE1BQU0sT0FBTyxPQUFPLFVBQWlEO0FBRW5FLFVBQU0sV0FBVyxNQUFNLE1BQU0sSUFBSTtBQUFBLE1BQy9CLFVBQVU7QUFBQSxNQUNWLFFBQVE7QUFBQSxRQUNOLE1BQU0sTUFBTTtBQUFBLE1BQ2Q7QUFBQSxNQUNBLFNBQVM7QUFBQSxJQUNYLENBQUM7QUFDRCxRQUFJLENBQUMsU0FBUyxRQUFRLENBQUMsU0FBUyxLQUFLLE1BQU07QUFDekMsWUFBTSxJQUFJLE1BQU0sWUFBWTtBQUFBLFFBQzFCLE1BQU07QUFBQSxRQUNOLFNBQVM7QUFBQSxRQUNULFNBQVMsTUFBTTtBQUFBLE1BQ2pCLENBQUM7QUFBQSxJQUNIO0FBQ0EsVUFBTSxPQUFPLFNBQVMsS0FBSztBQUMzQixVQUFNLFVBQVUsS0FBSyxXQUFXLENBQUM7QUFDakMsV0FBTztBQUFBLE1BQ0wsSUFBSSxLQUFLO0FBQUEsTUFDVCxTQUFTLEtBQUs7QUFBQSxNQUNkLE1BQU0sS0FBSztBQUFBLE1BQ1gsV0FBVyxRQUFRLGFBQWE7QUFBQSxNQUNoQyxjQUFjLFFBQVEsZ0JBQWdCO0FBQUEsTUFDdEMsT0FBTyxRQUFRLFNBQVM7QUFBQSxNQUN4QixZQUFZLFFBQVEsYUFBYSxRQUFRLGFBQWEsUUFBUSxZQUFZLFFBQVEsWUFBWTtBQUFBLE1BQzlGLFFBQVEsS0FBSyxVQUFVO0FBQUEsTUFDdkIsVUFBVSxLQUFLO0FBQUEsTUFDZixVQUFVLEtBQUs7QUFBQSxNQUNmLGtCQUFrQixLQUFLO0FBQUEsTUFDdkIsZUFBZSxLQUFLO0FBQUEsTUFDcEIscUJBQXFCLEtBQUs7QUFBQSxNQUMxQixhQUFhLEtBQUs7QUFBQSxNQUNsQixTQUFTLEtBQUs7QUFBQSxJQUNoQjtBQUFBLEVBQ0Y7QUFDRjtBQUVBLElBQU8sd0JBQVE7IiwKICAibmFtZXMiOiBbXQp9Cg==
