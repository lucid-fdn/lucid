"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => { for (var name in all) __defProp(target, name, { get: all[name], enumerable: true }); };
var __copyProps = (to, from, except, desc) => { if (from && typeof from === "object" || typeof from === "function") { for (let key of __getOwnPropNames(from)) if (!__hasOwnProp.call(to, key) && key !== except) __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable }); } return to; };
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var exports_mod = {};
__export(exports_mod, { default: () => action_default });
module.exports = __toCommonJS(exports_mod);

var action = {
  type: "action",
  description: "List hot posts from a subreddit",
  version: "1.0.0",
  endpoint: { method: "GET", path: "/posts", group: "Reddit" },
  exec: async (nango, input) => {
    if (!input.subreddit) {
      return { error: "subreddit is required" };
    }
    const limit = input.limit ?? 25;
    const response = await nango.proxy({
      method: "GET",
      endpoint: `/r/${input.subreddit}/hot`,
      params: { limit },
      baseUrlOverride: "https://oauth.reddit.com",
      retries: 3
    });
    if (!response.data || !response.data.data) {
      return { posts: [] };
    }
    const posts = (response.data.data.children || []).map((c) => {
      const p = c.data;
      return {
        id: p.id,
        title: p.title ? p.title.slice(0, 1000) : null,
        author: p.author,
        score: p.score,
        url: p.url,
        num_comments: p.num_comments,
        created_utc: p.created_utc
      };
    });
    return { posts };
  }
};
var action_default = action;
