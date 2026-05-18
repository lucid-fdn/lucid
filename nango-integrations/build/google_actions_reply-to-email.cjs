"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => { for (var name in all) __defProp(target, name, { get: all[name], enumerable: true }); };
var __copyProps = (to, from, except, desc) => { if (from && typeof from === "object" || typeof from === "function") { for (let key of __getOwnPropNames(from)) if (!__hasOwnProp.call(to, key) && key !== except) __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable }); } return to; };
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var exports_mod = {};
__export(exports_mod, { default: () => action });
module.exports = __toCommonJS(exports_mod);
var import_zod = require("zod");

var InputSchema = import_zod.z.object({
  messageId: import_zod.z.string().describe("The ID of the message to reply to"),
  body: import_zod.z.string().describe("The reply body text (plain text)"),
  cc: import_zod.z.string().optional().describe("CC recipients (comma-separated)")
});

var OutputSchema = import_zod.z.object({
  id: import_zod.z.string(),
  threadId: import_zod.z.string(),
  labelIds: import_zod.z.array(import_zod.z.string()).optional()
}).passthrough();

var action = {
  type: "action",
  description: "Reply to an existing Gmail message in the same thread",
  version: "1.0.0",
  endpoint: { method: "POST", path: "/actions/reply-to-email", group: "Gmail" },
  input: InputSchema,
  output: OutputSchema,
  scopes: ["https://www.googleapis.com/auth/gmail.send"],
  exec: async (nango, input) => {
    // Get original message headers
    const origResp = await nango.proxy({
      method: "GET",
      endpoint: `/gmail/v1/users/me/messages/${input.messageId}?format=full`,
      retries: 3
    });
    const orig = origResp.data;
    const headers = orig.payload?.headers || [];
    const getHeader = (name) => headers.find(h => h.name.toLowerCase() === name.toLowerCase())?.value;

    const origFrom = getHeader("From");
    const origSubject = getHeader("Subject") || "";
    const origMessageId = getHeader("Message-ID") || "";
    const origReferences = getHeader("References") || "";

    // Get sender's email
    const profileResp = await nango.proxy({
      method: "GET",
      endpoint: "/gmail/v1/users/me/profile",
      retries: 2
    });
    const myEmail = profileResp.data.emailAddress;

    const subject = origSubject.startsWith("Re: ") ? origSubject : `Re: ${origSubject}`;
    const references = origReferences ? `${origReferences} ${origMessageId}` : origMessageId;

    let rawEmail = [
      `From: ${myEmail}`,
      `To: ${origFrom}`,
      ...(input.cc ? [`Cc: ${input.cc}`] : []),
      `Subject: ${subject}`,
      `In-Reply-To: ${origMessageId}`,
      `References: ${references}`,
      `Content-Type: text/plain; charset="UTF-8"`,
      "",
      input.body
    ].join("\r\n");

    const encoded = Buffer.from(rawEmail).toString("base64")
      .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

    const sendResp = await nango.proxy({
      method: "POST",
      endpoint: "/gmail/v1/users/me/messages/send",
      data: {
        raw: encoded,
        threadId: orig.threadId
      },
      retries: 3
    });
    return {
      id: sendResp.data.id,
      threadId: sendResp.data.threadId,
      labelIds: sendResp.data.labelIds
    };
  }
};
