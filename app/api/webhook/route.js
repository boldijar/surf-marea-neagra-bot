import {
  addSubscriber,
  removeSubscriber,
} from "../../../lib/subscribers.js";
import { sendMessage } from "../../../lib/telegram.js";

const messages = {
  startNew:
    "Te-ai abonat la raportul Marea Neagra.\nCand apar zile interesante, iti scriu aici.\n\n/stop ca sa te dezabonezi.",
  startExists:
    "Esti deja pe lista. Cand apar zile interesante, iti scriu aici.\n\n/stop ca sa te dezabonezi.",
  stopRemoved:
    "Te-ai dezabonat. Nu mai primesti mesaje de la bot.\n\n/start daca vrei din nou pe lista.",
  stopMissing: "Nu erai pe lista. /start ca sa te abonezi.",
  help: "Comenzi:\n/start — abonare la raport\n/stop — dezabonare",
};

export async function POST(request) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  const suppliedSecret = request.headers.get(
    "x-telegram-bot-api-secret-token",
  );

  if (secret && suppliedSecret !== secret) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let update;
  try {
    update = await request.json();
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const message = update?.message || update?.edited_message;
  if (!message?.chat?.id || typeof message.text !== "string") {
    return Response.json({ ok: true, ignored: true });
  }

  const chatId = message.chat.id;
  const command = message.text
    .trim()
    .split(/\s+/)[0]
    .split("@")[0]
    .toLowerCase();

  try {
    if (command === "/start") {
      const isNew = await addSubscriber(chatId);
      await sendMessage(
        chatId,
        isNew ? messages.startNew : messages.startExists,
      );
      return Response.json({
        ok: true,
        action: isNew ? "subscribed" : "already",
      });
    }

    if (command === "/stop") {
      const removed = await removeSubscriber(chatId);
      await sendMessage(
        chatId,
        removed ? messages.stopRemoved : messages.stopMissing,
      );
      return Response.json({
        ok: true,
        action: removed ? "unsubscribed" : "missing",
      });
    }

    if (command === "/help") {
      await sendMessage(chatId, messages.help);
      return Response.json({ ok: true, action: "help" });
    }

    return Response.json({ ok: true, ignored: true });
  } catch (error) {
    console.error("webhook error", error);
    // Acknowledge the update so Telegram does not retry indefinitely.
    return Response.json({
      ok: false,
      error: String(error?.message || error),
    });
  }
}

export async function GET() {
  return Response.json(
    { ok: false, error: "method_not_allowed" },
    { status: 405, headers: { Allow: "POST" } },
  );
}
