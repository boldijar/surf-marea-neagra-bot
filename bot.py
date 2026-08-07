#!/usr/bin/env python3
"""Local surf report → Telegram (same logic as api/surf-report.js)."""

from __future__ import annotations

import json
import math
import os
import random
from datetime import datetime
from typing import Any
from urllib.parse import urlencode
from zoneinfo import ZoneInfo

import requests

TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "").strip()
UPSTASH_URL = (
    os.environ.get("UPSTASH_REDIS_REST_URL")
    or os.environ.get("KV_REST_API_URL")
    or ""
).strip()
UPSTASH_TOKEN = (
    os.environ.get("UPSTASH_REDIS_REST_TOKEN")
    or os.environ.get("KV_REST_API_TOKEN")
    or ""
).strip()
SUBSCRIBERS_KEY = "subscribers"

if not TOKEN:
    raise SystemExit("Set TELEGRAM_BOT_TOKEN in the environment.")
if not UPSTASH_URL or not UPSTASH_TOKEN:
    raise SystemExit(
        "Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN in the environment."
    )

LAT = 44.1809304
LON = 28.6563829
TIMEZONE = "Europe/Bucharest"
FORECAST_DAYS = 8
# Internal threshold for "interesting" days — not phrased that way in the text. Later to configure
SCORE_MIN = 6
STATS_SCORE_MIN = 5

BLACK_SEA_SCORING = {
    "offshoreWind": 270,
    "idealSwellDirection": 45,
    "swellDirectionScores": [
        {"maxDelta": 30, "score": 10},
        {"maxDelta": 60, "score": 7},
        {"maxDelta": 120, "score": 4},
        {"maxDelta": 180, "score": 2},
    ],
    "windDirectionScores": [
        {"maxDelta": 30, "score": 10},
        {"maxDelta": 70, "score": 6},
        {"maxDelta": 120, "score": 3},
        {"maxDelta": 180, "score": 1},
    ],
}

RO_DAYS = [
    "Duminica",
    "Luni",
    "Marti",
    "Miercuri",
    "Joi",
    "Vineri",
    "Sambata",
]

RO_MONTHS = [
    "",
    "ian.",
    "feb.",
    "mar.",
    "apr.",
    "mai",
    "iun.",
    "iul.",
    "aug.",
    "sept.",
    "oct.",
    "nov.",
    "dec.",
]


def num(v: Any) -> float | None:
    if isinstance(v, (int, float)) and not isinstance(v, bool) and not math.isnan(v):
        return float(v)
    return None


def angular_difference(a: float, b: float) -> float:
    return abs(((a - b + 180) % 360) - 180)


def score_from_direction(actual: float, ideal: float, rules: list[dict]) -> float:
    delta = angular_difference(actual, ideal)
    for rule in rules:
        if delta <= rule["maxDelta"]:
            return rule["score"]
    return 1


def score_wind(wind: dict, scoring: dict) -> float:
    direction_score = score_from_direction(
        wind["direction"],
        scoring["offshoreWind"],
        scoring["windDirectionScores"],
    )
    speed = wind["speed"]
    if speed < 8:
        speed_score = 10
    elif speed < 15:
        speed_score = 8
    elif speed < 20:
        speed_score = 6
    elif speed < 28:
        speed_score = 4
    else:
        speed_score = 2
    gusts = wind["gusts"]
    if gusts > 35:
        speed_score = max(1, speed_score - 2)
    elif gusts > 25:
        speed_score = max(2, speed_score - 1)
    return round((direction_score * 0.6 + speed_score * 0.4) * 10) / 10


def score_black_sea_size(height: float) -> float:
    if height < 0.15:
        return 1
    if height < 0.3:
        return 1 + ((height - 0.15) / 0.15) * 1.5
    if height < 0.5:
        return 2.5 + ((height - 0.3) / 0.2) * 1.5
    if height < 0.8:
        return 4 + ((height - 0.5) / 0.3) * 2
    if height < 1.1:
        return 6 + ((height - 0.8) / 0.3) * 2.5
    if height <= 1.5:
        peak = 1.3
        if height <= peak:
            return 8.5 + ((height - 1.1) / (peak - 1.1)) * 1.5
        return 10 - ((height - peak) / (1.5 - peak)) * 2
    if height <= 2.2:
        return 8 - ((height - 1.5) / 0.7) * 3
    return max(2, 5 - (height - 2.2))


def score_black_sea_period(period: float) -> float:
    if period < 4:
        return 2
    if period < 5:
        return 3.5
    if period < 6:
        return 5
    if period < 7:
        return 6
    if period < 8:
        return 7.5
    if period < 10:
        return 8.5
    if period < 12:
        return 9.5
    return 10


