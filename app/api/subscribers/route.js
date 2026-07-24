import { listSubscribers } from "../../../lib/subscribers.js";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const secret = process.env.SUBSCRIBERS_API_SECRET;
  if (!secret) {
    return Response.json(
      { ok: false, error: "SUBSCRIBERS_API_SECRET not set" },
      { status: 500 },
    );
  }

  const auth = request.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (token !== secret) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  try {
    const chatIds = await listSubscribers();
    return Response.json({ ok: true, count: chatIds.length, chatIds });
  } catch (error) {
    console.error("subscribers error", error);
    return Response.json(
      { ok: false, error: String(error?.message || error) },
      { status: 500 },
    );
  }
}
