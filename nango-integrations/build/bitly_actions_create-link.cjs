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
  description: "Create a shortened Bitly link",
  version: "1.0.0",
  endpoint: { method: "POST", path: "/links", group: "Bitly" },
  exec: async (nango, input) => {
    if (!input.long_url) {
      return { error: "long_url is required" };
    }
    const data = { long_url: input.long_url };
    if (input.domain) data.domain = input.domain;
    if (input.title) data.title = input.title.slice(0, 1000);
    const response = await nango.post({
      endpoint: "/v4/shorten",
      data,
      retries: 3
    });
    if (!response.data) {
      return { error: "Failed to create link" };
    }
    return {
      id: response.data.id,
      link: response.data.link,
      long_url: response.data.long_url,
      title: response.data.title,
      created_at: response.data.created_at
    };
  }
};
var action_default = action;
