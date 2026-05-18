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
  description: "List Amazon SES email templates",
  version: "1.0.0",
  endpoint: { method: "GET", path: "/email-templates", group: "Amazon" },
  exec: async (nango, input) => {
    const PageSize = input.PageSize ?? 20;
    const response = await nango.get({
      endpoint: "/v2/email/templates",
      params: { PageSize },
      retries: 3
    });
    if (!response.data) {
      return { TemplatesMetadata: [], NextToken: null };
    }
    return {
      TemplatesMetadata: (response.data.TemplatesMetadata || []).map((t) => ({
        TemplateName: t.TemplateName,
        CreatedTimestamp: t.CreatedTimestamp
      })),
      NextToken: response.data.NextToken || null
    };
  }
};
var action_default = action;
