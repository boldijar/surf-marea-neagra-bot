# Marea Neagra — Telegram surf bot

Bot de surf pe Marea Neagra:

- **Next.js pe Vercel** — homepage și webhook Telegram: userul dă `/start` → chat ID salvat în Redis
- **GitHub Actions** — `bot.py` rulează orar și trimite raportul (momentan la un singur `CHAT_ID`)

## Abonare (Vercel)

1. Creează proiect pe [Vercel](https://vercel.com) din acest repo.
2. Adaugă **Upstash Redis** (Vercel Marketplace → Upstash) — setează automat:
   - `UPSTASH_REDIS_REST_URL`
   - `UPSTASH_REDIS_REST_TOKEN`
3. În **Settings → Environment Variables** pe Vercel:
   - `TELEGRAM_BOT_TOKEN` — token de la [@BotFather](https://t.me/BotFather)
   - `TELEGRAM_WEBHOOK_SECRET` — string random (ex. `openssl rand -hex 16`)
   - `SUBSCRIBERS_API_SECRET` — alt string random (pentru listarea abonaților)
4. Deploy.
5. Leagă webhook-ul Telegram (înlocuiește valorile):

```bash
curl "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook" \
  -d "url=https://YOUR_APP.vercel.app/api/webhook" \
  -d "secret_token=${TELEGRAM_WEBHOOK_SECRET}" \
  -d "allowed_updates=[\"message\"]"
```

6. În Telegram: deschide botul → `/start` → ar trebui să fii pe listă.

### Comenzi bot

| Comandă | Efect |
|---------|--------|
| `/start` | te adaugă în lista de chat ID-uri |
| `/stop` | te scoate din listă |
| `/help` | comenzi |

### Lista abonaților

```bash
curl -H "Authorization: Bearer ${SUBSCRIBERS_API_SECRET}" \
  https://YOUR_APP.vercel.app/api/subscribers
```

Răspuns: `{ "ok": true, "count": N, "chatIds": ["123", ...] }`

## Broadcast (GitHub Actions — existent)

1. În repo: **Settings → Secrets and variables → Actions**:
   - `TELEGRAM_BOT_TOKEN`
   - `TELEGRAM_CHAT_ID` (un singur chat, până legăm broadcast-ul de lista din Redis)
2. Workflows:
   - **Hourly surf report** — `0 * * * *` UTC
   - **Manual surf report** — Actions → Manual surf report → **Run workflow**

## Local (Python report)

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
export TELEGRAM_BOT_TOKEN='...'
export TELEGRAM_CHAT_ID='...'
python bot.py
```

## Local (Next.js)

```bash
npm install
# pune variabilele din .env.example în env
npm run dev
```
