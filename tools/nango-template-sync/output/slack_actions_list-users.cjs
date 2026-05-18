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

var InputSchema = import_zod.z.object({
  limit: import_zod.z.number().optional().describe("Maximum number of users to return per page (default 100, max 1000)"),
  cursor: import_zod.z.string().optional().describe("Pagination cursor returned from a previous request to fetch the next page of results")
});

var OutputSchema = import_zod.z.object({
  users: import_zod.z.array(import_zod.z.object({
    id: import_zod.z.string().describe("The unique identifier of the user"),
    name: import_zod.z.string().describe("The username (handle) of the user"),
    real_name: import_zod.z.string().describe("The user's full display name"),
    email: import_zod.z.string().optional().describe("The user's email address if available"),
    is_admin: import_zod.z.boolean().describe("Whether the user is a workspace admin"),
    is_bot: import_zod.z.boolean().describe("Whether the user is a bot account"),
    is_deleted: import_zod.z.boolean().describe("Whether the user account has been deactivated"),
    timezone: import_zod.z.string().optional().describe("The user's configured timezone string")
  })).describe("List of workspace members"),
  next_cursor: import_zod.z.string().optional().describe("Cursor for fetching the next page of results; empty string if no more pages")
});

var action = {
  type: "action",
  description: "List all users (members) in the Slack workspace with pagination support.",
  version: "1.0.0",
  endpoint: { method: "GET", path: "/slack/list-users", group: "Slack Users" },
  input: InputSchema,
  output: OutputSchema,
  scopes: ["users:read"],
  exec: async (nango, input) => {
    const params = {};
    if (input.limit) params.limit = input.limit;
    if (input.cursor) params.cursor = input.cursor;

    const response = await nango.proxy({
      method: "GET",
      endpoint: "users.list",
      params,
      retries: 3
    });

    if (!response.data?.ok) {
      throw new nango.ActionError({
        message: response.data?.error || "Failed to list users",
        details: response.data
      });
    }

    const users = (response.data.members || []).map((u) => ({
      id: u.id,
      name: u.name || "",
      real_name: u.real_name || u.profile?.real_name || "",
      email: u.profile?.email || undefined,
      is_admin: u.is_admin || false,
      is_bot: u.is_bot || false,
      is_deleted: u.deleted || false,
      timezone: u.tz || undefined
    }));

    return {
      users,
      next_cursor: response.data.response_metadata?.next_cursor || undefined
    };
  }
};

var list_users_default = action;
