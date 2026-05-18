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
  description: "List TikTok videos for the authenticated user",
  version: "1.0.0",
  endpoint: { method: "POST", path: "/videos", group: "TikTok" },
  exec: async (nango, input) => {
    const max_count = input.max_count ?? 20;
    const response = await nango.post({
      endpoint: "/video/list/",
      data: { max_count },
      retries: 3
    });
    if (!response.data || !response.data.data) {
      return { data: { videos: [] } };
    }
    const videos = (response.data.data.videos || []).map((v) => ({
      id: v.id,
      title: v.title ? v.title.slice(0, 1000) : null,
      create_time: v.create_time,
      share_count: v.share_count,
      view_count: v.view_count
    }));
    return { data: { videos } };
  }
};
var action_default = action;
