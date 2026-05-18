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

// twitter-v2/actions/get-user-tweets.ts
var get_user_tweets_exports = {};
__export(get_user_tweets_exports, {
  default: () => get_user_tweets_default
});
module.exports = __toCommonJS(get_user_tweets_exports);
var z = __toESM(require("zod"), 1);
var inputSchema = z.object({
  username: z.string().optional().describe("Twitter username (without @). If omitted, returns authenticated user tweets."),
  max_results: z.number().min(5).max(100).optional().describe("Number of tweets to return (5-100, default 10)")
});
var tweetSchema = z.object({
  id: z.string(),
  text: z.string(),
  created_at: z.string().optional(),
  like_count: z.number().optional(),
  retweet_count: z.number().optional(),
  reply_count: z.number().optional()
});
var outputSchema = z.object({
  tweets: z.array(tweetSchema),
  result_count: z.number()
});
var action = {
  type: "action",
  description: "Get recent tweets from a user timeline",
  version: "1.0.0",
  endpoint: {
    method: "GET",
    path: "/twitter/user/tweets",
    group: "Tweets"
  },
  input: inputSchema,
  output: outputSchema,
  exec: async (nango, input) => {
    let userId;
    if (input.username) {
      const userRes = await nango.proxy({
        method: "GET",
        endpoint: `/2/users/by/username/${input.username}`
      });
      if (userRes.data?.errors?.length) {
        const err = userRes.data.errors[0];
        throw new Error(`Twitter API error: ${err.detail || err.message || err.title}`);
      }
      userId = userRes.data?.data?.id;
      if (!userId) {
        throw new Error(`User @${input.username} not found`);
      }
    } else {
      const meRes = await nango.proxy({
        method: "GET",
        endpoint: "/2/users/me"
      });
      if (meRes.data?.errors?.length) {
        const err = meRes.data.errors[0];
        throw new Error(`Twitter API error: ${err.detail || err.message || err.title}`);
      }
      userId = meRes.data?.data?.id;
      if (!userId) {
        throw new Error("Could not resolve authenticated user");
      }
    }
    const response = await nango.proxy({
      method: "GET",
      endpoint: `/2/users/${userId}/tweets`,
      params: {
        max_results: String(input.max_results ?? 10),
        "tweet.fields": "created_at,public_metrics"
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
        created_at: t.created_at,
        like_count: t.public_metrics?.like_count,
        retweet_count: t.public_metrics?.retweet_count,
        reply_count: t.public_metrics?.reply_count
      })),
      result_count: response.data?.meta?.result_count ?? 0
    };
  }
};
var get_user_tweets_default = action;
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidHdpdHRlci12Mi9hY3Rpb25zL2dldC11c2VyLXR3ZWV0cy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiaW1wb3J0IHsgY3JlYXRlQWN0aW9uIH0gZnJvbSAnbmFuZ28nO1xuaW1wb3J0ICogYXMgeiBmcm9tICd6b2QnO1xuY29uc3QgaW5wdXRTY2hlbWEgPSB6Lm9iamVjdCh7XG4gIHVzZXJuYW1lOiB6LnN0cmluZygpLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ1R3aXR0ZXIgdXNlcm5hbWUgKHdpdGhvdXQgQCkuIElmIG9taXR0ZWQsIHJldHVybnMgYXV0aGVudGljYXRlZCB1c2VyIHR3ZWV0cy4nKSxcbiAgbWF4X3Jlc3VsdHM6IHoubnVtYmVyKCkubWluKDUpLm1heCgxMDApLm9wdGlvbmFsKCkuZGVzY3JpYmUoJ051bWJlciBvZiB0d2VldHMgdG8gcmV0dXJuICg1LTEwMCwgZGVmYXVsdCAxMCknKVxufSk7XG5jb25zdCB0d2VldFNjaGVtYSA9IHoub2JqZWN0KHtcbiAgaWQ6IHouc3RyaW5nKCksXG4gIHRleHQ6IHouc3RyaW5nKCksXG4gIGNyZWF0ZWRfYXQ6IHouc3RyaW5nKCkub3B0aW9uYWwoKSxcbiAgbGlrZV9jb3VudDogei5udW1iZXIoKS5vcHRpb25hbCgpLFxuICByZXR3ZWV0X2NvdW50OiB6Lm51bWJlcigpLm9wdGlvbmFsKCksXG4gIHJlcGx5X2NvdW50OiB6Lm51bWJlcigpLm9wdGlvbmFsKClcbn0pO1xuY29uc3Qgb3V0cHV0U2NoZW1hID0gei5vYmplY3Qoe1xuICB0d2VldHM6IHouYXJyYXkodHdlZXRTY2hlbWEpLFxuICByZXN1bHRfY291bnQ6IHoubnVtYmVyKClcbn0pO1xuY29uc3QgYWN0aW9uID0ge1xuICB0eXBlOiBcImFjdGlvblwiLFxuICBkZXNjcmlwdGlvbjogJ0dldCByZWNlbnQgdHdlZXRzIGZyb20gYSB1c2VyIHRpbWVsaW5lJyxcbiAgdmVyc2lvbjogJzEuMC4wJyxcbiAgZW5kcG9pbnQ6IHtcbiAgICBtZXRob2Q6ICdHRVQnLFxuICAgIHBhdGg6ICcvdHdpdHRlci91c2VyL3R3ZWV0cycsXG4gICAgZ3JvdXA6ICdUd2VldHMnXG4gIH0sXG4gIGlucHV0OiBpbnB1dFNjaGVtYSxcbiAgb3V0cHV0OiBvdXRwdXRTY2hlbWEsXG4gIGV4ZWM6IGFzeW5jIChuYW5nbywgaW5wdXQpID0+IHtcbiAgICBsZXQgdXNlcklkOiBzdHJpbmc7XG4gICAgaWYgKGlucHV0LnVzZXJuYW1lKSB7XG4gICAgICBjb25zdCB1c2VyUmVzID0gYXdhaXQgbmFuZ28ucHJveHkoe1xuICAgICAgICBtZXRob2Q6ICdHRVQnLFxuICAgICAgICBlbmRwb2ludDogYC8yL3VzZXJzL2J5L3VzZXJuYW1lLyR7aW5wdXQudXNlcm5hbWV9YFxuICAgICAgfSk7XG4gICAgICBpZiAodXNlclJlcy5kYXRhPy5lcnJvcnM/Lmxlbmd0aCkge1xuICAgICAgICBjb25zdCBlcnIgPSB1c2VyUmVzLmRhdGEuZXJyb3JzWzBdO1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYFR3aXR0ZXIgQVBJIGVycm9yOiAke2Vyci5kZXRhaWwgfHwgZXJyLm1lc3NhZ2UgfHwgZXJyLnRpdGxlfWApO1xuICAgICAgfVxuICAgICAgdXNlcklkID0gdXNlclJlcy5kYXRhPy5kYXRhPy5pZDtcbiAgICAgIGlmICghdXNlcklkKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihgVXNlciBAJHtpbnB1dC51c2VybmFtZX0gbm90IGZvdW5kYCk7XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIGNvbnN0IG1lUmVzID0gYXdhaXQgbmFuZ28ucHJveHkoe1xuICAgICAgICBtZXRob2Q6ICdHRVQnLFxuICAgICAgICBlbmRwb2ludDogJy8yL3VzZXJzL21lJ1xuICAgICAgfSk7XG4gICAgICBpZiAobWVSZXMuZGF0YT8uZXJyb3JzPy5sZW5ndGgpIHtcbiAgICAgICAgY29uc3QgZXJyID0gbWVSZXMuZGF0YS5lcnJvcnNbMF07XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihgVHdpdHRlciBBUEkgZXJyb3I6ICR7ZXJyLmRldGFpbCB8fCBlcnIubWVzc2FnZSB8fCBlcnIudGl0bGV9YCk7XG4gICAgICB9XG4gICAgICB1c2VySWQgPSBtZVJlcy5kYXRhPy5kYXRhPy5pZDtcbiAgICAgIGlmICghdXNlcklkKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcignQ291bGQgbm90IHJlc29sdmUgYXV0aGVudGljYXRlZCB1c2VyJyk7XG4gICAgICB9XG4gICAgfVxuICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgbmFuZ28ucHJveHkoe1xuICAgICAgbWV0aG9kOiAnR0VUJyxcbiAgICAgIGVuZHBvaW50OiBgLzIvdXNlcnMvJHt1c2VySWR9L3R3ZWV0c2AsXG4gICAgICBwYXJhbXM6IHtcbiAgICAgICAgbWF4X3Jlc3VsdHM6IFN0cmluZyhpbnB1dC5tYXhfcmVzdWx0cyA/PyAxMCksXG4gICAgICAgICd0d2VldC5maWVsZHMnOiAnY3JlYXRlZF9hdCxwdWJsaWNfbWV0cmljcydcbiAgICAgIH1cbiAgICB9KTtcbiAgICBpZiAocmVzcG9uc2UuZGF0YT8uZXJyb3JzPy5sZW5ndGgpIHtcbiAgICAgIGNvbnN0IGVyciA9IHJlc3BvbnNlLmRhdGEuZXJyb3JzWzBdO1xuICAgICAgdGhyb3cgbmV3IEVycm9yKGBUd2l0dGVyIEFQSSBlcnJvcjogJHtlcnIuZGV0YWlsIHx8IGVyci5tZXNzYWdlIHx8IGVyci50aXRsZX1gKTtcbiAgICB9XG4gICAgY29uc3QgdHdlZXRzID0gcmVzcG9uc2UuZGF0YT8uZGF0YSB8fCBbXTtcbiAgICByZXR1cm4ge1xuICAgICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uby1leHBsaWNpdC1hbnlcbiAgICAgIHR3ZWV0czogdHdlZXRzLm1hcCgodDogYW55KSA9PiAoe1xuICAgICAgICBpZDogdC5pZCxcbiAgICAgICAgdGV4dDogdC50ZXh0LFxuICAgICAgICBjcmVhdGVkX2F0OiB0LmNyZWF0ZWRfYXQsXG4gICAgICAgIGxpa2VfY291bnQ6IHQucHVibGljX21ldHJpY3M/Lmxpa2VfY291bnQsXG4gICAgICAgIHJldHdlZXRfY291bnQ6IHQucHVibGljX21ldHJpY3M/LnJldHdlZXRfY291bnQsXG4gICAgICAgIHJlcGx5X2NvdW50OiB0LnB1YmxpY19tZXRyaWNzPy5yZXBseV9jb3VudFxuICAgICAgfSkpLFxuICAgICAgcmVzdWx0X2NvdW50OiByZXNwb25zZS5kYXRhPy5tZXRhPy5yZXN1bHRfY291bnQgPz8gMFxuICAgIH07XG4gIH1cbn07XG5leHBvcnQgZGVmYXVsdCBhY3Rpb247Il0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUNBLFFBQW1CO0FBQ25CLElBQU0sY0FBZ0IsU0FBTztBQUFBLEVBQzNCLFVBQVksU0FBTyxFQUFFLFNBQVMsRUFBRSxTQUFTLDhFQUE4RTtBQUFBLEVBQ3ZILGFBQWUsU0FBTyxFQUFFLElBQUksQ0FBQyxFQUFFLElBQUksR0FBRyxFQUFFLFNBQVMsRUFBRSxTQUFTLGdEQUFnRDtBQUM5RyxDQUFDO0FBQ0QsSUFBTSxjQUFnQixTQUFPO0FBQUEsRUFDM0IsSUFBTSxTQUFPO0FBQUEsRUFDYixNQUFRLFNBQU87QUFBQSxFQUNmLFlBQWMsU0FBTyxFQUFFLFNBQVM7QUFBQSxFQUNoQyxZQUFjLFNBQU8sRUFBRSxTQUFTO0FBQUEsRUFDaEMsZUFBaUIsU0FBTyxFQUFFLFNBQVM7QUFBQSxFQUNuQyxhQUFlLFNBQU8sRUFBRSxTQUFTO0FBQ25DLENBQUM7QUFDRCxJQUFNLGVBQWlCLFNBQU87QUFBQSxFQUM1QixRQUFVLFFBQU0sV0FBVztBQUFBLEVBQzNCLGNBQWdCLFNBQU87QUFDekIsQ0FBQztBQUNELElBQU0sU0FBUztBQUFBLEVBQ2IsTUFBTTtBQUFBLEVBQ04sYUFBYTtBQUFBLEVBQ2IsU0FBUztBQUFBLEVBQ1QsVUFBVTtBQUFBLElBQ1IsUUFBUTtBQUFBLElBQ1IsTUFBTTtBQUFBLElBQ04sT0FBTztBQUFBLEVBQ1Q7QUFBQSxFQUNBLE9BQU87QUFBQSxFQUNQLFFBQVE7QUFBQSxFQUNSLE1BQU0sT0FBTyxPQUFPLFVBQVU7QUFDNUIsUUFBSTtBQUNKLFFBQUksTUFBTSxVQUFVO0FBQ2xCLFlBQU0sVUFBVSxNQUFNLE1BQU0sTUFBTTtBQUFBLFFBQ2hDLFFBQVE7QUFBQSxRQUNSLFVBQVUsd0JBQXdCLE1BQU0sUUFBUTtBQUFBLE1BQ2xELENBQUM7QUFDRCxVQUFJLFFBQVEsTUFBTSxRQUFRLFFBQVE7QUFDaEMsY0FBTSxNQUFNLFFBQVEsS0FBSyxPQUFPLENBQUM7QUFDakMsY0FBTSxJQUFJLE1BQU0sc0JBQXNCLElBQUksVUFBVSxJQUFJLFdBQVcsSUFBSSxLQUFLLEVBQUU7QUFBQSxNQUNoRjtBQUNBLGVBQVMsUUFBUSxNQUFNLE1BQU07QUFDN0IsVUFBSSxDQUFDLFFBQVE7QUFDWCxjQUFNLElBQUksTUFBTSxTQUFTLE1BQU0sUUFBUSxZQUFZO0FBQUEsTUFDckQ7QUFBQSxJQUNGLE9BQU87QUFDTCxZQUFNLFFBQVEsTUFBTSxNQUFNLE1BQU07QUFBQSxRQUM5QixRQUFRO0FBQUEsUUFDUixVQUFVO0FBQUEsTUFDWixDQUFDO0FBQ0QsVUFBSSxNQUFNLE1BQU0sUUFBUSxRQUFRO0FBQzlCLGNBQU0sTUFBTSxNQUFNLEtBQUssT0FBTyxDQUFDO0FBQy9CLGNBQU0sSUFBSSxNQUFNLHNCQUFzQixJQUFJLFVBQVUsSUFBSSxXQUFXLElBQUksS0FBSyxFQUFFO0FBQUEsTUFDaEY7QUFDQSxlQUFTLE1BQU0sTUFBTSxNQUFNO0FBQzNCLFVBQUksQ0FBQyxRQUFRO0FBQ1gsY0FBTSxJQUFJLE1BQU0sc0NBQXNDO0FBQUEsTUFDeEQ7QUFBQSxJQUNGO0FBQ0EsVUFBTSxXQUFXLE1BQU0sTUFBTSxNQUFNO0FBQUEsTUFDakMsUUFBUTtBQUFBLE1BQ1IsVUFBVSxZQUFZLE1BQU07QUFBQSxNQUM1QixRQUFRO0FBQUEsUUFDTixhQUFhLE9BQU8sTUFBTSxlQUFlLEVBQUU7QUFBQSxRQUMzQyxnQkFBZ0I7QUFBQSxNQUNsQjtBQUFBLElBQ0YsQ0FBQztBQUNELFFBQUksU0FBUyxNQUFNLFFBQVEsUUFBUTtBQUNqQyxZQUFNLE1BQU0sU0FBUyxLQUFLLE9BQU8sQ0FBQztBQUNsQyxZQUFNLElBQUksTUFBTSxzQkFBc0IsSUFBSSxVQUFVLElBQUksV0FBVyxJQUFJLEtBQUssRUFBRTtBQUFBLElBQ2hGO0FBQ0EsVUFBTSxTQUFTLFNBQVMsTUFBTSxRQUFRLENBQUM7QUFDdkMsV0FBTztBQUFBO0FBQUEsTUFFTCxRQUFRLE9BQU8sSUFBSSxDQUFDLE9BQVk7QUFBQSxRQUM5QixJQUFJLEVBQUU7QUFBQSxRQUNOLE1BQU0sRUFBRTtBQUFBLFFBQ1IsWUFBWSxFQUFFO0FBQUEsUUFDZCxZQUFZLEVBQUUsZ0JBQWdCO0FBQUEsUUFDOUIsZUFBZSxFQUFFLGdCQUFnQjtBQUFBLFFBQ2pDLGFBQWEsRUFBRSxnQkFBZ0I7QUFBQSxNQUNqQyxFQUFFO0FBQUEsTUFDRixjQUFjLFNBQVMsTUFBTSxNQUFNLGdCQUFnQjtBQUFBLElBQ3JEO0FBQUEsRUFDRjtBQUNGO0FBQ0EsSUFBTywwQkFBUTsiLAogICJuYW1lcyI6IFtdCn0K
