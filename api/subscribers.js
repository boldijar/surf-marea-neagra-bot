import { listSubscribers } from "../lib/subscribers.js";

/**
 * GET /api/subscribers — list chat IDs (for broadcast / debugging).
 * Auth: Authorization: Bearer <SUBSCRIBERS_API_SECRET>
 * @param {import('@vercel/node').VercelRequest} req
 * @param {import('@vercel/node').VercelResponse} res
 */
export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }

  const secret = process.env.SUBSCRIBERS_API_SECRET;
  if (!secret) {
    return res.status(500).json({ ok: false, error: "SUBSCRIBERS_API_SECRET not set" });
  }

  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (token !== secret) {
    return res.status(401).json({ ok: false, error: "unauthorized" });
  }

  try {
    const chatIds = await listSubscribers();
    return res.status(200).json({ ok: true, count: chatIds.length, chatIds });
  } catch (err) {
    console.error("subscribers error", err);
    return res.status(500).json({ ok: false, error: String(err?.message || err) });
  }
}
