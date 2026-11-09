"""Le baromètre et Wikipédia annoncent-ils le mouvement des sondages de la campagne en cours ?

Le baromètre n'a pas d'historique sur les élections passées : seul ce test, sur 2026, est possible.
Usage : node backtest/soutiens.mjs && python backtest/barometre.py
"""
from __future__ import annotations

import json
import math
import sys
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline"))

from sources import PLATFORMS, barometer_window, normalize_history  # noqa: E402
from wikipedia import centered, dynamic, partial_regression, regression  # noqa: E402

DATA = ROOT / "data"
SIGNAL_DAYS = 28
LEADS = (14, 28)
MINIMUM_SUPPORT = 2


def load_histories():
    histories = {}
    for platform in PLATFORMS:
        cache = json.loads((DATA / "cache" / f"{platform}.json").read_text(encoding="utf-8"))
        rows = cache["data"]
        # Le cache conserve soit le fichier brut du baromètre, soit sa forme déjà normalisée.
        already_clean = rows and isinstance(next(iter(rows[0]["accounts"].values())), (int, float))
        histories[platform] = rows if already_clean else normalize_history(rows)
    return histories


def load_wikipedia():
    cache = json.loads((DATA / "cache" / "wikipedia.json").read_text(encoding="utf-8"))
    series = cache.get("data", cache)
    return series.get("series", series)


def observations(signal_at, support, lead):
    rows = []
    days = sorted(support)
    for day in days:
        later = (date.fromisoformat(day) + timedelta(days=lead)).isoformat()
        before = (date.fromisoformat(day) - timedelta(days=lead)).isoformat()
        if later not in support or before not in support:
            continue
        signals = signal_at(day)
        for candidate, now in support[day].items():
            future, past = support[later].get(candidate), support[before].get(candidate)
            signal = signals.get(candidate)
            if None in (future, past, signal) or now < MINIMUM_SUPPORT:
                continue
            rows.append({"year": 2026, "day": day, "name": candidate, "signal": signal,
                         "future": math.log(future / now), "past": math.log(now / past)})
    return rows


def report(rows, label):
    if len(rows) < 20:
        print(f"{label:<34} trop peu d'observations ({len(rows)})")
        return None
    signal, future, past = centered(rows, "signal"), centered(rows, "future"), centered(rows, "past")
    raw = regression(signal, future)
    partial = partial_regression(signal, past, future)
    print(f"{label:<34} n={raw['n']:<4} pente {raw['slope']:+.4f} (t={raw['t']:+.1f}, r={raw['correlation']:+.2f})"
          f" | au-delà de la tendance des sondages : t={partial['t']:+.1f}")
    return {"raw": raw, "partial": partial}


def main():
    support = json.loads((DATA / "historique" / "soutiens-2026.json").read_text(encoding="utf-8"))
    histories = load_histories()
    wikipedia = load_wikipedia()

    def barometer_at(day):
        anchor = (date.fromisoformat(day) - timedelta(days=SIGNAL_DAYS)).isoformat()
        signals = barometer_window(histories, anchor, day)["signals"]
        return {candidate: signal["score"] for candidate, signal in signals.items() if signal["coverage"] >= 2}

    def wikipedia_at(day):
        values = {candidate: dynamic(series, date.fromisoformat(day)) for candidate, series in wikipedia.items()}
        return {candidate: value for candidate, value in values.items() if value is not None}

    summary = {}
    for lead in LEADS:
        print(f"\n== Évolution des sondages 2026 sur les {lead} jours suivants")
        summary[f"barometre-{lead}"] = report(observations(barometer_at, support, lead), "Baromètre (‰ sur 28 jours)")
        summary[f"wikipedia-{lead}"] = report(observations(wikipedia_at, support, lead), "Wikipédia (dynamique 7 j / 28 j)")
    (DATA / "historique" / "barometre-test.json").write_text(json.dumps(summary, indent=1) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
