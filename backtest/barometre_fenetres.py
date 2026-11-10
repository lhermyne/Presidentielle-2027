"""Trois fenêtres de mesure du baromètre, testées contre l'évolution des sondages 2026.

Depuis le dernier sondage de chaque candidat, sur 21 jours glissants, ou tous les relevés avec une demi-vie de 21 jours.
Le modèle retient la fenêtre glissante, de la durée de la mémoire des sondages. Résultats dans docs/BACKTEST.md.
Usage : node backtest/soutiens.mjs && python backtest/barometre_fenetres.py
"""
from __future__ import annotations

import json
import math
import statistics
import sys
from collections import defaultdict
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline"))
sys.path.insert(0, str(ROOT / "backtest"))

from sources import barometer_window  # noqa: E402
from wikipedia import centered, partial_regression, regression  # noqa: E402
from barometre import load_histories, observations  # noqa: E402

HALF_LIFE = 21
MIN_COVERAGE = 2
# Effet du modèle actuel au poids 40 : 2 × signal / 1000 en relatif, soit une pente de 0,002 par ‰.
MODEL_SLOPE = 0.002


def iso(day):
    return date.fromisoformat(day)


def combine(observed):
    """Moyenne entre plateformes, pondérée par l'audience du candidat (formule du baromètre)."""
    signals = {}
    for candidate, items in observed.items():
        if len(items) < MIN_COVERAGE:
            continue
        maximum = max(followers for _, followers in items)
        weights = [followers / maximum for _, followers in items]
        signals[candidate] = sum(value * weight for (value, _), weight in zip(items, weights)) / sum(weights)
    return signals


def window_signal(histories, anchor, day):
    signals = barometer_window(histories, anchor, day)["signals"]
    return {c: s["score"] for c, s in signals.items() if s["coverage"] >= MIN_COVERAGE}


def decayed_signal(histories, day):
    """Tous les relevés : chaque variation entre deux relevés compte, son poids est divisé par 2 tous les 21 jours."""
    observed = defaultdict(list)
    for history in histories.values():
        rows = [row for row in history if row["date"] <= day]
        if len(rows) < 2 or (iso(day) - iso(rows[-1]["date"])).days > 3:
            continue
        latest = rows[-1]
        surface = max(latest["accounts"].values(), default=0)
        totals = defaultdict(float)
        for previous, current in zip(rows, rows[1:]):
            age = (iso(day) - iso(current["date"])).days
            weight = 0.5 ** (age / HALF_LIFE)
            for candidate, followers in current["accounts"].items():
                old = previous["accounts"].get(candidate)
                if old:
                    totals[candidate] += weight * (followers - old) / old * 1000
        for candidate, total in totals.items():
            followers = latest["accounts"].get(candidate)
            if followers and surface:
                observed[candidate].append((total * followers / surface, followers))
    return combine(observed)


def last_poll_dates(polls):
    dates = defaultdict(list)
    for poll in polls:
        if poll.get("round") == 1:
            for candidate in poll["scores"]:
                dates[candidate].append(poll["fieldEnd"])
    return {candidate: sorted(values) for candidate, values in dates.items()}


def current_signal(histories, poll_dates, day):
    """Méthode actuelle : depuis le dernier sondage où chaque candidat a été testé."""
    result = {}
    anchors = defaultdict(list)
    for candidate, dates in poll_dates.items():
        before = [d for d in dates if d <= day]
        if before:
            anchors[before[-1]].append(candidate)
    for anchor, candidates in anchors.items():
        signals = window_signal(histories, anchor, day)
        result.update({c: signals[c] for c in candidates if c in signals})
    return result


def report(rows, label):
    signal, future, past = centered(rows, "signal"), centered(rows, "future"), centered(rows, "past")
    raw = regression(signal, future)
    partial = partial_regression(signal, past, future)
    ratio = raw["slope"] / MODEL_SLOPE
    print(f"  {label:<32} n={raw['n']:<4} r={raw['correlation']:+.2f}  t={raw['t']:+.1f}  "
          f"hors tendance t={partial['t']:+.1f}  pente={raw['slope']:+.5f}/‰ (×{ratio:.1f} le modèle)")
    return {"n": raw["n"], "r": raw["correlation"], "t": raw["t"], "tPartial": partial["t"], "slope": raw["slope"]}


def per_candidate(rows):
    groups = defaultdict(list)
    for row in rows:
        groups[row["name"]].append(row)
    out = {}
    for name, items in groups.items():
        if len(items) < 8:
            continue
        signals, futures = [i["signal"] for i in items], [i["future"] for i in items]
        if statistics.pstdev(signals) == 0 or statistics.pstdev(futures) == 0:
            continue
        out[name] = statistics.correlation(signals, futures)
    return out


def main():
    support = json.loads((ROOT / "data/historique/soutiens-2026.json").read_text(encoding="utf-8"))
    polls = json.loads((ROOT / "data/latest.json").read_text(encoding="utf-8"))["polls"]
    histories = load_histories()
    poll_dates = last_poll_dates(polls)

    variants = {
        "Actuelle (depuis dernier sondage)": lambda day: current_signal(histories, poll_dates, day),
        "Fenêtre fixe de 21 jours": lambda day: window_signal(histories, (iso(day) - timedelta(days=21)).isoformat(), day),
        "Tous relevés, demi-vie 21 j": lambda day: decayed_signal(histories, day),
    }
    results = {}
    for lead in (14, 28):
        print(f"\n== Le signal annonce-t-il l'évolution des sondages sur les {lead} jours suivants ?")
        for label, signal_at in variants.items():
            rows = observations(signal_at, support, lead)
            results[(label, lead)] = rows
            report(rows, label)

    print("\n== Corrélation par candidat (14 jours)")
    tables = {label: per_candidate(results[(label, 14)]) for label in variants}
    names = sorted(set().union(*tables.values()))
    print("  " + "candidat".ljust(24) + "".join(label[:18].rjust(20) for label in variants))
    for name in names:
        print("  " + name.ljust(24) + "".join(
            (f"{tables[label][name]:+.2f}" if name in tables[label] else "—").rjust(20) for label in variants))
    for label in variants:
        values = list(tables[label].values())
        positives = sum(v > 0 for v in values)
        print(f"  {label:<34} médiane {statistics.median(values):+.2f}, positive pour {positives}/{len(values)}")

    print("\n== Ordre de grandeur des signaux (dernière date)")
    day = max(support)
    for label, signal_at in variants.items():
        signals = signal_at(day)
        top = sorted(signals.items(), key=lambda item: -abs(item[1]))[:5]
        print(f"  {label:<34} " + ", ".join(f"{c} {v:+.1f}" for c, v in top))


if __name__ == "__main__":
    main()
