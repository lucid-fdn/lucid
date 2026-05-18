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
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// twitter-v2/actions/get-following.ts
var get_following_exports = {};
__export(get_following_exports, {
  default: () => get_following_default
});
module.exports = __toCommonJS(get_following_exports);
var z = __toESM(require("zod"), 1);
var userSchema = z.object({
  id: z.string(),
  name: z.string(),
  username: z.string(),
  description: z.string().optional(),
  followers_count: z.number().optional(),
  following_count: z.number().optional(),
  verified: z.boolean().optional()
});
var inputSchema = z.object({
  username: z.string().optional().describe("Username (without @). Omit for authenticated user."),
  max_results: z.number().min(1).max(1000).optional().describe("Number of results (1-1000, default 20)")
});
var outputSchema = z.object({
  users: z.array(userSchema),
  result_count: z.number(),
  next_token: z.string().optional()
});
var action = {
  type: "action",
  description: "Get accounts a user is following",
  version: "1.0.0",
  endpoint: {
    method: "GET",
    path: "/twitter/following",
    group: "Users"
  },
  input: inputSchema,
  output: outputSchema,
  exec: async (nango, input) => {
    let userId;
    if (input.username) {
      const lookupResp = await nango.proxy({
        method: "GET",
        endpoint: `/2/users/by/username/${input.username}`
      });
      if (lookupResp.data?.errors?.length) {
        const err = lookupResp.data.errors[0];
        throw new Error(`X API error: ${err.detail || err.message || err.title}`);
      }
      userId = lookupResp.data?.data?.id;
      if (!userId) throw new Error(`User not found: ${input.username}`);
    } else {
      const meResp = await nango.proxy({ method: "GET", endpoint: "/2/users/me" });
      userId = meResp.data?.data?.id;
      if (!userId) throw new Error("Could not resolve authenticated user ID");
    }
    const response = await nango.proxy({
      method: "GET",
      endpoint: `/2/users/${userId}/following`,
      params: {
        max_results: String(input.max_results ?? 20),
        "user.fields": "description,public_metrics,verified"
      }
    });
    if (response.data?.errors?.length) {
      const err = response.data.errors[0];
      throw new Error(`X API error: ${err.detail || err.message || err.title}`);
    }
    const users = response.data?.data || [];
    return {
      users: users.map((u) => ({
        id: u.id,
        name: u.name,
        username: u.username,
        description: u.description,
        followers_count: u.public_metrics?.followers_count,
        following_count: u.public_metrics?.following_count,
        verified: u.verified
      })),
      result_count: response.data?.meta?.result_count ?? 0,
      next_token: response.data?.meta?.next_token
    };
  }
};
var get_following_default = action;
