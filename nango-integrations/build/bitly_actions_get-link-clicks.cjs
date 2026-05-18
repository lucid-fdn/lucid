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
  description: "Get click summary for a Bitly link",
  version: "1.0.0",
  endpoint: { method: "GET", path: "/link-clicks", group: "Bitly" },
  exec: async (nango, input) => {
    if (!input.bitlink) {
      return { error: "bitlink is required" };
    }
    const unit = input.unit ?? "day";
    const units = input.units ?? 7;
    const response = await nango.get({
      endpoint: `/v4/bitlinks/${input.bitlink}/clicks/summary`,
      params: { unit, units },
      retries: 3
    });
    if (!response.data) {
      return { total_clicks: 0, unit_data: [] };
    }
    return {
      total_clicks: response.data.total_clicks || 0,
      unit_data: response.data.units || []
    };
  }
};
var action_default = action;
