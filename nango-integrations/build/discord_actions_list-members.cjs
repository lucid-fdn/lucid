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
  description: "List members of a Discord guild",
  version: "1.0.0",
  endpoint: { method: "GET", path: "/members", group: "Discord" },
  exec: async (nango, input) => {
    if (!input.guild_id) {
      return { error: "guild_id is required" };
    }
    const limit = input.limit ?? 100;
    const response = await nango.get({
      endpoint: `/guilds/${input.guild_id}/members`,
      params: { limit },
      retries: 3
    });
    const members = response.data || [];
    return {
      members: members.map((m) => ({
        user: m.user ? { id: m.user.id, username: m.user.username } : null,
        nick: m.nick || null,
        joined_at: m.joined_at
      }))
    };
  }
};
var action_default = action;
