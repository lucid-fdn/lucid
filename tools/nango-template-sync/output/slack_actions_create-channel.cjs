"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// slack/actions/create-channel.ts
var create_channel_exports = {};
__export(create_channel_exports, {
  default: () => create_channel_default
});
module.exports = __toCommonJS(create_channel_exports);
var import_zod = require("zod");

var InputSchema = import_zod.z.object({
  name: import_zod.z.string().describe("The name of the channel to create (lowercase, no spaces, max 80 chars)"),
  is_private: import_zod.z.boolean().optional().describe("Set to true to create a private channel instead of a public one")
});

var OutputSchema = import_zod.z.object({
  id: import_zod.z.string().describe("The unique identifier of the newly created channel"),
  name: import_zod.z.string().describe("The name of the newly created channel"),
  is_private: import_zod.z.boolean().describe("Whether the channel was created as private"),
  created: import_zod.z.number().describe("Unix timestamp of when the channel was created"),
  creator: import_zod.z.string().describe("The user ID of the channel creator")
});

var action = {
  type: "action",
  description: "Create a new public or private Slack channel in the workspace.",
  version: "1.0.0",
  endpoint: { method: "POST", path: "/slack/create-channel", group: "Slack Channels" },
  input: InputSchema,
  output: OutputSchema,
  scopes: ["channels:manage"],
  exec: async (nango, input) => {
    const body = { name: input.name };
    if (input.is_private !== undefined) body.is_private = input.is_private;

    const response = await nango.proxy({
      method: "POST",
      endpoint: "conversations.create",
      data: body,
      retries: 3
    });

    if (!response.data?.ok) {
      throw new nango.ActionError({
        message: response.data?.error || "Failed to create channel",
        details: response.data
      });
    }

    const ch = response.data.channel || {};
    return {
      id: ch.id || "",
      name: ch.name || "",
      is_private: ch.is_private || false,
      created: ch.created || 0,
      creator: ch.creator || ""
    };
  }
};

var create_channel_default = action;
