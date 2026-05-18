"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
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
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// twitter-v2/actions/delete-tweet.ts
var delete_tweet_exports = {};
__export(delete_tweet_exports, {
  default: () => delete_tweet_default
});
module.exports = __toCommonJS(delete_tweet_exports);
var z = __toESM(require("zod"), 1);
var inputSchema = z.object({
  tweet_id: z.string().describe("The ID of the tweet to delete")
});
var outputSchema = z.object({
  deleted: z.boolean()
});
var action = {
  type: "action",
  description: "Delete a tweet by ID (must be authored by the authenticated user)",
  version: "1.0.0",
  endpoint: {
    method: "DELETE",
    path: "/twitter/tweets",
    group: "Tweets"
  },
  input: inputSchema,
  output: outputSchema,
  exec: async (nango, input) => {
    const response = await nango.proxy({
      method: "DELETE",
      endpoint: `/2/tweets/${input.tweet_id}`
    });
    if (response.data?.errors?.length) {
      const err = response.data.errors[0];
      throw new Error(`Twitter API error: ${err.detail || err.message || err.title}`);
    }
    return {
      deleted: response.data?.data?.deleted ?? false
    };
  }
};
var delete_tweet_default = action;
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidHdpdHRlci12Mi9hY3Rpb25zL2RlbGV0ZS10d2VldC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiaW1wb3J0IHsgY3JlYXRlQWN0aW9uIH0gZnJvbSAnbmFuZ28nO1xuaW1wb3J0ICogYXMgeiBmcm9tICd6b2QnO1xuY29uc3QgaW5wdXRTY2hlbWEgPSB6Lm9iamVjdCh7XG4gIHR3ZWV0X2lkOiB6LnN0cmluZygpLmRlc2NyaWJlKCdUaGUgSUQgb2YgdGhlIHR3ZWV0IHRvIGRlbGV0ZScpXG59KTtcbmNvbnN0IG91dHB1dFNjaGVtYSA9IHoub2JqZWN0KHtcbiAgZGVsZXRlZDogei5ib29sZWFuKClcbn0pO1xuY29uc3QgYWN0aW9uID0ge1xuICB0eXBlOiBcImFjdGlvblwiLFxuICBkZXNjcmlwdGlvbjogJ0RlbGV0ZSBhIHR3ZWV0IGJ5IElEIChtdXN0IGJlIGF1dGhvcmVkIGJ5IHRoZSBhdXRoZW50aWNhdGVkIHVzZXIpJyxcbiAgdmVyc2lvbjogJzEuMC4wJyxcbiAgZW5kcG9pbnQ6IHtcbiAgICBtZXRob2Q6ICdERUxFVEUnLFxuICAgIHBhdGg6ICcvdHdpdHRlci90d2VldHMnLFxuICAgIGdyb3VwOiAnVHdlZXRzJ1xuICB9LFxuICBpbnB1dDogaW5wdXRTY2hlbWEsXG4gIG91dHB1dDogb3V0cHV0U2NoZW1hLFxuICBleGVjOiBhc3luYyAobmFuZ28sIGlucHV0KSA9PiB7XG4gICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBuYW5nby5wcm94eSh7XG4gICAgICBtZXRob2Q6ICdERUxFVEUnLFxuICAgICAgZW5kcG9pbnQ6IGAvMi90d2VldHMvJHtpbnB1dC50d2VldF9pZH1gXG4gICAgfSk7XG4gICAgaWYgKHJlc3BvbnNlLmRhdGE/LmVycm9ycz8ubGVuZ3RoKSB7XG4gICAgICBjb25zdCBlcnIgPSByZXNwb25zZS5kYXRhLmVycm9yc1swXTtcbiAgICAgIHRocm93IG5ldyBFcnJvcihgVHdpdHRlciBBUEkgZXJyb3I6ICR7ZXJyLmRldGFpbCB8fCBlcnIubWVzc2FnZSB8fCBlcnIudGl0bGV9YCk7XG4gICAgfVxuICAgIHJldHVybiB7XG4gICAgICBkZWxldGVkOiByZXNwb25zZS5kYXRhPy5kYXRhPy5kZWxldGVkID8/IGZhbHNlXG4gICAgfTtcbiAgfVxufTtcbmV4cG9ydCBkZWZhdWx0IGFjdGlvbjsiXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQ0EsUUFBbUI7QUFDbkIsSUFBTSxjQUFnQixTQUFPO0FBQUEsRUFDM0IsVUFBWSxTQUFPLEVBQUUsU0FBUywrQkFBK0I7QUFDL0QsQ0FBQztBQUNELElBQU0sZUFBaUIsU0FBTztBQUFBLEVBQzVCLFNBQVcsVUFBUTtBQUNyQixDQUFDO0FBQ0QsSUFBTSxTQUFTO0FBQUEsRUFDYixNQUFNO0FBQUEsRUFDTixhQUFhO0FBQUEsRUFDYixTQUFTO0FBQUEsRUFDVCxVQUFVO0FBQUEsSUFDUixRQUFRO0FBQUEsSUFDUixNQUFNO0FBQUEsSUFDTixPQUFPO0FBQUEsRUFDVDtBQUFBLEVBQ0EsT0FBTztBQUFBLEVBQ1AsUUFBUTtBQUFBLEVBQ1IsTUFBTSxPQUFPLE9BQU8sVUFBVTtBQUM1QixVQUFNLFdBQVcsTUFBTSxNQUFNLE1BQU07QUFBQSxNQUNqQyxRQUFRO0FBQUEsTUFDUixVQUFVLGFBQWEsTUFBTSxRQUFRO0FBQUEsSUFDdkMsQ0FBQztBQUNELFFBQUksU0FBUyxNQUFNLFFBQVEsUUFBUTtBQUNqQyxZQUFNLE1BQU0sU0FBUyxLQUFLLE9BQU8sQ0FBQztBQUNsQyxZQUFNLElBQUksTUFBTSxzQkFBc0IsSUFBSSxVQUFVLElBQUksV0FBVyxJQUFJLEtBQUssRUFBRTtBQUFBLElBQ2hGO0FBQ0EsV0FBTztBQUFBLE1BQ0wsU0FBUyxTQUFTLE1BQU0sTUFBTSxXQUFXO0FBQUEsSUFDM0M7QUFBQSxFQUNGO0FBQ0Y7QUFDQSxJQUFPLHVCQUFROyIsCiAgIm5hbWVzIjogW10KfQo=
