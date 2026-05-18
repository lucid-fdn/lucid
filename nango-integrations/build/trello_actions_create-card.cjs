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
  description: "Create a new card in a Trello list",
  version: "1.0.0",
  endpoint: { method: "POST", path: "/cards", group: "Trello" },
  exec: async (nango, input) => {
    if (!input.name || !input.idList) {
      return { error: "name and idList are required" };
    }
    const data = {
      name: input.name,
      idList: input.idList
    };
    if (input.desc) data.desc = input.desc.slice(0, 1000);
    if (input.due) data.due = input.due;
    const response = await nango.post({
      endpoint: "/1/cards",
      data,
      retries: 3
    });
    if (!response.data) {
      return { error: "Failed to create card" };
    }
    return response.data;
  }
};
var action_default = action;
