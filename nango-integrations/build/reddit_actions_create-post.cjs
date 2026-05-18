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
  description: "Create a new post on a subreddit",
  version: "1.0.0",
  endpoint: { method: "POST", path: "/posts", group: "Reddit" },
  exec: async (nango, input) => {
    if (!input.sr || !input.title || !input.kind) {
      return { error: "sr, title, and kind are required" };
    }
    const data = {
      sr: input.sr,
      title: input.title.slice(0, 1000),
      kind: input.kind,
      api_type: "json"
    };
    if (input.text) data.text = input.text.slice(0, 1000);
    if (input.url) data.url = input.url;
    const response = await nango.proxy({
      method: "POST",
      endpoint: "/api/submit",
      data,
      baseUrlOverride: "https://oauth.reddit.com",
      retries: 3
    });
    if (!response.data || !response.data.json || !response.data.json.data) {
      return { error: "Failed to create post" };
    }
    const r = response.data.json.data;
    return {
      id: r.id,
      name: r.name,
      url: r.url
    };
  }
};
var action_default = action;
