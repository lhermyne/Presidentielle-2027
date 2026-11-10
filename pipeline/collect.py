"""Run unattended with Python 3.12+. Usage: python pipeline/collect.py [--offline]."""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
import time
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo

from sources import (ATTRIBUTION, BAROMETER_BASE, GAMMA_EVENTS, MARKET_EVENTS, MARKET_URL, PLATFORMS, POLL_URL, TRENDS_URL,
                     WIKIPEDIA_DOCUMENTATION, normalize_history, parse_market, parse_polls, social_signals,
                     parse_trends, merge_trends, trend_signals,
                     merge_pageviews, parse_pageviews, wikipedia_signals, wikipedia_url,
                     barometer_anchors, barometer_daily, market_history, recent_series, _history_dates)
from market_history import collect_market_history, fill_history, long_series

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
CACHE = DATA / "cache"
MARKET_HISTORY = DATA / "historique" / "polymarket"


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(value, ensure_ascii=False, separators=(",", ":"), allow_nan=False) + "\n", encoding="utf-8")
    temporary.replace(path)


def fetch(url):
    error = None
    for attempt in range(3):
        try:
            request = Request(url, headers={"User-Agent": "LHermynePresidentielle2027/0.1 (https://lhermyne.github.io/Presidentielle-2027/; public research dashboard)", "Accept": "application/json,text/csv;q=0.9,*/*;q=0.5"})
            with urlopen(request, timeout=25) as response:
                return response.read(30_000_001)
        except Exception as exception:
            error = exception
            if attempt < 2:
                time.sleep(1 + attempt)
    raise RuntimeError(str(error))


def observation_date(key, value):
    if key in PLATFORMS:
        return value[-1]["date"] if value else None
    if key == "polls":
        return max((poll["fieldEnd"] for poll in value["polls"]), default=None)
    if key == "polymarket":
        return value.get("updatedAt") or value.get("capturedAt")
    if key == "google-trends":
        return max((item["date"] for item in value.get("items", [])), default=None)
    return None


def collect_source(key, title, url, parser, captured_at, offline):
    path = CACHE / f"{key}.json"
    previous = json.loads(path.read_text(encoding="utf-8")) if path.exists() else None
    status = {"id": key, "title": title, "url": url, "attemptedAt": captured_at}
    if not offline:
        try:
            raw = fetch(url)
            if len(raw) > 30_000_000:
                raise ValueError("Réponse trop volumineuse.")
            parsed = parser(raw)
            if key in PLATFORMS and previous:
                by_date = {row["date"]: row for row in previous["data"]}
                by_date.update({row["date"]: row for row in parsed})
                parsed = [by_date[day] for day in sorted(by_date)]
            if key == "google-trends" and previous:
                parsed = merge_trends(previous["data"], parsed)
            record = {"data": parsed, "fetchedAt": captured_at, "sha256": hashlib.sha256(raw).hexdigest()}
            write_json(path, record)
            return parsed, {**status, "status": "ok", "fetchedAt": captured_at, "observedThrough": observation_date(key, parsed), "sha256": record["sha256"]}
        except Exception as error:
            status["error"] = str(error)[:300]
    if previous:
        return previous["data"], {**status, "status": "cached", "fetchedAt": previous["fetchedAt"], "observedThrough": observation_date(key, previous["data"]), "sha256": previous["sha256"]}
    return None, {**status, "status": "unavailable", "fetchedAt": None}


def archived_market_snapshots(as_of, current):
    """Prix de victoire déjà archivés chaque jour, complétés par le relevé du jour."""
    snapshots = {}
    for path in sorted((DATA / "archive").glob("*/observations.json")):
        try:
            snapshots[path.parent.name] = (json.loads(path.read_text(encoding="utf-8")).get("market") or {}).get("markets", [])
        except (OSError, ValueError):
            continue
    if current:
        snapshots[as_of] = current.get("markets", [])
    return snapshots


