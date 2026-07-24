const LAT = 44.1809304;
const LON = 28.6563829;
const TIMEZONE = "Europe/Bucharest";
const SITE_URL = "https://boldijar.github.io/marea-neagra/";

const COMPASS = [
  "N",
  "NNE",
  "NE",
  "ENE",
  "E",
  "ESE",
  "SE",
  "SSE",
  "S",
  "SSV",
  "SV",
  "VSV",
  "V",
  "VNV",
  "NV",
  "NNV",
];

function compass(deg) {
  if (typeof deg !== "number" || Number.isNaN(deg)) return "?";
  const i = Math.round((((deg % 360) + 360) % 360) / 22.5) % 16;
  return COMPASS[i];
}

function fmtM(v) {
  if (typeof v !== "number" || Number.isNaN(v)) return "?";
  return `${v.toFixed(1)}m`;
}

function fmtS(v) {
  if (typeof v !== "number" || Number.isNaN(v)) return "?";
  return `${Math.round(v)}s`;
}

function fmtKmh(v) {
  if (typeof v !== "number" || Number.isNaN(v)) return "?";
  return `${Math.round(v)} km/h`;
}

function fmtDir(deg) {
  if (typeof deg !== "number" || Number.isNaN(deg)) return "?";
  return `${compass(deg)} (${Math.round(deg)}°)`;
}

function findNowIndex(times) {
  const now = Date.now();
  let best = 0;
  let bestDiff = Infinity;
  for (let i = 0; i < times.length; i++) {
    const t = Date.parse(times[i]);
    if (Number.isNaN(t)) continue;
    const diff = Math.abs(t - now);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = i;
    }
  }
  return best;
}

function formatLocalHour(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("ro-RO", {
    timeZone: TIMEZONE,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

async function fetchJson(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Open-Meteo HTTP ${res.status}`);
  }
  const data = await res.json();
  if (data.error) {
    throw new Error(data.reason || "Open-Meteo error");
  }
  return data;
}

/**
 * Live Black Sea snapshot for Constanta (Open-Meteo hourly).
 * @returns {Promise<string>}
 */
export async function buildLiveStatusMessage() {
  const marineParams = new URLSearchParams({
    latitude: String(LAT),
    longitude: String(LON),
    cell_selection: "sea",
    timezone: TIMEZONE,
    forecast_days: "1",
    hourly: [
      "wave_height",
      "wave_direction",
      "wave_period",
      "swell_wave_height",
      "swell_wave_direction",
      "swell_wave_period",
      "wind_wave_height",
    ].join(","),
  });

  const weatherParams = new URLSearchParams({
    latitude: String(LAT),
    longitude: String(LON),
    timezone: TIMEZONE,
    forecast_days: "1",
    hourly: "wind_speed_10m,wind_direction_10m,wind_gusts_10m",
  });

  const [marine, weather] = await Promise.all([
    fetchJson(`https://marine-api.open-meteo.com/v1/marine?${marineParams}`),
    fetchJson(`https://api.open-meteo.com/v1/forecast?${weatherParams}`),
  ]);

  const times = marine?.hourly?.time || [];
  if (!times.length) {
    throw new Error("No hourly marine data");
  }

  const i = findNowIndex(times);
  const wi = findNowIndex(weather?.hourly?.time || times);

  const waveH = marine.hourly.wave_height?.[i];
  const waveDir = marine.hourly.wave_direction?.[i];
  const wavePeriod = marine.hourly.wave_period?.[i];
  const swellH = marine.hourly.swell_wave_height?.[i];
  const swellDir = marine.hourly.swell_wave_direction?.[i];
  const swellPeriod = marine.hourly.swell_wave_period?.[i];
  const windWaveH = marine.hourly.wind_wave_height?.[i];
  const windSpeed = weather.hourly?.wind_speed_10m?.[wi];
  const windDir = weather.hourly?.wind_direction_10m?.[wi];
  const windGusts = weather.hourly?.wind_gusts_10m?.[wi];

  const when = formatLocalHour(times[i]);

  return [
    `Acum pe Marea Neagra (CT) — ${when}`,
    "",
    `Val: ${fmtM(waveH)} · perioada ${fmtS(wavePeriod)} · din ${fmtDir(waveDir)}`,
    `Swell: ${fmtM(swellH)} · perioada ${fmtS(swellPeriod)} · din ${fmtDir(swellDir)}`,
    `Wind wave: ${fmtM(windWaveH)}`,
    `Vant: ${fmtKmh(windSpeed)} din ${fmtDir(windDir)} · rafale ${fmtKmh(windGusts)}`,
    "",
    `Intra aici pentru mai multe detalii:`,
    SITE_URL,
  ].join("\n");
}
