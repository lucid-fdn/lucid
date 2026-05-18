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

// twitter-v2/actions/get-mentions.ts
var get_mentions_exports = {};
__export(get_mentions_exports, {
  default: () => get_mentions_default
});
module.exports = __toCommonJS(get_mentions_exports);
var z = __toESM(require("zod"), 1);
var tweetSchema = z.object({
  id: z.string(),
  text: z.string(),
  author_id: z.string().optional(),
  created_at: z.string().optional(),
  like_count: z.number().optional(),
  retweet_count: z.number().optional(),
  reply_count: z.number().optional()
});
var inputSchema = z.object({
  max_results: z.number().min(5).max(100).optional().describe("Number of results (5-100, default 10)")
});
var outputSchema = z.object({
  tweets: z.array(tweetSchema),
  result_count: z.number(),
  next_token: z.string().optional()
});
var action = {
  type: "action",
  description: "Get recent mentions of the authenticated user",
  version: "1.0.0",
  endpoint: {
    method: "GET",
    path: "/twitter/mentions",
    group: "Tweets"
  },
  input: inputSchema,
  output: outputSchema,
  exec: async (nango, input) => {
    const meResp = await nango.proxy({ method: "GET", endpoint: "/2/users/me" });
    const userId = meResp.data?.data?.id;
    if (!userId) throw new Error("Could not resolve authenticated user ID");
    const response = await nango.proxy({
      method: "GET",
      endpoint: `/2/users/${userId}/mentions`,
      params: {
        max_results: String(input.max_results ?? 10),
        "tweet.fields": "author_id,created_at,public_metrics"
      }
    });
    if (response.data?.errors?.length) {
      const err = response.data.errors[0];
      throw new Error(`X API error: ${err.detail || err.message || err.title}`);
    }
    const tweets = response.data?.data || [];
    return {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tweets: tweets.map((t) => ({
        id: t.id,
        text: t.text,
        author_id: t.author_id,
        created_at: t.created_at,
        like_count: t.public_metrics?.like_count,
        retweet_count: t.public_metrics?.retweet_count,
        reply_count: t.public_metrics?.reply_count
      })),
      result_count: response.data?.meta?.result_count ?? 0,
      next_token: response.data?.meta?.next_token
    };
  }
};
var get_mentions_default = action;
