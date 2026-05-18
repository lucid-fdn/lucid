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
  description: "List Canva designs",
  version: "1.0.0",
  endpoint: { method: "GET", path: "/designs", group: "Canva" },
  exec: async (nango, input) => {
    const limit = input.limit ?? 25;
    const response = await nango.get({
      endpoint: "/v1/designs",
      params: { limit },
      retries: 3
    });
    if (!response.data) {
      return { items: [] };
    }
    return {
      items: (response.data.items || []).map((d) => ({
        id: d.id,
        title: d.title,
        created_at: d.created_at,
        thumbnail: d.thumbnail,
        urls: d.urls
      }))
    };
  }
};
var action_default = action;
