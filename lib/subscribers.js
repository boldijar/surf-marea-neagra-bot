import { Redis } from "@upstash/redis";

const SUBSCRIBERS_KEY = "subscribers";

function getRedis() {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

  if (!url || !token) {
    throw new Error(
      "Missing Upstash Redis env: UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN"
    );
  }

  return new Redis({ url, token });
}

/** @param {string|number} chatId */
export async function addSubscriber(chatId) {
  const redis = getRedis();
  const added = await redis.sadd(SUBSCRIBERS_KEY, String(chatId));
  return added === 1;
}

/** @param {string|number} chatId */
export async function removeSubscriber(chatId) {
  const redis = getRedis();
  const removed = await redis.srem(SUBSCRIBERS_KEY, String(chatId));
  return removed === 1;
}

export async function listSubscribers() {
  const redis = getRedis();
  const members = await redis.smembers(SUBSCRIBERS_KEY);
  return (members || []).map(String);
}
