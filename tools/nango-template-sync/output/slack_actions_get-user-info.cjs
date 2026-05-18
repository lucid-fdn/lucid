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
  user_id: import_zod.z.string().describe("The unique user ID to look up (e.g. U1234567890)")
});

var OutputSchema = import_zod.z.object({
  id: import_zod.z.string().describe("The unique identifier of the user"),
  name: import_zod.z.string().describe("The username (handle) of the user"),
  real_name: import_zod.z.string().describe("The user's full display name"),
  email: import_zod.z.string().optional().describe("The user's email address if available"),
  title: import_zod.z.string().optional().describe("The user's job title from their profile"),
  phone: import_zod.z.string().optional().describe("The user's phone number from their profile"),
  is_admin: import_zod.z.boolean().describe("Whether the user is a workspace admin"),
  is_bot: import_zod.z.boolean().describe("Whether the user is a bot account"),
  is_deleted: import_zod.z.boolean().describe("Whether the user account has been deactivated"),
  timezone: import_zod.z.string().optional().describe("The user's configured timezone string"),
  avatar_url: import_zod.z.string().optional().describe("URL of the user's profile image (192x192)")
});

var action = {
  type: "action",
  description: "Get detailed profile information for a specific Slack user by their user ID.",
  version: "1.0.0",
  endpoint: { method: "GET", path: "/slack/get-user-info", group: "Slack Users" },
  input: InputSchema,
  output: OutputSchema,
  scopes: ["users:read"],
  exec: async (nango, input) => {
    const response = await nango.proxy({
      method: "GET",
      endpoint: "users.info",
      params: { user: input.user_id },
      retries: 3
    });

    if (!response.data?.ok) {
      throw new nango.ActionError({
        message: response.data?.error || "Failed to get user info",
        details: response.data
      });
    }

    const u = response.data.user || {};
    return {
      id: u.id || "",
      name: u.name || "",
      real_name: u.real_name || u.profile?.real_name || "",
      email: u.profile?.email || undefined,
      title: u.profile?.title || undefined,
      phone: u.profile?.phone || undefined,
      is_admin: u.is_admin || false,
      is_bot: u.is_bot || false,
      is_deleted: u.deleted || false,
      timezone: u.tz || undefined,
      avatar_url: u.profile?.image_192 || undefined
    };
  }
};

var get_user_info_default = action;