def collect_market_events(captured_at, offline):
    """Marchés complémentaires : un échec isolé conserve le dernier relevé de ce marché."""
    events = {}
    for key, (event_slug, title) in MARKET_EVENTS.items():
        data, status = collect_source(f"polymarket-{key}", title, GAMMA_EVENTS + event_slug,
            lambda raw, title=title: parse_market(json.loads(raw), captured_at, title), captured_at, offline)
        if data:
            events[key] = {**data, "status": status["status"], "fetchedAt": status["fetchedAt"]}
    return events


def collect_wikipedia(candidates, as_of, captured_at, offline, pause=1.0, history_days=160):
    """Une requête par personnalité ; un échec isolé ne supprime pas les autres séries."""
    path = CACHE / "wikipedia.json"
    previous = json.loads(path.read_text(encoding="utf-8")) if path.exists() else None
    status = {"id": "wikipedia", "title": "Wikipédia · consultations", "url": WIKIPEDIA_DOCUMENTATION,
              "attemptedAt": captured_at, "license": "CC0 1.0",
              "attribution": "Wikimedia Foundation, API Pageviews", "attributionUrl": "https://wikimediafoundation.org/",
              "documentationUrl": WIKIPEDIA_DOCUMENTATION}
    if not offline:
        end = date.fromisoformat(as_of)
        # 120 jours de sondages + 28 jours de référence avant le plus ancien terrain retenu.
        start = end - timedelta(days=history_days)
        current, errors = {}, []
        for candidate in candidates:
            try:
                current[candidate["id"]] = parse_pageviews(fetch(wikipedia_url(candidate, start, end)))
            except Exception as error:
                errors.append(f"{candidate['id']} : {str(error)[:80]}")
            time.sleep(pause)
        if current:
            series = merge_pageviews(previous["data"] if previous else None, current)
            record = {"data": series, "fetchedAt": captured_at,
                      "sha256": hashlib.sha256(json.dumps(series, sort_keys=True).encode()).hexdigest()}
            write_json(path, record)
            observed = max((day for views in series.values() for day in views), default=None)
            partial = {"error": f"{len(errors)} article(s) non lus : " + " ; ".join(errors)[:250]} if errors else {}
            return series, {**status, **partial, "status": "ok", "fetchedAt": captured_at,
                            "observedThrough": observed, "sha256": record["sha256"]}
        status["error"] = " ; ".join(errors)[:300] or "Aucune personnalité à interroger."
    if previous:
        observed = max((day for views in previous["data"].values() for day in views), default=None)
        return previous["data"], {**status, "status": "cached", "fetchedAt": previous["fetchedAt"],
                                  "observedThrough": observed, "sha256": previous["sha256"]}
    return None, {**status, "status": "unavailable", "fetchedAt": None}


