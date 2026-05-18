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

// slack/actions/remove-reaction.ts
var remove_reaction_exports = {};
__export(remove_reaction_exports, {
  default: () => remove_reaction_default
});
module.exports = __toCommonJS(remove_reaction_exports);
var import_zod = require("zod");

var InputSchema = import_zod.z.object({
  channel_id: import_zod.z.string().describe("The ID of the channel containing the message to remove the reaction from"),
  message_ts: import_zod.z.string().describe("The timestamp of the message to remove the reaction from"),
  name: import_zod.z.string().describe("The name of the emoji reaction to remove without colons (e.g. 'thumbsup', 'heart')")
});

var OutputSchema = import_zod.z.object({
  ok: import_zod.z.boolean().describe("Whether the reaction was successfully removed")
});

var action = {
  type: "action",
  description: "Remove an emoji reaction from a message in a Slack channel.",
  version: "1.0.0",
  endpoint: { method: "POST", path: "/slack/remove-reaction", group: "Slack Reactions" },
  input: InputSchema,
  output: OutputSchema,
  scopes: ["reactions:write"],
  exec: async (nango, input) => {
    const response = await nango.proxy({
      method: "POST",
      endpoint: "reactions.remove",
      data: {
        channel: input.channel_id,
        timestamp: input.message_ts,
        name: input.name
      },
      retries: 3
    });

    if (!response.data?.ok) {
      throw new nango.ActionError({
        message: response.data?.error || "Failed to remove reaction",
        details: response.data
      });
    }

    return { ok: true };
  }
};

var remove_reaction_default = action;
