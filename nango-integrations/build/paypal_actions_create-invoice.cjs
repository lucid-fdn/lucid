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
  description: "Create a PayPal invoice",
  version: "1.0.0",
  endpoint: { method: "POST", path: "/invoices", group: "PayPal" },
  exec: async (nango, input) => {
    if (!input.detail || !input.primary_recipients || !input.items) {
      return { error: "detail, primary_recipients, and items are required" };
    }
    const response = await nango.post({
      endpoint: "/v2/invoicing/invoices",
      data: {
        detail: input.detail,
        primary_recipients: input.primary_recipients,
        items: input.items
      },
      retries: 3
    });
    if (!response.data) {
      return { error: "Failed to create invoice" };
    }
    return response.data;
  }
};
var action_default = action;
