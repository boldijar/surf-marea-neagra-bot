# Marea Neagra — Telegram surf bot

Rulează `bot.py` orar via GitHub Actions și trimite un mesaj scurt pe Telegram.

## Setup

1. Creează un repo pe GitHub și dă push la acest folder.
2. În repo: **Settings → Secrets and variables → Actions** adaugă:
   - `TELEGRAM_BOT_TOKEN`
   - `TELEGRAM_CHAT_ID`
3. Workflows:
   - **Hourly surf report** — `0 * * * *` UTC
   - **Manual surf report** — Actions → Manual surf report → **Run workflow**

## Local

```bash
cd /Users/ljr/Projects/marea-neagra-bot
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
export TELEGRAM_BOT_TOKEN='...'
export TELEGRAM_CHAT_ID='...'
python bot.py
```
