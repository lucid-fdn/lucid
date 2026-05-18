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
  description: "Get WHOOP user profile",
  version: "1.0.0",
  endpoint: { method: "GET", path: "/profile", group: "Whoop" },
  exec: async (nango, input) => {
    const response = await nango.get({
      endpoint: "/v1/user/profile/basic",
      retries: 3
    });
    if (!response.data) {
      return { error: "Failed to get profile" };
    }
    return {
      user_id: response.data.user_id,
      first_name: response.data.first_name,
      last_name: response.data.last_name,
      email: response.data.email
    };
  }
};
var action_default = action;
