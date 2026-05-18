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
  description: "Get TikTok user profile information",
  version: "1.0.0",
  endpoint: { method: "GET", path: "/user-info", group: "TikTok" },
  exec: async (nango, input) => {
    const response = await nango.get({
      endpoint: "/user/info/",
      retries: 3
    });
    if (!response.data || !response.data.data || !response.data.data.user) {
      return { error: "Failed to get user info" };
    }
    const u = response.data.data.user;
    return {
      data: {
        user: {
          display_name: u.display_name,
          follower_count: u.follower_count,
          following_count: u.following_count,
          video_count: u.video_count
        }
      }
    };
  }
};
var action_default = action;
