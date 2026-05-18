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
  description: "List Bitly links for a group",
  version: "1.0.0",
  endpoint: { method: "GET", path: "/links", group: "Bitly" },
  exec: async (nango, input) => {
    if (!input.group_guid) {
      return { error: "group_guid is required" };
    }
    const size = input.size ?? 50;
    const response = await nango.get({
      endpoint: `/v4/groups/${input.group_guid}/bitlinks`,
      params: { size },
      retries: 3
    });
    if (!response.data) {
      return { links: [] };
    }
    const links = (response.data.links || []).map((l) => ({
      id: l.id,
      link: l.link,
      long_url: l.long_url,
      title: l.title,
      clicks: l.clicks
    }));
    return { links };
  }
};
var action_default = action;
