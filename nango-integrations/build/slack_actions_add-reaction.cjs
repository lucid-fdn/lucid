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

// slack/actions/add-reaction.ts
var add_reaction_exports = {};
__export(add_reaction_exports, {
  default: () => add_reaction_default
});
module.exports = __toCommonJS(add_reaction_exports);
var import_zod = require("zod");
var InputSchema = import_zod.z.object({
  channel_id: import_zod.z.string().describe('The channel ID where the message is located. Example: "C1234567890"'),
  timestamp: import_zod.z.string().describe('The timestamp of the message to react to. Example: "1234567890.123456"'),
  emoji_name: import_zod.z.string().describe('The name of the emoji to use (without colons). Example: "thumbsup"')
});
var OutputSchema = import_zod.z.object({
  ok: import_zod.z.boolean()
});
var action = {
  type: "action",
  description: "Add an emoji reaction to a specific Slack message",
  version: "1.0.0",
  endpoint: {
    method: "POST",
    path: "/actions/add-reaction",
    group: "Reactions"
  },
  input: InputSchema,
  output: OutputSchema,
  scopes: ["reactions:write"],
  exec: async (nango, input) => {
    const response = await nango.post({
      endpoint: "reactions.add",
      data: {
        channel: input.channel_id,
        timestamp: input.timestamp,
        name: input.emoji_name
      },
      retries: 3
    });
    if (!response.data.ok) {
      throw new nango.ActionError({
        type: "slack_api_error",
        message: response.data.error || "Failed to add reaction",
        error: response.data.error
      });
    }
    return {
      ok: response.data.ok
    };
  }
};
var add_reaction_default = action;
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsic2xhY2svYWN0aW9ucy9hZGQtcmVhY3Rpb24udHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImltcG9ydCB7IHogfSBmcm9tICd6b2QnO1xuaW1wb3J0IHsgY3JlYXRlQWN0aW9uIH0gZnJvbSAnbmFuZ28nO1xuY29uc3QgSW5wdXRTY2hlbWEgPSB6Lm9iamVjdCh7XG4gIGNoYW5uZWxfaWQ6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ1RoZSBjaGFubmVsIElEIHdoZXJlIHRoZSBtZXNzYWdlIGlzIGxvY2F0ZWQuIEV4YW1wbGU6IFwiQzEyMzQ1Njc4OTBcIicpLFxuICB0aW1lc3RhbXA6IHouc3RyaW5nKCkuZGVzY3JpYmUoJ1RoZSB0aW1lc3RhbXAgb2YgdGhlIG1lc3NhZ2UgdG8gcmVhY3QgdG8uIEV4YW1wbGU6IFwiMTIzNDU2Nzg5MC4xMjM0NTZcIicpLFxuICBlbW9qaV9uYW1lOiB6LnN0cmluZygpLmRlc2NyaWJlKCdUaGUgbmFtZSBvZiB0aGUgZW1vamkgdG8gdXNlICh3aXRob3V0IGNvbG9ucykuIEV4YW1wbGU6IFwidGh1bWJzdXBcIicpXG59KTtcbmNvbnN0IE91dHB1dFNjaGVtYSA9IHoub2JqZWN0KHtcbiAgb2s6IHouYm9vbGVhbigpXG59KTtcbmNvbnN0IGFjdGlvbiA9IHtcbiAgdHlwZTogXCJhY3Rpb25cIixcbiAgZGVzY3JpcHRpb246ICdBZGQgYW4gZW1vamkgcmVhY3Rpb24gdG8gYSBzcGVjaWZpYyBTbGFjayBtZXNzYWdlJyxcbiAgdmVyc2lvbjogJzEuMC4wJyxcbiAgZW5kcG9pbnQ6IHtcbiAgICBtZXRob2Q6ICdQT1NUJyxcbiAgICBwYXRoOiAnL2FjdGlvbnMvYWRkLXJlYWN0aW9uJyxcbiAgICBncm91cDogJ1JlYWN0aW9ucydcbiAgfSxcbiAgaW5wdXQ6IElucHV0U2NoZW1hLFxuICBvdXRwdXQ6IE91dHB1dFNjaGVtYSxcbiAgc2NvcGVzOiBbJ3JlYWN0aW9uczp3cml0ZSddLFxuICBleGVjOiBhc3luYyAobmFuZ28sIGlucHV0KTogUHJvbWlzZTx6LmluZmVyPHR5cGVvZiBPdXRwdXRTY2hlbWE+PiA9PiB7XG4gICAgLy8gaHR0cHM6Ly9hcGkuc2xhY2suY29tL21ldGhvZHMvcmVhY3Rpb25zLmFkZFxuICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgbmFuZ28ucG9zdCh7XG4gICAgICBlbmRwb2ludDogJ3JlYWN0aW9ucy5hZGQnLFxuICAgICAgZGF0YToge1xuICAgICAgICBjaGFubmVsOiBpbnB1dC5jaGFubmVsX2lkLFxuICAgICAgICB0aW1lc3RhbXA6IGlucHV0LnRpbWVzdGFtcCxcbiAgICAgICAgbmFtZTogaW5wdXQuZW1vamlfbmFtZVxuICAgICAgfSxcbiAgICAgIHJldHJpZXM6IDNcbiAgICB9KTtcbiAgICBpZiAoIXJlc3BvbnNlLmRhdGEub2spIHtcbiAgICAgIHRocm93IG5ldyBuYW5nby5BY3Rpb25FcnJvcih7XG4gICAgICAgIHR5cGU6ICdzbGFja19hcGlfZXJyb3InLFxuICAgICAgICBtZXNzYWdlOiByZXNwb25zZS5kYXRhLmVycm9yIHx8ICdGYWlsZWQgdG8gYWRkIHJlYWN0aW9uJyxcbiAgICAgICAgZXJyb3I6IHJlc3BvbnNlLmRhdGEuZXJyb3JcbiAgICAgIH0pO1xuICAgIH1cbiAgICByZXR1cm4ge1xuICAgICAgb2s6IHJlc3BvbnNlLmRhdGEub2tcbiAgICB9O1xuICB9XG59O1xuZXhwb3J0IHR5cGUgTmFuZ29BY3Rpb25Mb2NhbCA9IFBhcmFtZXRlcnM8KHR5cGVvZiBhY3Rpb24pWydleGVjJ10+WzBdO1xuZXhwb3J0IGRlZmF1bHQgYWN0aW9uOyJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLGlCQUFrQjtBQUVsQixJQUFNLGNBQWMsYUFBRSxPQUFPO0FBQUEsRUFDM0IsWUFBWSxhQUFFLE9BQU8sRUFBRSxTQUFTLHFFQUFxRTtBQUFBLEVBQ3JHLFdBQVcsYUFBRSxPQUFPLEVBQUUsU0FBUyx3RUFBd0U7QUFBQSxFQUN2RyxZQUFZLGFBQUUsT0FBTyxFQUFFLFNBQVMsb0VBQW9FO0FBQ3RHLENBQUM7QUFDRCxJQUFNLGVBQWUsYUFBRSxPQUFPO0FBQUEsRUFDNUIsSUFBSSxhQUFFLFFBQVE7QUFDaEIsQ0FBQztBQUNELElBQU0sU0FBUztBQUFBLEVBQ2IsTUFBTTtBQUFBLEVBQ04sYUFBYTtBQUFBLEVBQ2IsU0FBUztBQUFBLEVBQ1QsVUFBVTtBQUFBLElBQ1IsUUFBUTtBQUFBLElBQ1IsTUFBTTtBQUFBLElBQ04sT0FBTztBQUFBLEVBQ1Q7QUFBQSxFQUNBLE9BQU87QUFBQSxFQUNQLFFBQVE7QUFBQSxFQUNSLFFBQVEsQ0FBQyxpQkFBaUI7QUFBQSxFQUMxQixNQUFNLE9BQU8sT0FBTyxVQUFpRDtBQUVuRSxVQUFNLFdBQVcsTUFBTSxNQUFNLEtBQUs7QUFBQSxNQUNoQyxVQUFVO0FBQUEsTUFDVixNQUFNO0FBQUEsUUFDSixTQUFTLE1BQU07QUFBQSxRQUNmLFdBQVcsTUFBTTtBQUFBLFFBQ2pCLE1BQU0sTUFBTTtBQUFBLE1BQ2Q7QUFBQSxNQUNBLFNBQVM7QUFBQSxJQUNYLENBQUM7QUFDRCxRQUFJLENBQUMsU0FBUyxLQUFLLElBQUk7QUFDckIsWUFBTSxJQUFJLE1BQU0sWUFBWTtBQUFBLFFBQzFCLE1BQU07QUFBQSxRQUNOLFNBQVMsU0FBUyxLQUFLLFNBQVM7QUFBQSxRQUNoQyxPQUFPLFNBQVMsS0FBSztBQUFBLE1BQ3ZCLENBQUM7QUFBQSxJQUNIO0FBQ0EsV0FBTztBQUFBLE1BQ0wsSUFBSSxTQUFTLEtBQUs7QUFBQSxJQUNwQjtBQUFBLEVBQ0Y7QUFDRjtBQUVBLElBQU8sdUJBQVE7IiwKICAibmFtZXMiOiBbXQp9Cg==
