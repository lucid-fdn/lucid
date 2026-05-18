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
  description: "List all guilds the bot is a member of",
  version: "1.0.0",
  endpoint: { method: "GET", path: "/guilds", group: "Discord" },
  exec: async (nango, input) => {
    const response = await nango.get({
      endpoint: "/users/@me/guilds",
      retries: 3
    });
    // Defensive: Discord may return an error object ({message, code}) or a
    // paginated envelope instead of a raw array depending on token type/scope.
    // Narrow to an array to avoid `.map is not a function` blowups.
    const raw = response && response.data;
    const guilds = Array.isArray(raw)
      ? raw
      : Array.isArray(raw && raw.guilds)
        ? raw.guilds
        : [];
    return {
      guilds: guilds.map((g) => ({
        id: g.id,
        name: g.name,
        icon: g.icon,
        owner: g.owner
      }))
    };
  }
};
var action_default = action;
