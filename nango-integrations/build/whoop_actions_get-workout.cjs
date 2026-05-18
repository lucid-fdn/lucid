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
  description: "Get WHOOP workout data",
  version: "1.0.0",
  endpoint: { method: "GET", path: "/workout", group: "Whoop" },
  exec: async (nango, input) => {
    const limit = input.limit ?? 10;
    const response = await nango.get({
      endpoint: "/v1/activity/workout",
      params: { limit },
      retries: 3
    });
    if (!response.data) {
      return { records: [] };
    }
    const records = (response.data.records || response.data || []).map((w) => ({
      id: w.id,
      sport: w.sport_id || w.sport,
      score: w.score?.strain ?? w.score ?? null,
      strain: w.score?.strain ?? w.strain ?? null,
      start: w.start,
      end: w.end
    }));
    return { records };
  }
};
var action_default = action;
