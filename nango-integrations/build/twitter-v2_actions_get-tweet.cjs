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

// twitter-v2/actions/get-tweet.ts
var get_tweet_exports = {};
__export(get_tweet_exports, {
  default: () => get_tweet_default
});
module.exports = __toCommonJS(get_tweet_exports);
var z = __toESM(require("zod"), 1);
var inputSchema = z.object({
  tweet_id: z.string().describe("The ID of the tweet to retrieve")
});
var outputSchema = z.object({
  id: z.string(),
  text: z.string(),
  author_id: z.string().optional(),
  created_at: z.string().optional(),
  like_count: z.number().optional(),
  retweet_count: z.number().optional(),
  reply_count: z.number().optional(),
  quote_count: z.number().optional(),
  bookmark_count: z.number().optional(),
  impression_count: z.number().optional()
});
var action = {
  type: "action",
  description: "Get a tweet by ID with public metrics",
  version: "1.0.0",
  endpoint: {
    method: "GET",
    path: "/twitter/tweet",
    group: "Tweets"
  },
  input: inputSchema,
  output: outputSchema,
  exec: async (nango, input) => {
    const response = await nango.proxy({
      method: "GET",
      endpoint: `/2/tweets/${input.tweet_id}`,
      params: {
        "tweet.fields": "author_id,created_at,public_metrics"
      }
    });
    if (response.data?.errors?.length) {
      const err = response.data.errors[0];
      throw new Error(`X API error: ${err.detail || err.message || err.title}`);
    }
    const tweet = response.data?.data;
    if (!tweet) {
      throw new Error("X API returned empty response");
    }
    return {
      id: tweet.id,
      text: tweet.text,
      author_id: tweet.author_id,
      created_at: tweet.created_at,
      like_count: tweet.public_metrics?.like_count,
      retweet_count: tweet.public_metrics?.retweet_count,
      reply_count: tweet.public_metrics?.reply_count,
      quote_count: tweet.public_metrics?.quote_count,
      bookmark_count: tweet.public_metrics?.bookmark_count,
      impression_count: tweet.public_metrics?.impression_count
    };
  }
};
var get_tweet_default = action;