def main():
    arguments = argparse.ArgumentParser(description=__doc__)
    arguments.add_argument("--offline", action="store_true", help="Rebuild only from committed source caches.")
    arguments.add_argument("--as-of", help="ISO date for reproducible historical filtering (no backtest claim).")
    args = arguments.parse_args()
    now = datetime.now(timezone.utc)
    captured_at = now.isoformat(timespec="seconds")
    try:
        today = now.astimezone(ZoneInfo("Europe/Paris")).date().isoformat()
    except Exception:
        today = now.date().isoformat()
    as_of = args.as_of or today
    date_check = datetime.fromisoformat(as_of)
    if date_check.date().isoformat() != as_of:
        raise ValueError("--as-of doit être une date YYYY-MM-DD.")
    statuses = []
    poll_data, status = collect_source("polls", "Sondages", POLL_URL,
        lambda raw: parse_polls(raw.decode("utf-8-sig"), as_of), captured_at, args.offline)
    statuses.append({**status, "license": "CC BY-SA 4.0", "attribution": ATTRIBUTION,
                     "attributionUrl": "https://sondax.fr", "documentationUrl": "https://sondax.fr/donnees.html"})
    if not poll_data:
        print("ERREUR : aucun cache de sondages utilisable. Dernière publication conservée.", file=sys.stderr)
        return 1
    # Re-filter cached observations, including when invoked with --as-of.
    poll_data = {**poll_data, "polls": [p for p in poll_data["polls"] if p["fieldEnd"] <= as_of]}
    if not any(p["round"] == 1 for p in poll_data["polls"]):
        print("ERREUR : aucun sondage de premier tour à la date demandée.", file=sys.stderr)
        return 1
    histories = {}
    for platform in PLATFORMS:
        history, status = collect_source(platform, f"Baromètre {platform}", f"{BAROMETER_BASE}/{platform}_history.json",
            lambda raw: normalize_history(json.loads(raw)), captured_at, args.offline)
        statuses.append(status)
        if history:
            histories[platform] = history
    market_data, status = collect_source("polymarket", "Polymarket", MARKET_URL,
        lambda raw: parse_market(json.loads(raw), captured_at), captured_at, args.offline)
    statuses.append(status)
    market_events = collect_market_events(captured_at, args.offline)
    history_statuses = collect_market_history(fetch, MARKET_HISTORY, captured_at, args.offline)
    trends_data, trends_status = collect_source("google-trends", "Google Trends · recherches en hausse", TRENDS_URL,
        parse_trends, captured_at, args.offline)
    trends_status["note"] = "Flux public Trending Now en France, archivé quotidiennement. Signal actif avec au moins deux candidats identifiés dans les 28 derniers jours. Ce n’est pas l’API comparative Google Trends."
    statuses.append(trends_status)
    candidates = poll_data["candidates"]
    for candidate in candidates:
        photo = ROOT / "front-end" / "public" / "portraits" / f"{candidate['id']}.png"
        if photo.exists():
            candidate["photo"] = f"portraits/{candidate['id']}.png"
    pageviews, wikipedia_status = collect_wikipedia(candidates, as_of, captured_at, args.offline)
    statuses.append(wikipedia_status)
    anchors = [p["fieldEnd"] for p in poll_data["polls"] if p["round"] == 1 and
               0 <= (date_check.date() - datetime.fromisoformat(p["fieldEnd"]).date()).days <= 120]
    result = {"schemaVersion": 1, "generatedAt": captured_at, "asOf": as_of,
              "candidates": candidates, "polls": poll_data["polls"],
              "social": social_signals(histories, as_of, barometer_anchors(as_of)), "market": market_data, "marketEvents": market_events,
              "trends": trend_signals(trends_data, candidates, as_of, trends_status.get("fetchedAt")),
              "wikipedia": wikipedia_signals(pageviews, as_of, wikipedia_status.get("fetchedAt"), anchors),
              "history": {"polymarket": fill_history(market_history(archived_market_snapshots(as_of, market_data), as_of),
                                                     long_series(MARKET_HISTORY), _history_dates(as_of)[0], as_of),
                          "barometer": barometer_daily(histories, as_of), "wikipedia": recent_series(pageviews, as_of)},
              "sources": statuses, "rejectedPolls": poll_data.get("rejected", []),
              "limitations": ["Modèle expérimental, paramètres non calibrés historiquement.",
                               "Prévisions conditionnelles aux candidatures de chaque configuration.",
                               "Les prix Polymarket sont inconditionnels et ne sont pas des intentions de vote."]}
    write_json(DATA / "latest.json", result)
    archive = DATA / "archive" / as_of
    # Exact normalized inputs used on this day, not a rolling cache or Actions artifact.
    write_json(archive / "observations.json", {key: value for key, value in result.items() if key != "history"})
    for status in statuses + history_statuses:
        print(f"{status['title']}: {status['status']}")
    print(f"{len(result['polls'])} configurations-sondages ; {len(candidates)} personnalités ; {len(poll_data.get('rejected', []))} groupes/lignes rejetés.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
