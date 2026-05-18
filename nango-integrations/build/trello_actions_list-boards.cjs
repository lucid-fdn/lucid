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
  description: "List all boards for the authenticated Trello user",
  version: "1.0.0",
  endpoint: { method: "GET", path: "/boards", group: "Trello" },
  exec: async (nango, input) => {
    const response = await nango.get({
      endpoint: "/1/members/me/boards",
      params: { fields: "name,desc,url,closed" },
      retries: 3
    });
    const boards = response.data || [];
    return {
      boards: boards.map((b) => ({
        id: b.id,
        name: b.name,
        desc: b.desc ? b.desc.slice(0, 1000) : null,
        url: b.url,
        closed: b.closed
      }))
    };
  }
};
var action_default = action;
