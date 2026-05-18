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
  description: "List all Typeform forms",
  version: "1.0.0",
  endpoint: { method: "GET", path: "/forms", group: "Typeform" },
  exec: async (nango, input) => {
    const page_size = input.page_size ?? 20;
    const response = await nango.get({
      endpoint: "/forms",
      params: { page_size },
      retries: 3
    });
    if (!response.data) {
      return { items: [], total_items: 0 };
    }
    return {
      items: (response.data.items || []).map((f) => ({
        id: f.id,
        title: f.title,
        theme: f.theme,
        _links: f._links
      })),
      total_items: response.data.total_items || 0
    };
  }
};
var action_default = action;
