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
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// twitter-v2/actions/get-notifications.ts
var get_notifications_exports = {};
__export(get_notifications_exports, {
  default: () => get_notifications_default
});
module.exports = __toCommonJS(get_notifications_exports);
var z = __toESM(require("zod"), 1);
var notificationSchema = z.object({
  type: z.string(),
  id: z.string(),
  text: z.string().optional(),
  author_id: z.string().optional(),
  author_username: z.string().optional(),
  author_name: z.string().optional(),
  created_at: z.string().optional(),
  like_count: z.number().optional(),
  retweet_count: z.number().optional(),
  reply_count: z.number().optional(),
  in_reply_to_tweet_id: z.string().optional(),
  followers_count: z.number().optional()
});
var inputSchema = z.object({
  max_per_type: z.number().min(5).max(50).optional().describe("Max results per notification type (5-50, default 10)")
});
var outputSchema = z.object({
  notifications: z.array(notificationSchema),
  summary: z.object({
    mentions: z.number(),
    replies: z.number(),
    likes_on_recent: z.number()
  })
});
var action = {
  type: "action",
  description: "Get a combined notifications feed: mentions, replies, and likes on your recent tweets",
  version: "1.0.0",
  endpoint: {
    method: "GET",
    path: "/twitter/notifications",
    group: "Notifications"
  },
  input: inputSchema,
  output: outputSchema,
  exec: async (nango, input) => {
    const maxPerType = input.max_per_type ?? 10;
    const notifications = [];

    // 1. Get user info
    const meResp = await nango.proxy({ method: "GET", endpoint: "/2/users/me" });
    const userId = meResp.data?.data?.id;
    const username = meResp.data?.data?.username;
    if (!userId || !username) throw new Error("Could not resolve authenticated user");

    // 2. Fetch mentions, replies, and recent tweets in parallel
    const [mentionsResp, repliesResp, tweetsResp] = await Promise.all([
      // Mentions (@username)
      nango.proxy({
        method: "GET",
        endpoint: `/2/users/${userId}/mentions`,
        params: {
          max_results: String(maxPerType),
          "tweet.fields": "author_id,created_at,public_metrics",
          "expansions": "author_id",
          "user.fields": "username,name"
        }
      }),
      // Replies (to:username, excluding self)
      nango.proxy({
        method: "GET",
        endpoint: "/2/tweets/search/recent",
        params: {
          query: `to:${username} -from:${username} is:reply`,
          max_results: String(Math.max(10, maxPerType)),
          "tweet.fields": "author_id,created_at,public_metrics,in_reply_to_user_id",
          "expansions": "author_id",
          "user.fields": "username,name"
        }
      }),
      // Recent own tweets (to check likes)
      nango.proxy({
        method: "GET",
        endpoint: `/2/users/${userId}/tweets`,
        params: {
          max_results: "5",
          "tweet.fields": "public_metrics,created_at"
        }
      })
    ]);

    // Build user maps from expansions
    const buildUserMap = (resp) => {
      const map = {};
      for (const u of (resp.data?.includes?.users || [])) {
        map[u.id] = { username: u.username, name: u.name };
      }
      return map;
    };

    // Process mentions
    const mentionUsers = buildUserMap(mentionsResp);
    const mentionTweets = mentionsResp.data?.data || [];
    // Track mention IDs to deduplicate against replies
    const mentionIds = new Set(mentionTweets.map(t => t.id));
    for (const t of mentionTweets) {
      const user = mentionUsers[t.author_id] || {};
      notifications.push({
        type: "mention",
        id: t.id,
        text: t.text,
        author_id: t.author_id,
        author_username: user.username,
        author_name: user.name,
        created_at: t.created_at,
        like_count: t.public_metrics?.like_count,
        retweet_count: t.public_metrics?.retweet_count,
        reply_count: t.public_metrics?.reply_count
      });
    }

    // Process replies (deduplicate against mentions)
    const replyUsers = buildUserMap(repliesResp);
    const replyTweets = repliesResp.data?.data || [];
    let replyCount = 0;
    for (const t of replyTweets) {
      if (mentionIds.has(t.id)) continue; // Already in mentions
      const user = replyUsers[t.author_id] || {};
      notifications.push({
        type: "reply",
        id: t.id,
        text: t.text,
        author_id: t.author_id,
        author_username: user.username,
        author_name: user.name,
        created_at: t.created_at,
        like_count: t.public_metrics?.like_count,
        retweet_count: t.public_metrics?.retweet_count,
        reply_count: t.public_metrics?.reply_count,
        in_reply_to_tweet_id: t.in_reply_to_user_id
      });
      replyCount++;
    }

    // Process likes on recent tweets — fetch liking users for top tweet
    let likesOnRecent = 0;
    const recentTweets = tweetsResp.data?.data || [];
    if (recentTweets.length > 0) {
      // Pick the most recent tweet with likes
      const tweetWithLikes = recentTweets.find(t => (t.public_metrics?.like_count || 0) > 0);
      if (tweetWithLikes) {
        try {
          const likingResp = await nango.proxy({
            method: "GET",
            endpoint: `/2/tweets/${tweetWithLikes.id}/liking_users`,
            params: {
              max_results: String(Math.min(maxPerType, 100)),
              "user.fields": "username,name,public_metrics"
            }
          });
          const likingUsers = likingResp.data?.data || [];
          likesOnRecent = likingUsers.length;
          for (const u of likingUsers) {
            notifications.push({
              type: "like",
              id: `like-${tweetWithLikes.id}-${u.id}`,
              text: `Liked your tweet: "${tweetWithLikes.text?.slice(0, 100)}..."`,
              author_id: u.id,
              author_username: u.username,
              author_name: u.name,
              followers_count: u.public_metrics?.followers_count
            });
          }
        } catch (e) {
          // Non-critical — skip likes if rate limited
        }
      }
    }

    // Sort by created_at descending (likes don't have dates, go last)
    notifications.sort((a, b) => {
      if (!a.created_at && !b.created_at) return 0;
      if (!a.created_at) return 1;
      if (!b.created_at) return -1;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

    return {
      notifications,
      summary: {
        mentions: mentionTweets.length,
        replies: replyCount,
        likes_on_recent: likesOnRecent
      }
    };
  }
};
var get_notifications_default = action;
