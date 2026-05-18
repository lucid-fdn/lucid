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
  description: "Send an email via Amazon SES v2",
  version: "1.0.0",
  endpoint: { method: "POST", path: "/emails", group: "Amazon" },
  exec: async (nango, input) => {
    if (!input.FromEmailAddress || !input.Destination || !input.Content) {
      return { error: "FromEmailAddress, Destination, and Content are required" };
    }
    const response = await nango.post({
      endpoint: "/v2/email/outbound-emails",
      data: {
        FromEmailAddress: input.FromEmailAddress,
        Destination: input.Destination,
        Content: input.Content
      },
      retries: 3
    });
    if (!response.data) {
      return { error: "Failed to send email" };
    }
    return { MessageId: response.data.MessageId };
  }
};
var action_default = action;
