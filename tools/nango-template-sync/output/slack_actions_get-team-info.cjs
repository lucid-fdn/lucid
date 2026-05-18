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

// slack/actions/get-team-info.ts
var get_team_info_exports = {};
__export(get_team_info_exports, {
  default: () => get_team_info_default
});
module.exports = __toCommonJS(get_team_info_exports);
var import_zod = require("zod");

var InputSchema = import_zod.z.object({});

var OutputSchema = import_zod.z.object({
  id: import_zod.z.string().describe("The unique identifier of the Slack workspace"),
  name: import_zod.z.string().describe("The name of the Slack workspace"),
  domain: import_zod.z.string().describe("The domain portion of the workspace URL (e.g. 'myteam' for myteam.slack.com)"),
  email_domain: import_zod.z.string().describe("The email domain associated with the workspace"),
  icon_url: import_zod.z.string().optional().describe("URL of the workspace icon image")
});

var action = {
  type: "action",
  description: "Get information about the Slack workspace (team) associated with the current token.",
  version: "1.0.0",
  endpoint: { method: "GET", path: "/slack/get-team-info", group: "Slack Team" },
  input: InputSchema,
  output: OutputSchema,
  scopes: ["team:read"],
  exec: async (nango, _input) => {
    const response = await nango.proxy({
      method: "GET",
      endpoint: "team.info",
      retries: 3
    });

    if (!response.data?.ok) {
      throw new nango.ActionError({
        message: response.data?.error || "Failed to get team info",
        details: response.data
      });
    }

    const team = response.data.team || {};
    return {
      id: team.id || "",
      name: team.name || "",
      domain: team.domain || "",
      email_domain: team.email_domain || "",
      icon_url: team.icon?.image_132 || undefined
    };
  }
};

var get_team_info_default = action;
