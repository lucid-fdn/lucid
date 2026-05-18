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

// twitter-v2/actions/post-tweet.ts
var post_tweet_exports = {};
__export(post_tweet_exports, {
  default: () => post_tweet_default
});
module.exports = __toCommonJS(post_tweet_exports);
var z = __toESM(require("zod"), 1);
var inputSchema = z.object({
  text: z.string().min(1).max(280).describe("The tweet text (max 280 characters)"),
  reply_to_tweet_id: z.string().optional().describe("Tweet ID to reply to (optional)"),
  quote_tweet_id: z.string().optional().describe("Tweet ID to quote (optional)")
});
var outputSchema = z.object({
  id: z.string(),
  text: z.string()
});
var action = {
  type: "action",
  description: "Post a tweet on behalf of the authenticated user",
  version: "1.0.0",
  endpoint: {
    method: "POST",
    path: "/twitter/tweets",
    group: "Tweets"
  },
  input: inputSchema,
  output: outputSchema,
  exec: async (nango, input) => {
    const body = {
      text: input.text
    };
    if (input.reply_to_tweet_id) {
      body["reply"] = {
        in_reply_to_tweet_id: input.reply_to_tweet_id
      };
    }
    if (input.quote_tweet_id) {
      body["quote_tweet_id"] = input.quote_tweet_id;
    }
    const response = await nango.proxy({
      method: "POST",
      endpoint: "/2/tweets",
      data: body
    });
    if (response.data?.errors?.length) {
      const err = response.data.errors[0];
      throw new Error(`Twitter API error: ${err.detail || err.message || err.title}`);
    }
    const tweet = response.data?.data;
    if (!tweet) {
      throw new Error("Twitter API returned empty response");
    }
    return {
      id: tweet.id,
      text: tweet.text
    };
  }
};
var post_tweet_default = action;
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidHdpdHRlci12Mi9hY3Rpb25zL3Bvc3QtdHdlZXQudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImltcG9ydCB7IGNyZWF0ZUFjdGlvbiB9IGZyb20gJ25hbmdvJztcbmltcG9ydCAqIGFzIHogZnJvbSAnem9kJztcbmNvbnN0IGlucHV0U2NoZW1hID0gei5vYmplY3Qoe1xuICB0ZXh0OiB6LnN0cmluZygpLm1pbigxKS5tYXgoMjgwKS5kZXNjcmliZSgnVGhlIHR3ZWV0IHRleHQgKG1heCAyODAgY2hhcmFjdGVycyknKSxcbiAgcmVwbHlfdG9fdHdlZXRfaWQ6IHouc3RyaW5nKCkub3B0aW9uYWwoKS5kZXNjcmliZSgnVHdlZXQgSUQgdG8gcmVwbHkgdG8gKG9wdGlvbmFsKScpLFxuICBxdW90ZV90d2VldF9pZDogei5zdHJpbmcoKS5vcHRpb25hbCgpLmRlc2NyaWJlKCdUd2VldCBJRCB0byBxdW90ZSAob3B0aW9uYWwpJylcbn0pO1xuY29uc3Qgb3V0cHV0U2NoZW1hID0gei5vYmplY3Qoe1xuICBpZDogei5zdHJpbmcoKSxcbiAgdGV4dDogei5zdHJpbmcoKVxufSk7XG5jb25zdCBhY3Rpb24gPSB7XG4gIHR5cGU6IFwiYWN0aW9uXCIsXG4gIGRlc2NyaXB0aW9uOiAnUG9zdCBhIHR3ZWV0IG9uIGJlaGFsZiBvZiB0aGUgYXV0aGVudGljYXRlZCB1c2VyJyxcbiAgdmVyc2lvbjogJzEuMC4wJyxcbiAgZW5kcG9pbnQ6IHtcbiAgICBtZXRob2Q6ICdQT1NUJyxcbiAgICBwYXRoOiAnL3R3aXR0ZXIvdHdlZXRzJyxcbiAgICBncm91cDogJ1R3ZWV0cydcbiAgfSxcbiAgaW5wdXQ6IGlucHV0U2NoZW1hLFxuICBvdXRwdXQ6IG91dHB1dFNjaGVtYSxcbiAgZXhlYzogYXN5bmMgKG5hbmdvLCBpbnB1dCkgPT4ge1xuICAgIGNvbnN0IGJvZHk6IFJlY29yZDxzdHJpbmcsIHVua25vd24+ID0ge1xuICAgICAgdGV4dDogaW5wdXQudGV4dFxuICAgIH07XG4gICAgaWYgKGlucHV0LnJlcGx5X3RvX3R3ZWV0X2lkKSB7XG4gICAgICBib2R5WydyZXBseSddID0ge1xuICAgICAgICBpbl9yZXBseV90b190d2VldF9pZDogaW5wdXQucmVwbHlfdG9fdHdlZXRfaWRcbiAgICAgIH07XG4gICAgfVxuICAgIGlmIChpbnB1dC5xdW90ZV90d2VldF9pZCkge1xuICAgICAgYm9keVsncXVvdGVfdHdlZXRfaWQnXSA9IGlucHV0LnF1b3RlX3R3ZWV0X2lkO1xuICAgIH1cbiAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IG5hbmdvLnByb3h5KHtcbiAgICAgIG1ldGhvZDogJ1BPU1QnLFxuICAgICAgZW5kcG9pbnQ6ICcvMi90d2VldHMnLFxuICAgICAgZGF0YTogYm9keVxuICAgIH0pO1xuICAgIGlmIChyZXNwb25zZS5kYXRhPy5lcnJvcnM/Lmxlbmd0aCkge1xuICAgICAgY29uc3QgZXJyID0gcmVzcG9uc2UuZGF0YS5lcnJvcnNbMF07XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoYFR3aXR0ZXIgQVBJIGVycm9yOiAke2Vyci5kZXRhaWwgfHwgZXJyLm1lc3NhZ2UgfHwgZXJyLnRpdGxlfWApO1xuICAgIH1cbiAgICBjb25zdCB0d2VldCA9IHJlc3BvbnNlLmRhdGE/LmRhdGE7XG4gICAgaWYgKCF0d2VldCkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdUd2l0dGVyIEFQSSByZXR1cm5lZCBlbXB0eSByZXNwb25zZScpO1xuICAgIH1cbiAgICByZXR1cm4ge1xuICAgICAgaWQ6IHR3ZWV0LmlkLFxuICAgICAgdGV4dDogdHdlZXQudGV4dFxuICAgIH07XG4gIH1cbn07XG5leHBvcnQgZGVmYXVsdCBhY3Rpb247Il0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUNBLFFBQW1CO0FBQ25CLElBQU0sY0FBZ0IsU0FBTztBQUFBLEVBQzNCLE1BQVEsU0FBTyxFQUFFLElBQUksQ0FBQyxFQUFFLElBQUksR0FBRyxFQUFFLFNBQVMscUNBQXFDO0FBQUEsRUFDL0UsbUJBQXFCLFNBQU8sRUFBRSxTQUFTLEVBQUUsU0FBUyxpQ0FBaUM7QUFBQSxFQUNuRixnQkFBa0IsU0FBTyxFQUFFLFNBQVMsRUFBRSxTQUFTLDhCQUE4QjtBQUMvRSxDQUFDO0FBQ0QsSUFBTSxlQUFpQixTQUFPO0FBQUEsRUFDNUIsSUFBTSxTQUFPO0FBQUEsRUFDYixNQUFRLFNBQU87QUFDakIsQ0FBQztBQUNELElBQU0sU0FBUztBQUFBLEVBQ2IsTUFBTTtBQUFBLEVBQ04sYUFBYTtBQUFBLEVBQ2IsU0FBUztBQUFBLEVBQ1QsVUFBVTtBQUFBLElBQ1IsUUFBUTtBQUFBLElBQ1IsTUFBTTtBQUFBLElBQ04sT0FBTztBQUFBLEVBQ1Q7QUFBQSxFQUNBLE9BQU87QUFBQSxFQUNQLFFBQVE7QUFBQSxFQUNSLE1BQU0sT0FBTyxPQUFPLFVBQVU7QUFDNUIsVUFBTSxPQUFnQztBQUFBLE1BQ3BDLE1BQU0sTUFBTTtBQUFBLElBQ2Q7QUFDQSxRQUFJLE1BQU0sbUJBQW1CO0FBQzNCLFdBQUssT0FBTyxJQUFJO0FBQUEsUUFDZCxzQkFBc0IsTUFBTTtBQUFBLE1BQzlCO0FBQUEsSUFDRjtBQUNBLFFBQUksTUFBTSxnQkFBZ0I7QUFDeEIsV0FBSyxnQkFBZ0IsSUFBSSxNQUFNO0FBQUEsSUFDakM7QUFDQSxVQUFNLFdBQVcsTUFBTSxNQUFNLE1BQU07QUFBQSxNQUNqQyxRQUFRO0FBQUEsTUFDUixVQUFVO0FBQUEsTUFDVixNQUFNO0FBQUEsSUFDUixDQUFDO0FBQ0QsUUFBSSxTQUFTLE1BQU0sUUFBUSxRQUFRO0FBQ2pDLFlBQU0sTUFBTSxTQUFTLEtBQUssT0FBTyxDQUFDO0FBQ2xDLFlBQU0sSUFBSSxNQUFNLHNCQUFzQixJQUFJLFVBQVUsSUFBSSxXQUFXLElBQUksS0FBSyxFQUFFO0FBQUEsSUFDaEY7QUFDQSxVQUFNLFFBQVEsU0FBUyxNQUFNO0FBQzdCLFFBQUksQ0FBQyxPQUFPO0FBQ1YsWUFBTSxJQUFJLE1BQU0scUNBQXFDO0FBQUEsSUFDdkQ7QUFDQSxXQUFPO0FBQUEsTUFDTCxJQUFJLE1BQU07QUFBQSxNQUNWLE1BQU0sTUFBTTtBQUFBLElBQ2Q7QUFBQSxFQUNGO0FBQ0Y7QUFDQSxJQUFPLHFCQUFROyIsCiAgIm5hbWVzIjogW10KfQo=
