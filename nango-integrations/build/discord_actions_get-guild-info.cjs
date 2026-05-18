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
  description: "Get detailed information about a Discord guild",
  version: "1.0.0",
  endpoint: { method: "GET", path: "/guild-info", group: "Discord" },
  exec: async (nango, input) => {
    if (!input.guild_id) {
      return { error: "guild_id is required" };
    }
    const response = await nango.get({
      endpoint: `/guilds/${input.guild_id}`,
      params: { with_counts: true },
      retries: 3
    });
    if (!response.data) {
      return { error: "Guild not found" };
    }
    const g = response.data;
    return {
      id: g.id,
      name: g.name,
      description: g.description ? g.description.slice(0, 1000) : null,
      member_count: g.approximate_member_count || g.member_count || null,
      icon: g.icon,
      owner_id: g.owner_id
    };
  }
};
var action_default = action;
