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
  description: "Send a message to a Discord channel",
  version: "1.0.0",
  endpoint: { method: "POST", path: "/messages", group: "Discord" },
  exec: async (nango, input) => {
    if (!input.channel_id || !input.content) {
      return { error: "channel_id and content are required" };
    }
    const content = typeof input.content === "string" ? input.content.slice(0, 1000) : "";
    const response = await nango.post({
      endpoint: `/channels/${input.channel_id}/messages`,
      data: { content },
      retries: 3
    });
    if (!response.data) {
      return { error: "Failed to send message" };
    }
    return {
      message: {
        id: response.data.id,
        content: response.data.content,
        timestamp: response.data.timestamp
      }
    };
  }
};
var action_default = action;
