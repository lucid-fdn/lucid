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
  description: "Update an existing Trello card",
  version: "1.0.0",
  endpoint: { method: "PUT", path: "/cards", group: "Trello" },
  exec: async (nango, input) => {
    if (!input.card_id) {
      return { error: "card_id is required" };
    }
    const data = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.desc !== undefined) data.desc = typeof input.desc === "string" ? input.desc.slice(0, 1000) : input.desc;
    if (input.due !== undefined) data.due = input.due;
    if (input.closed !== undefined) data.closed = input.closed;
    const response = await nango.put({
      endpoint: `/1/cards/${input.card_id}`,
      data,
      retries: 3
    });
    if (!response.data) {
      return { error: "Failed to update card" };
    }
    return response.data;
  }
};
var action_default = action;
