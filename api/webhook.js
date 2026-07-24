const {
  addSubscriber,
  removeSubscriber,
} = require("../lib/subscribers.js");
const { sendMessage } = require("../lib/telegram.js");

const MSG_START_NEW =
  "Te-ai abonat la raportul Marea Neagra.\nCand apar zile interesante, iti scriu aici.\n\n/stop ca sa te dezabonezi.";
const MSG_START_EXISTS =
  "Esti deja pe lista. Cand apar zile interesante, iti scriu aici.\n\n/stop ca sa te dezabonezi.";
const MSG_STOP_REMOVED =
  "Te-ai dezabonat. Nu mai primesti mesaje de la bot.\n\n/start daca vrei din nou pe lista.";
const MSG_STOP_MISSING =
  "Nu erai pe lista. /start ca sa te abonezi.";
const MSG_HELP =
  "Comenzi:\n/start — abonare la raport\n/stop — dezabonare";

function unauthorized(res) {
  return res.status(401).json({ ok: false, error: "unauthorized" });
}

/**
 * Telegram webhook: /start → add chat_id, /stop → remove.
 */
module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }

  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (secret) {
    const header = req.headers["x-telegram-bot-api-secret-token"];
    if (header !== secret) {
      return unauthorized(res);
    }
  }

  const update = req.body;
  const message = update?.message || update?.edited_message;
  if (!message?.chat?.id || typeof message.text !== "string") {
    return res.status(200).json({ ok: true, ignored: true });
  }

  const chatId = message.chat.id;
  const text = message.text.trim();
  const command = text.split(/\s+/)[0].split("@")[0].toLowerCase();

  try {
    if (command === "/start") {
      const isNew = await addSubscriber(chatId);
      await sendMessage(chatId, isNew ? MSG_START_NEW : MSG_START_EXISTS);
      return res.status(200).json({ ok: true, action: isNew ? "subscribed" : "already" });
    }

    if (command === "/stop") {
      const removed = await removeSubscriber(chatId);
      await sendMessage(chatId, removed ? MSG_STOP_REMOVED : MSG_STOP_MISSING);
      return res.status(200).json({ ok: true, action: removed ? "unsubscribed" : "missing" });
    }

    if (command === "/help") {
      await sendMessage(chatId, MSG_HELP);
      return res.status(200).json({ ok: true, action: "help" });
    }

    return res.status(200).json({ ok: true, ignored: true });
  } catch (err) {
    console.error("webhook error", err);
    return res.status(200).json({ ok: false, error: String(err?.message || err) });
  }
};