def score_black_sea_cleanliness(swell_height: float, total_height: float) -> float:
    if total_height <= 0:
        return 1
    ratio = swell_height / total_height
    if ratio > 0.75:
        return 8
    if ratio > 0.55:
        return 6
    if ratio > 0.4:
        return 4
    return 3


def max_score_for_height(height: float) -> float:
    if height < 0.25:
        return 2
    if height < 0.35:
        return 3
    if height < 0.45:
        return 4.5
    if height < 0.5:
        return 4.9
    if height < 0.65:
        return 6
    if height < 0.85:
        return 7.5
    if height < 1.05:
        return 9
    if height < 1.25:
        return 9.8
    return 10


def calculate_black_sea_score(marine: dict, wind: dict) -> float:
    height = marine.get("swellHeight")
    if height is None:
        height = marine["waveHeight"]
    period = marine.get("swellPeriod") or marine.get("wavePeriod") or 0
    scoring = BLACK_SEA_SCORING
    breakdown = {
        "size": score_black_sea_size(height),
        "period": score_black_sea_period(period),
        "cleanliness": score_black_sea_cleanliness(
            marine["swellHeight"], marine["waveHeight"]
        ),
        "wind": score_wind(wind, scoring),
        "swellDirection": score_from_direction(
            marine["swellDirection"],
            scoring["idealSwellDirection"],
            scoring["swellDirectionScores"],
        ),
    }
    overall = (
        breakdown["size"] * 0.52
        + breakdown["period"] * 0.18
        + breakdown["cleanliness"] * 0.05
        + breakdown["wind"] * 0.22
        + breakdown["swellDirection"] * 0.03
    )
    overall = min(overall, max_score_for_height(height))
    if height >= 1.15 and height <= 1.5 and period >= 8 and breakdown["wind"] >= 8:
        overall = min(10, overall + 0.5)
    if overall >= 9.5 and (period < 7 or breakdown["wind"] < 7):
        overall = min(overall, 8.5)
    if overall >= 9 and height < 1.1:
        overall = min(overall, 8)
    return round(overall * 10) / 10


def format_ro_date(iso: str) -> str:
    d = datetime.fromisoformat(f"{str(iso)[:10]}T12:00:00")
    # Python Monday=0…Sunday=6 → JS getDay Sunday=0…Saturday=6
    js_day = (d.weekday() + 1) % 7
    return f"{RO_DAYS[js_day]}, {d.day} {RO_MONTHS[d.month]}"


def fetch_json(url: str) -> dict:
    res = requests.get(url, timeout=30)
    res.raise_for_status()
    data = res.json()
    if data.get("error"):
        raise RuntimeError(data.get("reason") or "Open-Meteo error")
    return data


def build_daily_forecast() -> tuple[list[dict], dict[str, list[dict]]]:
    marine_params = urlencode(
        {
            "latitude": LAT,
            "longitude": LON,
            "cell_selection": "sea",
            "timezone": TIMEZONE,
            "forecast_days": FORECAST_DAYS,
            "daily": ",".join(
                [
                    "wave_height_max",
                    "wave_direction_dominant",
                    "wave_period_max",
                    "swell_wave_height_max",
                    "swell_wave_direction_dominant",
                    "swell_wave_period_max",
                    "wind_wave_height_max",
                ]
            ),
            "hourly": ",".join(
                [
                    "wave_height",
                    "wave_direction",
                    "wave_period",
                    "swell_wave_height",
                    "swell_wave_direction",
                    "swell_wave_period",
                    "wind_wave_height",
                    "wind_wave_direction",
                    "wind_wave_period",
                ]
            ),
        }
    )
    weather_params = urlencode(
        {
            "latitude": LAT,
            "longitude": LON,
            "timezone": TIMEZONE,
            "forecast_days": FORECAST_DAYS,
            "daily": "wind_speed_10m_max,wind_direction_10m_dominant",
            "hourly": ",".join(
                [
                    "temperature_2m",
                    "precipitation",
                    "wind_speed_10m",
                    "wind_direction_10m",
                    "wind_gusts_10m",
                    "cloud_cover",
                ]
            ),
        }
    )

    marine = fetch_json(f"https://marine-api.open-meteo.com/v1/marine?{marine_params}")
    weather = fetch_json(f"https://api.open-meteo.com/v1/forecast?{weather_params}")

    times = marine.get("daily", {}).get("time") or []
    days = []
    for i, time in enumerate(times):
        wave_height_max = num(marine["daily"]["wave_height_max"][i])
        swell_height_max = num(marine["daily"]["swell_wave_height_max"][i])
        wind_speed_max = num(weather["daily"]["wind_speed_10m_max"][i])
        wind_direction_dominant = num(
            weather["daily"]["wind_direction_10m_dominant"][i]
        )
        score = None
        if None not in (
            wave_height_max,
            swell_height_max,
            wind_speed_max,
            wind_direction_dominant,
        ):
            score = calculate_black_sea_score(
                {
                    "waveHeight": wave_height_max,
                    "wavePeriod": marine["daily"]["wave_period_max"][i],
                    "swellHeight": swell_height_max,
                    "swellDirection": marine["daily"]["swell_wave_direction_dominant"][
                        i
                    ],
                    "swellPeriod": marine["daily"]["swell_wave_period_max"][i],
                },
                {
                    "speed": wind_speed_max,
                    "direction": wind_direction_dominant,
                    "gusts": wind_speed_max,
                },
            )
        days.append(
            {
                "time": time,
                "label": format_ro_date(time),
                "waveHeightMax": wave_height_max,
                "swellHeightMax": swell_height_max,
                "windSpeedMax": wind_speed_max,
                "score": score,
            }
        )

    hourly_by_day = {}
    if "hourly" in marine and "hourly" in weather:
        for i, t in enumerate(marine["hourly"]["time"]):
            day_iso = t[:10]
            if day_iso not in hourly_by_day:
                hourly_by_day[day_iso] = []

            hour_data = {"time": t}
            # Add marine hourly data
            for k, vals in marine["hourly"].items():
                if k != "time":
                    hour_data[k] = vals[i]
            # Add weather hourly data
            for k, vals in weather["hourly"].items():
                if k != "time":
                    hour_data[k] = vals[i]

            hourly_by_day[day_iso].append(hour_data)

    return days, hourly_by_day


