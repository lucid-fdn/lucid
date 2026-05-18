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
  description: "Get insights for an Instagram media post",
  version: "1.0.0",
  endpoint: { method: "GET", path: "/media-insights", group: "Instagram" },
  exec: async (nango, input) => {
    if (!input.media_id) {
      return { error: "media_id is required" };
    }
    const response = await nango.get({
      endpoint: `/${input.media_id}/insights`,
      params: {
        metric: "impressions,reach,likes"
      },
      retries: 3
    });
    if (!response.data) {
      return { data: [] };
    }
    return {
      data: (response.data.data || []).map((m) => ({
        name: m.name,
        values: m.values
      }))
    };
  }
};
var action_default = action;
