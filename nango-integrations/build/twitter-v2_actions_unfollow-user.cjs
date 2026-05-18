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

// twitter-v2/actions/unfollow-user.ts
var unfollow_user_exports = {};
__export(unfollow_user_exports, {
  default: () => unfollow_user_default
});
module.exports = __toCommonJS(unfollow_user_exports);
var z = __toESM(require("zod"), 1);
var inputSchema = z.object({
  target_username: z.string().describe("Username of the account to unfollow (without @)")
});
var outputSchema = z.object({
  following: z.boolean()
});
var action = {
  type: "action",
  description: "Unfollow a user on X",
  version: "1.0.0",
  endpoint: {
    method: "DELETE",
    path: "/twitter/follow",
    group: "Users"
  },
  input: inputSchema,
  output: outputSchema,
  exec: async (nango, input) => {
    const meResp = await nango.proxy({ method: "GET", endpoint: "/2/users/me" });
    const userId = meResp.data?.data?.id;
    if (!userId) throw new Error("Could not resolve authenticated user ID");
    const lookupResp = await nango.proxy({
      method: "GET",
      endpoint: `/2/users/by/username/${input.target_username}`
    });
    if (lookupResp.data?.errors?.length) {
      const err = lookupResp.data.errors[0];
      throw new Error(`X API error: ${err.detail || err.message || err.title}`);
    }
    const targetId = lookupResp.data?.data?.id;
    if (!targetId) throw new Error(`User not found: ${input.target_username}`);
    const response = await nango.proxy({
      method: "DELETE",
      endpoint: `/2/users/${userId}/following/${targetId}`
    });
    if (response.data?.errors?.length) {
      const err = response.data.errors[0];
      throw new Error(`X API error: ${err.detail || err.message || err.title}`);
    }
    return {
      following: response.data?.data?.following ?? false
    };
  }
};
var unfollow_user_default = action;
