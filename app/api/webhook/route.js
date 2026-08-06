import {
  addSubscriber,
  removeSubscriber,
} from "../../../lib/subscribers.js";
import { buildLiveStatusMessage } from "../../../lib/status.js";
import { sendMessage } from "../../../lib/telegram.js";

const messages = {
  startNew:
    "Te-ai abonat la raportul Marea Neagra.\nCand apar zile interesante, iti scriu aici.\n\n/stop ca sa te dezabonezi.\n/status — cum e marea acum.",
  startExists:
    "Esti deja pe lista. Cand apar zile interesante, iti scriu aici.\n\n/stop ca sa te dezabonezi.\n/status — cum e marea acum.",
  stopRemoved:
    "Te-ai dezabonat. Nu mai primesti mesaje de la bot.\n\n/start daca vrei din nou pe lista.\n/status — cum e marea acum.",
  stopMissing: "Nu erai pe lista. /start ca sa te abonezi.",
  help: "Comenzi:\n/start — abonare la raport\n/stop — dezabonare\n/status — cum e marea acum",
};

const surfQuotes = [
  "Oceanul nu are memorie, dar valurile lui ne scriu poveștile în spumă.",
  "Să surfezi e ca și cum ai încerca să îmbrățișezi vântul în timp ce dansezi pe apă.",
  "Fiecare val e o promisiune a mării că libertatea încă există.",
  "În inima oceanului, găsești acea liniște care nu are nevoie de cuvinte.",
  "Valul este un munte care se mișcă, iar tu ești pasărea care îl cucerește.",
  "Marea nu te judecă, ea doar te primește în dansul ei nesfârșit.",
  "Uneori, cel mai bun mod de a merge înainte este să te lași purtat de curent.",
];

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
    switch (command) {
      case "/start": {
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

      case "/stop": {
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

      case "/help": {
        await sendMessage(chatId, messages.help);
        return Response.json({ ok: true, action: "help" });
      }

      case "/status": {
        const status = await buildLiveStatusMessage();
        await sendMessage(chatId, status);
        return Response.json({ ok: true, action: "status" });
      }

      default: {
        const randomQuote =
          surfQuotes[Math.floor(Math.random() * surfQuotes.length)];
        const reply = `${randomQuote}\n\n${messages.help}`;
        await sendMessage(chatId, reply);
        return Response.json({ ok: true, action: "unknown_command" });
      }
    }
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