SITE_URL = "https://boldijar.github.io/marea-neagra/"

GREETINGS = [
    "Salutari.",
    "Ciao.",
    "Hey.",
    "Salut.",
    "Buna.",
    "Update scurt.",
    "Raportul zilei.",
    "Tiny briefing:",
]

WAVE_EMOJIS = ["🌊", "✨", "💙", "🏄", "🌅", "👀"]
STAR_EMOJIS = ["⭐", "🌟", "✦", "🔥"]

INTROS_YES = [
    "Se anunta valuri {emoji} saptamana asta.",
    "Avem ceva pe radar {emoji} in zilele urmatoare.",
    "Marea Neagra da semne {emoji} saptamana asta.",
    "Prognoza arata interesant {emoji}.",
    "Saptamana asta nu e goala {emoji}.",
    "Pare ca se misca apa {emoji} pe la CT.",
]


def pick(options: list) -> Any:
    return random.choice(options)


def day_word(iso: str, index: int) -> str:
    if index == 0:
        return pick(["azi", "astazi"])
    if index == 1:
        return "maine"
    d = datetime.fromisoformat(f"{str(iso)[:10]}T12:00:00")
    js_day = (d.weekday() + 1) % 7
    return RO_DAYS[js_day].lower()


def fmt_score(score: float) -> str:
    if abs(score - round(score)) < 0.05:
        return f"{int(round(score))}/10"
    return f"{score:.1f}/10".replace(".0/", "/")


def fmt_swell(m: float | None) -> str:
    if m is None:
        return "?"
    return f"{m:.1f}m"


def fmt_wind(kmh: float | None) -> str:
    if kmh is None:
        return "?"
    return f"{int(round(kmh))} km/h"


def highlight_line(day: dict, index: int) -> str:
    name = day_word(day["time"], index)
    score = fmt_score(day["score"])
    swell = fmt_swell(day["swellHeightMax"])
    wind = fmt_wind(day["windSpeedMax"])
    star = pick(STAR_EMOJIS)
    return pick(
        [
            f"{name.capitalize()} arata {star} {score}, val ~{swell}, vant {wind}.",
            f"Highlight: {name} — {star} {score}, swell {swell}, vant {wind}.",
            f"{name.capitalize()} o sa fie {star} {score}: ~{swell} swell, vant {wind}.",
            f"Cel mai interesant: {name}, {star} {score}, val de {swell}, vant {wind}.",
            f"{name.capitalize()} e fereastra {star} ({score}) — {swell} / {wind}.",
        ]
    )


def interesting_days(days: list[dict]) -> list[tuple[int, dict]]:
    return [
        (i, d)
        for i, d in enumerate(days)
        if d["score"] is not None and d["score"] >= SCORE_MIN
    ]


