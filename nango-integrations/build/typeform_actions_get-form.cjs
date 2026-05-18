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
  description: "Get details of a specific Typeform form",
  version: "1.0.0",
  endpoint: { method: "GET", path: "/form", group: "Typeform" },
  exec: async (nango, input) => {
    if (!input.form_id) {
      return { error: "form_id is required" };
    }
    const response = await nango.get({
      endpoint: `/forms/${input.form_id}`,
      retries: 3
    });
    if (!response.data) {
      return { error: "Form not found" };
    }
    return {
      id: response.data.id,
      title: response.data.title,
      fields: response.data.fields,
      settings: response.data.settings
    };
  }
};
var action_default = action;
