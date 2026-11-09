"""Erreur des sondages selon l'échéance : écart entre la moyenne des sondages à J-h et le résultat.

Mesure l'incertitude réelle d'une prévision à h jours du scrutin, pour le premier et le second tour.
Usage : python backtest/echeance.py
"""
from __future__ import annotations

import json
import math
from collections import defaultdict
from datetime import timedelta
from pathlib import Path

from historique import (
    FIRST_ROUND_2022, RESULTS_2022, SECOND_ROUND_2017, SECOND_ROUND_2022, SECOND_ROUND_RESULT_2017,
    SECOND_ROUND_RESULT_2022, bloc_elections, polls_2022, second_round_polls_2017,
)

OUTPUT = Path(__file__).resolve().parents[1] / "data" / "historique" / "echeance.json"
HORIZONS = (1, 7, 14, 30, 60, 90, 120, 150, 180, 240, 300)
HALF_LIFE = 21
WINDOW_DAYS = 120
MINIMUM_POLLS = 2


def average_at(polls, as_of, name):
    """Moyenne pondérée par l'ancienneté des sondages disponibles à la date donnée."""
    total = 0.0
    weight_sum = 0.0
    count = 0
    for poll in polls:
        age = (as_of - poll["date"]).days
        if age < 0 or age > WINDOW_DAYS or name not in poll["scores"]:
            continue
        weight = 0.5 ** (age / HALF_LIFE)
        total += weight * poll["scores"][name]
        weight_sum += weight
        count += 1
    return total / weight_sum if count >= MINIMUM_POLLS else None


def share_unit(score):
    """Échelle d'un score : 1 à 50 %, 0,6 à 10 %. L'erreur attendue en points grandit avec le score."""
    bounded = min(99.0, max(1.0, score))
    return math.sqrt(bounded * (100 - bounded)) / 50


def horizon_errors(polls, results, election_day):
    rows = []
    for horizon in HORIZONS:
        as_of = election_day - timedelta(days=horizon)
        for name, result in results.items():
            estimate = average_at(polls, as_of, name)
            if estimate is None:
                continue
            error = result - estimate
            rows.append({"horizon": horizon, "name": name, "estimate": estimate, "result": result,
                         "error": error, "standardized": error / share_unit(estimate)})
    return rows


def first_round_rows():
    rows = []
    for election_day, election in sorted(bloc_elections().items()):
        for row in horizon_errors(election["polls"], election["result"], election_day):
            rows.append({**row, "election": election_day.year, "level": "camp"})
    first_round = [poll for poll in polls_2022() if poll["round"] == 1]
    for row in horizon_errors(first_round, RESULTS_2022, FIRST_ROUND_2022):
        rows.append({**row, "election": 2022, "level": "candidat"})
    return rows


def second_round_rows():
    rows = []
    duel_2022 = [poll for poll in polls_2022() if poll["round"] == 2 and set(poll["scores"]) == set(SECOND_ROUND_RESULT_2022)]
    for row in horizon_errors(duel_2022, {"Emmanuel Macron": SECOND_ROUND_RESULT_2022["Emmanuel Macron"]}, SECOND_ROUND_2022):
        rows.append({**row, "election": 2022})
    for row in horizon_errors(second_round_polls_2017(), {"Emmanuel Macron": SECOND_ROUND_RESULT_2017["Emmanuel Macron"]}, SECOND_ROUND_2017):
        rows.append({**row, "election": 2017})
    return rows


def rms(values):
    return math.sqrt(sum(value ** 2 for value in values) / len(values)) if values else None


def fit_random_walk(rows):
    """Ajuste variance(h) = plancher² + dérive² × h sur les erreurs standardisées (moindres carrés)."""
    by_horizon = defaultdict(list)
    for row in rows:
        by_horizon[row["horizon"]].append(row["standardized"] ** 2)
    points = [(horizon, sum(values) / len(values), len(values)) for horizon, values in sorted(by_horizon.items())]
    weight = sum(count for _, _, count in points)
    mean_h = sum(h * count for h, _, count in points) / weight
    mean_v = sum(v * count for _, v, count in points) / weight
    slope = sum(count * (h - mean_h) * (v - mean_v) for h, v, count in points) / sum(count * (h - mean_h) ** 2 for h, _, count in points)
    slope = max(0.0, slope)
    floor = max(0.0, mean_v - slope * mean_h)
    return {"floor": math.sqrt(floor), "driftPerSqrtDay": math.sqrt(slope),
            "byHorizon": [{"horizon": h, "rms": math.sqrt(v), "count": count} for h, v, count in points]}


def table(rows, label):
    print(f"\n== {label}")
    print("échéance  n   erreur quadratique (points)  standardisée  biais")
    by_horizon = defaultdict(list)
    for row in rows:
        by_horizon[row["horizon"]].append(row)
    for horizon, group in sorted(by_horizon.items()):
        errors = [row["error"] for row in group]
        print(f"J-{horizon:<6} {len(group):<3} {rms(errors):>10.2f} {rms([row['standardized'] for row in group]):>22.2f} {sum(errors) / len(errors):>8.2f}")


def main():
    first = first_round_rows()
    major = [row for row in first if row["estimate"] >= 8]
    second = second_round_rows()
    table(major, "Premier tour, camps et candidats au-dessus de 8 % (1965-2022)")
    table([row for row in major if row["election"] >= 2002], "Premier tour, depuis 2002")
    table([row for row in first if row["level"] == "candidat" and row["estimate"] >= 4], "Premier tour 2022 par candidat (au-dessus de 4 %)")
    table(second, "Second tour, score du vainqueur (2017 et 2022)")
    fit_first = fit_random_walk([row for row in major if row["election"] >= 2002])
    fit_second = fit_random_walk(second)
    print("\nAjustement premier tour :", {key: round(value, 3) for key, value in fit_first.items() if key != "byHorizon"})
    print("Ajustement second tour :", {key: round(value, 3) for key, value in fit_second.items() if key != "byHorizon"})
    worst = sorted(major, key=lambda row: -abs(row["error"]))[:8]
    print("\nPlus gros écarts :", [(row["election"], row["name"], row["horizon"], round(row["error"], 1)) for row in worst])
    OUTPUT.write_text(json.dumps({"halfLife": HALF_LIFE, "firstRound": fit_first, "secondRound": fit_second,
                                  "rows": {"firstRound": first, "secondRound": second}}, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
