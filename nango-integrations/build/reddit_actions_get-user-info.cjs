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
  description: "Get the authenticated Reddit user profile",
  version: "1.0.0",
  endpoint: { method: "GET", path: "/user-info", group: "Reddit" },
  exec: async (nango, input) => {
    const response = await nango.proxy({
      method: "GET",
      endpoint: "/api/v1/me",
      baseUrlOverride: "https://oauth.reddit.com",
      retries: 3
    });
    if (!response.data) {
      return { error: "Failed to get user info" };
    }
    const u = response.data;
    return {
      name: u.name,
      total_karma: u.total_karma,
      created_utc: u.created_utc
    };
  }
};
var action_default = action;
