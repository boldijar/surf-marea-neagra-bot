import { Redis } from "@upstash/redis";

const SUBSCRIBERS_KEY = "subscribers";

function maskEnv(value) {
  if (value == null) return { present: false };
  const s = String(value);
  if (!s) return { present: true, length: 0, preview: "(empty string)" };
  const head = s.slice(0, 8);
  const tail = s.slice(-6);
  return {
    present: true,
    length: s.length,
    preview: s.length <= 14 ? `${head}…` : `${head}…${tail}`,
  };
}

function getRedis() {
  const rawUrl = process.env.UPSTASH_REDIS_REST_URL;
  const rawToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  const kvUrl = process.env.KV_REST_API_URL;
  const kvToken = process.env.KV_REST_API_TOKEN;

  // TEMP debug — remove after diagnosing missing Redis env on Vercel
  console.error("[redis-env-debug]", {
    vercelEnv: process.env.VERCEL_ENV || null,
    nodeEnv: process.env.NODE_ENV || null,
    UPSTASH_REDIS_REST_URL: maskEnv(rawUrl),
    UPSTASH_REDIS_REST_TOKEN: maskEnv(rawToken),
    KV_REST_API_URL: maskEnv(kvUrl),
    KV_REST_API_TOKEN: maskEnv(kvToken),
  });

  const url = rawUrl || kvUrl;
  const token = rawToken || kvToken;

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
