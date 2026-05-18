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
  description: "Get information about a subreddit",
  version: "1.0.0",
  endpoint: { method: "GET", path: "/subreddit", group: "Reddit" },
  exec: async (nango, input) => {
    if (!input.subreddit) {
      return { error: "subreddit is required" };
    }
    const response = await nango.proxy({
      method: "GET",
      endpoint: `/r/${input.subreddit}/about`,
      baseUrlOverride: "https://oauth.reddit.com",
      retries: 3
    });
    if (!response.data || !response.data.data) {
      return { error: "Subreddit not found" };
    }
    const s = response.data.data;
    return {
      name: s.display_name,
      subscribers: s.subscribers,
      description: s.description ? s.description.slice(0, 1000) : null,
      public_description: s.public_description ? s.public_description.slice(0, 1000) : null
    };
  }
};
var action_default = action;
