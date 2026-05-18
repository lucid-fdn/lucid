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
  description: "Create a post on a Facebook page",
  version: "1.0.0",
  endpoint: { method: "POST", path: "/posts", group: "Facebook" },
  exec: async (nango, input) => {
    if (!input.page_id || !input.message) {
      return { error: "page_id and message are required" };
    }
    const data = {
      message: input.message.slice(0, 1000)
    };
    if (input.link) data.link = input.link;
    const response = await nango.post({
      endpoint: `/${input.page_id}/feed`,
      data,
      retries: 3
    });
    if (!response.data) {
      return { error: "Failed to create post" };
    }
    return { id: response.data.id };
  }
};
var action_default = action;
