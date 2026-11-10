"""Fenêtres de mesure Wikipédia testées contre l'évolution des sondages : 2017, 2022 et 2026.

Le modèle retient « tous les relevés » : médiane des 7 derniers jours face à la moyenne des jours précédents,
poids divisé par 2 à chaque demi-vie, celle des sondages. Résultats dans docs/BACKTEST.md.
Usage : node backtest/soutiens.mjs && python backtest/wikipedia_fenetres.py
"""
from __future__ import annotations

import json
import math
import statistics
import sys
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backtest"))
sys.path.insert(0, str(ROOT / "pipeline"))

from wikipedia import CAMPAIGNS, CAMPAIGN_DAYS, MINIMUM_SCORE, STEP_DAYS, campaign_polls, campaign_views, centered, partial_regression, poll_average, regression  # noqa: E402
from barometre import load_wikipedia, observations as observations_2026  # noqa: E402

REFERENCE_DAYS = 28
DECAY_HALF_LIFE = 21
MEMORY_DAYS = 120
# Effet du modèle au poids 20 (×1) : 0,1 × dynamique en relatif.
MODEL_SLOPE = 0.1
ELECTION_2027 = date(2027, 4, 18)


def schedule(day, election):
    return 7 + max(0, (election - day).days) // 10


def median_between(series, first, last, minimum=1):
    values = [series.get((first + timedelta(days=offset)).isoformat()) for offset in range((last - first).days + 1)]
    values = [value for value in values if value]
    return statistics.median(values) if len(values) >= minimum else None


def window_from(series, start, day):
    """Comme le site : médiane après le départ face à la médiane des 28 jours qui le précèdent."""
    reference = median_between(series, start - timedelta(days=REFERENCE_DAYS - 1), start, minimum=REFERENCE_DAYS - 4)
    if not reference or reference < 30:
        return None
    current = median_between(series, start + timedelta(days=1), day) or reference
    return math.log(current / reference)


def decayed(series, day):
    """Niveau récent (médiane 7 jours) face à la moyenne des niveaux passés, poids divisé par 2 tous les 21 jours."""
    recent = median_between(series, day - timedelta(days=6), day, minimum=4)
    total = weight_sum = 0.0
    for offset in range(7, MEMORY_DAYS):
        value = series.get((day - timedelta(days=offset)).isoformat())
        if value:
            weight = 0.5 ** ((offset - 7) / DECAY_HALF_LIFE)
            total += weight * math.log(value)
            weight_sum += weight
    if not recent or weight_sum < 5:
        return None
    return math.log(recent) - total / weight_sum


def short_long(series, day):
    """Ancien test : médiane des 7 derniers jours face aux 28 précédents."""
    recent = median_between(series, day - timedelta(days=6), day, minimum=4)
    reference = median_between(series, day - timedelta(days=34), day - timedelta(days=7), minimum=4)
    return math.log(recent / reference) if recent and reference else None


def variants(election, last_poll):
    return {
        "Depuis le dernier sondage (actuelle)": lambda s, d, n: (lambda a: window_from(s, a, d) if a else None)(last_poll(n, d)),
        "Glissante = mémoire (7 + j/10)": lambda s, d, n: window_from(s, d - timedelta(days=schedule(d, election)), d),
        "Glissante fixe 21 jours": lambda s, d, n: window_from(s, d - timedelta(days=21), d),
        "Tous relevés, demi-vie 21 j": lambda s, d, n: decayed(s, d),
        "7 j face aux 28 j précédents": lambda s, d, n: short_long(s, d),
    }


def past_rows(year, lead, name_of):
    campaign = CAMPAIGNS[year]
    views = campaign_views(year)
    polls = campaign_polls(year)

    def last_poll(name, day):
        dates = [p["date"] for p in polls if name in p["scores"] and p["date"] <= day]
        return max(dates) if dates else None

    signal = variants(campaign["election"], last_poll)[name_of]
    rows = []
    day = campaign["election"] - timedelta(days=CAMPAIGN_DAYS)
    while day + timedelta(days=lead) <= campaign["election"] - timedelta(days=1):
        for name in campaign["articles"]:
            now = poll_average(polls, day, name)
            later = poll_average(polls, day + timedelta(days=lead), name)
            before = poll_average(polls, day - timedelta(days=lead), name)
            value = signal(views[name], day, name)
            if None in (now, later, before, value) or now < MINIMUM_SCORE:
                continue
            rows.append({"year": year, "day": day, "name": name, "signal": value,
                         "future": math.log(later / now), "past": math.log(now / before)})
        day += timedelta(days=STEP_DAYS)
    return rows


def rows_2026(lead, name_of):
    support = json.loads((ROOT / "data/historique/soutiens-2026.json").read_text(encoding="utf-8"))
    polls = json.loads((ROOT / "data/latest.json").read_text(encoding="utf-8"))["polls"]
    views = load_wikipedia()

    def last_poll(name, day):
        dates = [date.fromisoformat(p["fieldEnd"]) for p in polls if p.get("round") == 1 and name in p["scores"] and p["fieldEnd"] <= day.isoformat()]
        return max(dates) if dates else None

    signal = variants(ELECTION_2027, last_poll)[name_of]

    def signal_at(day):
        when = date.fromisoformat(day)
        values = {name: signal(series, when, name) for name, series in views.items()}
        return {name: value for name, value in values.items() if value is not None}

    return observations_2026(signal_at, support, lead)


def summary(rows):
    if len(rows) < 20:
        return f"n={len(rows):<4} trop peu"
    signal, future, past = centered(rows, "signal"), centered(rows, "future"), centered(rows, "past")
    raw = regression(signal, future)
    partial = partial_regression(signal, past, future)
    return (f"n={raw['n']:<4} r={raw['correlation']:+.2f} t={raw['t']:+.1f} hors tendance t={partial['t']:+.1f} "
            f"pente {raw['slope']:+.3f} (×{raw['slope'] / MODEL_SLOPE:.1f})")


def main():
    names = list(variants(ELECTION_2027, lambda n, d: None))
    for lead in (14, 28):
        print(f"\n== Évolution des sondages sur les {lead} jours suivants")
        for name in names:
            r17, r22, r26 = past_rows(2017, lead, name), past_rows(2022, lead, name), rows_2026(lead, name)
            print(f"  {name}")
            print(f"    2017        {summary(r17)}")
            print(f"    2022        {summary(r22)}")
            print(f"    2017+2022   {summary(r17 + r22)}")
            print(f"    2026        {summary(r26)}")


if __name__ == "__main__":
    main()
