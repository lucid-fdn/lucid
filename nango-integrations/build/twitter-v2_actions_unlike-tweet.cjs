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

// twitter-v2/actions/unlike-tweet.ts
var unlike_tweet_exports = {};
__export(unlike_tweet_exports, {
  default: () => unlike_tweet_default
});
module.exports = __toCommonJS(unlike_tweet_exports);
var z = __toESM(require("zod"), 1);
var inputSchema = z.object({
  tweet_id: z.string().describe("The ID of the tweet to unlike")
});
var outputSchema = z.object({
  unliked: z.boolean()
});
var action = {
  type: "action",
  description: "Unlike a previously liked tweet on behalf of the authenticated user",
  version: "1.0.0",
  endpoint: {
    method: "DELETE",
    path: "/twitter/likes",
    group: "Engagement"
  },
  input: inputSchema,
  output: outputSchema,
  exec: async (nango, input) => {
    const meResp = await nango.proxy({ method: "GET", endpoint: "/2/users/me" });
    const userId = meResp.data?.data?.id;
    if (!userId) throw new Error("Could not resolve authenticated user ID");
    const response = await nango.proxy({
      method: "DELETE",
      endpoint: `/2/users/${userId}/likes/${input.tweet_id}`
    });
    if (response.data?.errors?.length) {
      const err = response.data.errors[0];
      throw new Error(`X API error: ${err.detail || err.message || err.title}`);
    }
    return {
      unliked: response.data?.data?.liked === false
    };
  }
};
var unlike_tweet_default = action;
