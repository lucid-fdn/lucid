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

// twitter-v2/actions/search-tweets.ts
var search_tweets_exports = {};
__export(search_tweets_exports, {
  default: () => search_tweets_default
});
module.exports = __toCommonJS(search_tweets_exports);
var z = __toESM(require("zod"), 1);
var inputSchema = z.object({
  query: z.string().min(1).max(512).describe("Twitter search query (supports operators like from:, to:, has:, is:)"),
  max_results: z.number().min(10).max(100).optional().describe("Number of results (10-100, default 10)")
});
var tweetSchema = z.object({
  id: z.string(),
  text: z.string(),
  author_id: z.string().optional(),
  created_at: z.string().optional(),
  like_count: z.number().optional(),
  retweet_count: z.number().optional(),
  reply_count: z.number().optional()
});
var outputSchema = z.object({
  tweets: z.array(tweetSchema),
  result_count: z.number(),
  next_token: z.string().optional()
});
var action = {
  type: "action",
  description: "Search recent tweets matching a query (last 7 days)",
  version: "1.0.0",
  endpoint: {
    method: "GET",
    path: "/twitter/search",
    group: "Tweets"
  },
  input: inputSchema,
  output: outputSchema,
  exec: async (nango, input) => {
    const response = await nango.proxy({
      method: "GET",
      endpoint: "/2/tweets/search/recent",
      params: {
        query: input.query,
        max_results: String(input.max_results ?? 10),
        "tweet.fields": "author_id,created_at,public_metrics"
      }
    });
    if (response.data?.errors?.length) {
      const err = response.data.errors[0];
      throw new Error(`Twitter API error: ${err.detail || err.message || err.title}`);
    }
    const tweets = response.data?.data || [];
    return {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tweets: tweets.map((t) => ({
        id: t.id,
        text: t.text,
        author_id: t.author_id,
        created_at: t.created_at,
        like_count: t.public_metrics?.like_count,
        retweet_count: t.public_metrics?.retweet_count,
        reply_count: t.public_metrics?.reply_count
      })),
      result_count: response.data?.meta?.result_count ?? 0,
      next_token: response.data?.meta?.next_token
    };
  }
};
var search_tweets_default = action;
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidHdpdHRlci12Mi9hY3Rpb25zL3NlYXJjaC10d2VldHMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImltcG9ydCB7IGNyZWF0ZUFjdGlvbiB9IGZyb20gJ25hbmdvJztcbmltcG9ydCAqIGFzIHogZnJvbSAnem9kJztcbmNvbnN0IGlucHV0U2NoZW1hID0gei5vYmplY3Qoe1xuICBxdWVyeTogei5zdHJpbmcoKS5taW4oMSkubWF4KDUxMikuZGVzY3JpYmUoJ1R3aXR0ZXIgc2VhcmNoIHF1ZXJ5IChzdXBwb3J0cyBvcGVyYXRvcnMgbGlrZSBmcm9tOiwgdG86LCBoYXM6LCBpczopJyksXG4gIG1heF9yZXN1bHRzOiB6Lm51bWJlcigpLm1pbigxMCkubWF4KDEwMCkub3B0aW9uYWwoKS5kZXNjcmliZSgnTnVtYmVyIG9mIHJlc3VsdHMgKDEwLTEwMCwgZGVmYXVsdCAxMCknKVxufSk7XG5jb25zdCB0d2VldFNjaGVtYSA9IHoub2JqZWN0KHtcbiAgaWQ6IHouc3RyaW5nKCksXG4gIHRleHQ6IHouc3RyaW5nKCksXG4gIGF1dGhvcl9pZDogei5zdHJpbmcoKS5vcHRpb25hbCgpLFxuICBjcmVhdGVkX2F0OiB6LnN0cmluZygpLm9wdGlvbmFsKCksXG4gIGxpa2VfY291bnQ6IHoubnVtYmVyKCkub3B0aW9uYWwoKSxcbiAgcmV0d2VldF9jb3VudDogei5udW1iZXIoKS5vcHRpb25hbCgpLFxuICByZXBseV9jb3VudDogei5udW1iZXIoKS5vcHRpb25hbCgpXG59KTtcbmNvbnN0IG91dHB1dFNjaGVtYSA9IHoub2JqZWN0KHtcbiAgdHdlZXRzOiB6LmFycmF5KHR3ZWV0U2NoZW1hKSxcbiAgcmVzdWx0X2NvdW50OiB6Lm51bWJlcigpLFxuICBuZXh0X3Rva2VuOiB6LnN0cmluZygpLm9wdGlvbmFsKClcbn0pO1xuY29uc3QgYWN0aW9uID0ge1xuICB0eXBlOiBcImFjdGlvblwiLFxuICBkZXNjcmlwdGlvbjogJ1NlYXJjaCByZWNlbnQgdHdlZXRzIG1hdGNoaW5nIGEgcXVlcnkgKGxhc3QgNyBkYXlzKScsXG4gIHZlcnNpb246ICcxLjAuMCcsXG4gIGVuZHBvaW50OiB7XG4gICAgbWV0aG9kOiAnR0VUJyxcbiAgICBwYXRoOiAnL3R3aXR0ZXIvc2VhcmNoJyxcbiAgICBncm91cDogJ1R3ZWV0cydcbiAgfSxcbiAgaW5wdXQ6IGlucHV0U2NoZW1hLFxuICBvdXRwdXQ6IG91dHB1dFNjaGVtYSxcbiAgZXhlYzogYXN5bmMgKG5hbmdvLCBpbnB1dCkgPT4ge1xuICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgbmFuZ28ucHJveHkoe1xuICAgICAgbWV0aG9kOiAnR0VUJyxcbiAgICAgIGVuZHBvaW50OiAnLzIvdHdlZXRzL3NlYXJjaC9yZWNlbnQnLFxuICAgICAgcGFyYW1zOiB7XG4gICAgICAgIHF1ZXJ5OiBpbnB1dC5xdWVyeSxcbiAgICAgICAgbWF4X3Jlc3VsdHM6IFN0cmluZyhpbnB1dC5tYXhfcmVzdWx0cyA/PyAxMCksXG4gICAgICAgICd0d2VldC5maWVsZHMnOiAnYXV0aG9yX2lkLGNyZWF0ZWRfYXQscHVibGljX21ldHJpY3MnXG4gICAgICB9XG4gICAgfSk7XG4gICAgaWYgKHJlc3BvbnNlLmRhdGE/LmVycm9ycz8ubGVuZ3RoKSB7XG4gICAgICBjb25zdCBlcnIgPSByZXNwb25zZS5kYXRhLmVycm9yc1swXTtcbiAgICAgIHRocm93IG5ldyBFcnJvcihgVHdpdHRlciBBUEkgZXJyb3I6ICR7ZXJyLmRldGFpbCB8fCBlcnIubWVzc2FnZSB8fCBlcnIudGl0bGV9YCk7XG4gICAgfVxuICAgIGNvbnN0IHR3ZWV0cyA9IHJlc3BvbnNlLmRhdGE/LmRhdGEgfHwgW107XG4gICAgcmV0dXJuIHtcbiAgICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tZXhwbGljaXQtYW55XG4gICAgICB0d2VldHM6IHR3ZWV0cy5tYXAoKHQ6IGFueSkgPT4gKHtcbiAgICAgICAgaWQ6IHQuaWQsXG4gICAgICAgIHRleHQ6IHQudGV4dCxcbiAgICAgICAgYXV0aG9yX2lkOiB0LmF1dGhvcl9pZCxcbiAgICAgICAgY3JlYXRlZF9hdDogdC5jcmVhdGVkX2F0LFxuICAgICAgICBsaWtlX2NvdW50OiB0LnB1YmxpY19tZXRyaWNzPy5saWtlX2NvdW50LFxuICAgICAgICByZXR3ZWV0X2NvdW50OiB0LnB1YmxpY19tZXRyaWNzPy5yZXR3ZWV0X2NvdW50LFxuICAgICAgICByZXBseV9jb3VudDogdC5wdWJsaWNfbWV0cmljcz8ucmVwbHlfY291bnRcbiAgICAgIH0pKSxcbiAgICAgIHJlc3VsdF9jb3VudDogcmVzcG9uc2UuZGF0YT8ubWV0YT8ucmVzdWx0X2NvdW50ID8/IDAsXG4gICAgICBuZXh0X3Rva2VuOiByZXNwb25zZS5kYXRhPy5tZXRhPy5uZXh0X3Rva2VuXG4gICAgfTtcbiAgfVxufTtcbmV4cG9ydCBkZWZhdWx0IGFjdGlvbjsiXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQ0EsUUFBbUI7QUFDbkIsSUFBTSxjQUFnQixTQUFPO0FBQUEsRUFDM0IsT0FBUyxTQUFPLEVBQUUsSUFBSSxDQUFDLEVBQUUsSUFBSSxHQUFHLEVBQUUsU0FBUyxzRUFBc0U7QUFBQSxFQUNqSCxhQUFlLFNBQU8sRUFBRSxJQUFJLEVBQUUsRUFBRSxJQUFJLEdBQUcsRUFBRSxTQUFTLEVBQUUsU0FBUyx3Q0FBd0M7QUFDdkcsQ0FBQztBQUNELElBQU0sY0FBZ0IsU0FBTztBQUFBLEVBQzNCLElBQU0sU0FBTztBQUFBLEVBQ2IsTUFBUSxTQUFPO0FBQUEsRUFDZixXQUFhLFNBQU8sRUFBRSxTQUFTO0FBQUEsRUFDL0IsWUFBYyxTQUFPLEVBQUUsU0FBUztBQUFBLEVBQ2hDLFlBQWMsU0FBTyxFQUFFLFNBQVM7QUFBQSxFQUNoQyxlQUFpQixTQUFPLEVBQUUsU0FBUztBQUFBLEVBQ25DLGFBQWUsU0FBTyxFQUFFLFNBQVM7QUFDbkMsQ0FBQztBQUNELElBQU0sZUFBaUIsU0FBTztBQUFBLEVBQzVCLFFBQVUsUUFBTSxXQUFXO0FBQUEsRUFDM0IsY0FBZ0IsU0FBTztBQUFBLEVBQ3ZCLFlBQWMsU0FBTyxFQUFFLFNBQVM7QUFDbEMsQ0FBQztBQUNELElBQU0sU0FBUztBQUFBLEVBQ2IsTUFBTTtBQUFBLEVBQ04sYUFBYTtBQUFBLEVBQ2IsU0FBUztBQUFBLEVBQ1QsVUFBVTtBQUFBLElBQ1IsUUFBUTtBQUFBLElBQ1IsTUFBTTtBQUFBLElBQ04sT0FBTztBQUFBLEVBQ1Q7QUFBQSxFQUNBLE9BQU87QUFBQSxFQUNQLFFBQVE7QUFBQSxFQUNSLE1BQU0sT0FBTyxPQUFPLFVBQVU7QUFDNUIsVUFBTSxXQUFXLE1BQU0sTUFBTSxNQUFNO0FBQUEsTUFDakMsUUFBUTtBQUFBLE1BQ1IsVUFBVTtBQUFBLE1BQ1YsUUFBUTtBQUFBLFFBQ04sT0FBTyxNQUFNO0FBQUEsUUFDYixhQUFhLE9BQU8sTUFBTSxlQUFlLEVBQUU7QUFBQSxRQUMzQyxnQkFBZ0I7QUFBQSxNQUNsQjtBQUFBLElBQ0YsQ0FBQztBQUNELFFBQUksU0FBUyxNQUFNLFFBQVEsUUFBUTtBQUNqQyxZQUFNLE1BQU0sU0FBUyxLQUFLLE9BQU8sQ0FBQztBQUNsQyxZQUFNLElBQUksTUFBTSxzQkFBc0IsSUFBSSxVQUFVLElBQUksV0FBVyxJQUFJLEtBQUssRUFBRTtBQUFBLElBQ2hGO0FBQ0EsVUFBTSxTQUFTLFNBQVMsTUFBTSxRQUFRLENBQUM7QUFDdkMsV0FBTztBQUFBO0FBQUEsTUFFTCxRQUFRLE9BQU8sSUFBSSxDQUFDLE9BQVk7QUFBQSxRQUM5QixJQUFJLEVBQUU7QUFBQSxRQUNOLE1BQU0sRUFBRTtBQUFBLFFBQ1IsV0FBVyxFQUFFO0FBQUEsUUFDYixZQUFZLEVBQUU7QUFBQSxRQUNkLFlBQVksRUFBRSxnQkFBZ0I7QUFBQSxRQUM5QixlQUFlLEVBQUUsZ0JBQWdCO0FBQUEsUUFDakMsYUFBYSxFQUFFLGdCQUFnQjtBQUFBLE1BQ2pDLEVBQUU7QUFBQSxNQUNGLGNBQWMsU0FBUyxNQUFNLE1BQU0sZ0JBQWdCO0FBQUEsTUFDbkQsWUFBWSxTQUFTLE1BQU0sTUFBTTtBQUFBLElBQ25DO0FBQUEsRUFDRjtBQUNGO0FBQ0EsSUFBTyx3QkFBUTsiLAogICJuYW1lcyI6IFtdCn0K
