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
  description: "List recent media posts from Instagram",
  version: "1.0.0",
  endpoint: { method: "GET", path: "/media", group: "Instagram" },
  exec: async (nango, input) => {
    const limit = input.limit ?? 25;
    const response = await nango.get({
      endpoint: "/me/media",
      params: {
        fields: "id,caption,media_type,media_url,timestamp,permalink",
        limit
      },
      retries: 3
    });
    if (!response.data) {
      return { data: [], paging: null };
    }
    return {
      data: (response.data.data || []).map((m) => ({
        id: m.id,
        caption: m.caption ? m.caption.slice(0, 1000) : null,
        media_type: m.media_type,
        media_url: m.media_url,
        timestamp: m.timestamp,
        permalink: m.permalink
      })),
      paging: response.data.paging || null
    };
  }
};
var action_default = action;
