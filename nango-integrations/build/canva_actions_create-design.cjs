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
  description: "Create a new Canva design",
  version: "1.0.0",
  endpoint: { method: "POST", path: "/designs", group: "Canva" },
  exec: async (nango, input) => {
    if (!input.design_type) {
      return { error: "design_type is required" };
    }
    const data = { design_type: input.design_type };
    if (input.title) data.title = input.title.slice(0, 1000);
    const response = await nango.post({
      endpoint: "/v1/designs",
      data,
      retries: 3
    });
    if (!response.data) {
      return { error: "Failed to create design" };
    }
    return {
      design: {
        id: response.data.design?.id || response.data.id,
        title: response.data.design?.title || response.data.title,
        edit_url: response.data.design?.edit_url || response.data.edit_url
      }
    };
  }
};
var action_default = action;