def build_message(days: list[dict]) -> str | None:
    good = interesting_days(days)
    if not good:
        return None

    greet = pick(GREETINGS)
    emoji = pick(WAVE_EMOJIS)
    link = SITE_URL

    # Best day as main highlight; mention extras lightly if more
    best_i, best = max(good, key=lambda x: x[1]["score"])
    intro = pick(INTROS_YES).format(emoji=emoji)
    mid = highlight_line(best, best_i)

    if len(good) > 1:
        others = [day_word(d["time"], i) for i, d in good if i != best_i]
        extra = pick(
            [
                f"Si pe langa asta: {', '.join(others)}.",
                f"Bonus: mai e si {', '.join(others)}.",
                f"Tine pe radar si {', '.join(others)}.",
            ]
        )
        return f"{greet} {intro}\n{mid}\n{extra}\n{link}"

    return f"{greet} {intro}\n{mid}\n{link}"


def list_subscribers() -> list[str]:
    res = requests.post(
        UPSTASH_URL,
        headers={"Authorization": f"Bearer {UPSTASH_TOKEN}"},
        json=["SMEMBERS", SUBSCRIBERS_KEY],
        timeout=30,
    )
    res.raise_for_status()
    data = res.json()
    if "error" in data and data["error"]:
        raise RuntimeError(data["error"])
    members = data.get("result") or []
    return [str(m) for m in members]


def send_telegram(chat_id: str, text: str) -> dict:
    url = f"https://api.telegram.org/bot{TOKEN}/sendMessage"
    res = requests.post(
        url,
        json={
            "chat_id": chat_id,
            "text": text,
            "parse_mode": "HTML",
            "disable_web_page_preview": True,
            "disable_notification": False,
        },
        timeout=30,
    )
    data = res.json()
    if not data.get("ok"):
        raise RuntimeError(data.get("description") or "Telegram send failed")
    return data


def broadcast(text: str, chat_ids: list[str]) -> dict:
    sent: list[dict] = []
    failed: list[dict] = []
    for chat_id in chat_ids:
        try:
            result = send_telegram(chat_id, text)
            sent.append(
                {
                    "chatId": chat_id,
                    "messageId": result.get("result", {}).get("message_id"),
                }
            )
        except Exception as exc:
            failed.append({"chatId": chat_id, "error": str(exc)})
    return {"sent": sent, "failed": failed}


def today_iso() -> str:
    return datetime.now(ZoneInfo(TIMEZONE)).date().isoformat()


def save_day_stats(day_iso: str, payload: dict) -> None:
    """Save full day snapshot under the date key (e.g. 2026-08-07)."""
    res = requests.post(
        UPSTASH_URL,
        headers={"Authorization": f"Bearer {UPSTASH_TOKEN}"},
        json=["SET", day_iso, json.dumps(payload)],
        timeout=30,
    )
    res.raise_for_status()
    data = res.json()
    if data.get("error"):
        raise RuntimeError(data["error"])


def maybe_save_today_stats(
    days: list[dict], hourly_by_day: dict[str, list[dict]]
) -> None:
    today = today_iso()
    today_day = next((d for d in days if d["time"] == today), None)
    if not today_day:
        print(f"No forecast for today ({today}); skipping stats save.")
        return

    score = today_day["score"]
    if score is None or score < STATS_SCORE_MIN:
        print(
            f"Today ({today}) score {score} < {STATS_SCORE_MIN}; skipping stats save."
        )
        return

    hourly = hourly_by_day.get(today)
    if not hourly:
        print(f"No hourly data for today ({today}); skipping stats save.")
        return

    payload = {
        "date": today,
        "score": score,
        "daily": today_day,
        "hourly": hourly,
        "savedAt": datetime.now(ZoneInfo(TIMEZONE)).isoformat(),
    }
    save_day_stats(today, payload)
    print(f"Saved stats for today ({today}) with score {score}.")


def main() -> None:
    days, hourly_by_day = build_daily_forecast()

    try:
        maybe_save_today_stats(days, hourly_by_day)
    except Exception as exc:
        print(f"Failed to save today's stats: {exc}")

    text = build_message(days)
    summary_days = [
        {"date": d["time"], "score": d["score"], "swell": d["swellHeightMax"]}
        for d in days
    ]

    if text is None:
        print("No days with score >= 6; skipping Telegram send.")
        print({"ok": True, "skipped": True, "reason": "no_interesting_days", "days": summary_days})
        return

    print(text)
    print("---")

    chat_ids = list_subscribers()
    if not chat_ids:
        raise SystemExit("No subscribers in Redis (key: subscribers).")

    result = broadcast(text, chat_ids)
    print(
        {
            "ok": True,
            "subscriberCount": len(chat_ids),
            "sentCount": len(result["sent"]),
            "failedCount": len(result["failed"]),
            "failed": result["failed"],
            "days": summary_days,
        }
    )
    if result["failed"] and not result["sent"]:
        raise SystemExit("All Telegram sends failed.")


if __name__ == "__main__":
    main()
