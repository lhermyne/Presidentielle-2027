"""Wikipédia annonce-t-il le mouvement des sondages ? Test sur les campagnes 2017 et 2022.

À chaque date, la dynamique des consultations d'un candidat (médiane des 7 derniers jours face aux
28 jours précédents) est comparée à l'évolution de ses sondages sur les semaines suivantes.
Usage : python backtest/wikipedia.py
"""
from __future__ import annotations

import json
import math
import statistics
import time
import urllib.parse
import urllib.request
from datetime import date, timedelta
from pathlib import Path

from historique import FIRST_ROUND_2017, FIRST_ROUND_2022, RESULTS_2022, bloc_elections, polls_2022

DATA = Path(__file__).resolve().parents[1] / "data" / "historique"
API = "https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/fr.wikipedia/all-access/user"
USER_AGENT = "lhermyne-presidentielle-2027-backtest/1.0 (https://github.com/lhermyne/Presidentielle-2027)"
CAMPAIGN_DAYS = 240
RECENT_DAYS = 7
REFERENCE_DAYS = 28
STEP_DAYS = 7
LEADS = (14, 28)
HALF_LIFE = 14
MINIMUM_SCORE = 3

# 2017 : les sondages historiques sont par camp ; chaque camp est représenté par son candidat principal.
CAMPAIGNS = {
    2022: {"election": FIRST_ROUND_2022, "articles": {name: name for name in RESULTS_2022}},
    2017: {"election": FIRST_ROUND_2017, "articles": {
        "extreme-gauche": "Jean-Luc Mélenchon", "gauche": "Benoît Hamon", "centre": "Emmanuel Macron",
        "droite": "François Fillon", "extreme-droite": "Marine Le Pen"}},
}


def fetch_views(article, first, last):
    title = urllib.parse.quote(article.replace(" ", "_"), safe="")
    url = f"{API}/{title}/daily/{first:%Y%m%d}/{last:%Y%m%d}"
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=30) as response:
        items = json.load(response)["items"]
    return {f"{item['timestamp'][:4]}-{item['timestamp'][4:6]}-{item['timestamp'][6:8]}": item["views"] for item in items}


def campaign_views(year):
    cache = DATA / f"wikipedia-{year}.json"
    if cache.exists():
        return json.loads(cache.read_text(encoding="utf-8"))
    campaign = CAMPAIGNS[year]
    first = campaign["election"] - timedelta(days=CAMPAIGN_DAYS + REFERENCE_DAYS + RECENT_DAYS)
    views = {}
    for name, article in campaign["articles"].items():
        views[name] = fetch_views(article, first, campaign["election"])
        time.sleep(0.5)
    cache.write_text(json.dumps(views, ensure_ascii=False) + "\n", encoding="utf-8")
    return views


def campaign_polls(year):
    if year == 2022:
        return [poll for poll in polls_2022() if poll["round"] == 1]
    return bloc_elections()[FIRST_ROUND_2017]["polls"]


def poll_average(polls, as_of, name):
    total = weight_sum = 0.0
    count = 0
    for poll in polls:
        age = (as_of - poll["date"]).days
        if 0 <= age <= 60 and name in poll["scores"]:
            weight = 0.5 ** (age / HALF_LIFE)
            total += weight * poll["scores"][name]
            weight_sum += weight
            count += 1
    return total / weight_sum if count >= 2 else None


def median_views(series, first, last):
    values = [series.get((first + timedelta(days=offset)).isoformat()) for offset in range((last - first).days + 1)]
    values = [value for value in values if value]
    return statistics.median(values) if len(values) >= 4 else None


def dynamic(series, as_of):
    recent = median_views(series, as_of - timedelta(days=RECENT_DAYS - 1), as_of)
    reference = median_views(series, as_of - timedelta(days=RECENT_DAYS + REFERENCE_DAYS - 1), as_of - timedelta(days=RECENT_DAYS))
    return math.log(recent / reference) if recent and reference else None


def observations(year, lead):
    """Pour chaque date et candidat : dynamique Wikipédia, évolution passée et future des sondages."""
    campaign = CAMPAIGNS[year]
    views = campaign_views(year)
    polls = campaign_polls(year)
    rows = []
    day = campaign["election"] - timedelta(days=CAMPAIGN_DAYS)
    while day + timedelta(days=lead) <= campaign["election"] - timedelta(days=1):
        for name in campaign["articles"]:
            now = poll_average(polls, day, name)
            later = poll_average(polls, day + timedelta(days=lead), name)
            before = poll_average(polls, day - timedelta(days=lead), name)
            signal = dynamic(views[name], day)
            if None in (now, later, before, signal) or now < MINIMUM_SCORE:
                continue
            rows.append({"year": year, "day": day, "name": name, "signal": signal,
                         "future": math.log(later / now), "past": math.log(now / before)})
        day += timedelta(days=STEP_DAYS)
    return rows


def centered(rows, key):
    """Retire la moyenne de chaque date : seule la différence entre candidats compte."""
    by_day = {}
    for row in rows:
        by_day.setdefault((row["year"], row["day"]), []).append(row[key])
    return [row[key] - statistics.fmean(by_day[(row["year"], row["day"])]) for row in rows]


def regression(x, y):
    n = len(x)
    sxx = sum(value ** 2 for value in x)
    sxy = sum(a * b for a, b in zip(x, y))
    syy = sum(value ** 2 for value in y)
    slope = sxy / sxx
    residual = sum((b - slope * a) ** 2 for a, b in zip(x, y))
    error = math.sqrt(residual / (n - 1) / sxx)
    return {"n": n, "slope": slope, "standardError": error, "t": slope / error,
            "correlation": sxy / math.sqrt(sxx * syy), "explained": 1 - residual / syy}


def partial_regression(x, control, y):
    """Effet de x une fois retirée la tendance passée des sondages (contrôle)."""
    def residuals(values):
        slope = sum(a * b for a, b in zip(control, values)) / sum(a ** 2 for a in control)
        return [b - slope * a for a, b in zip(control, values)]
    return regression(residuals(x), residuals(y))


def report(rows, label):
    signal, future, past = centered(rows, "signal"), centered(rows, "future"), centered(rows, "past")
    raw = regression(signal, future)
    momentum = regression(past, future)
    partial = partial_regression(signal, past, future)
    print(f"{label:<28} n={raw['n']:<4} pente {raw['slope']:+.3f} (t={raw['t']:+.1f}, r={raw['correlation']:+.2f})"
          f" | tendance passée seule t={momentum['t']:+.1f} | Wikipédia au-delà de la tendance : pente {partial['slope']:+.3f} (t={partial['t']:+.1f})")
    return {"raw": raw, "momentum": momentum, "partial": partial}


def main():
    summary = {}
    for lead in LEADS:
        print(f"\n== Évolution des sondages sur les {lead} jours suivants")
        pooled = []
        for year in CAMPAIGNS:
            rows = observations(year, lead)
            pooled += rows
            summary[f"{year}-{lead}"] = report(rows, f"Campagne {year}")
        summary[f"ensemble-{lead}"] = report(pooled, "Deux campagnes")
        late = [row for row in pooled if (CAMPAIGNS[row["year"]]["election"] - row["day"]).days <= 90]
        early = [row for row in pooled if (CAMPAIGNS[row["year"]]["election"] - row["day"]).days > 90]
        summary[f"fin-{lead}"] = report(late, "Trois derniers mois")
        summary[f"debut-{lead}"] = report(early, "Avant J-90")
    (DATA / "wikipedia-test.json").write_text(json.dumps(summary, indent=1) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
