"""Historique quotidien complet des marchés Polymarket, depuis l'ouverture de chaque marché.

Chaque tableau (victoire, vainqueur du premier tour, places, qualification, bulletin) est conservé dans
data/historique/polymarket/<tableau>.json. Un marché clos garde sa dernière série ; un échec isolé
conserve la série déjà enregistrée.
"""
from __future__ import annotations

import hashlib
import json
import time
from datetime import datetime, timezone
from pathlib import Path

from sources import GAMMA_EVENTS, MARKET_EVENTS, PLACEHOLDER_MARKET, slug

CLOB_HISTORY = "https://clob.polymarket.com/prices-history?market={token}&interval=max&fidelity=1440"
PRESIDENT_EVENT = ("next-french-presidential-election", "Vainqueur de l’élection présidentielle")
BOARDS = {"president": PRESIDENT_EVENT, **MARKET_EVENTS}
SOURCE_NOTE = ("Prix quotidien du « Oui » (en %), relevé à minuit UTC par l’API publique Polymarket "
               "(clob.polymarket.com/prices-history). Probabilités de marché, pas des intentions de vote.")
MARKET_DETAILS = ("name", "question", "createdAt", "closed", "url")


def _loads(value):
    return json.loads(value) if isinstance(value, str) else value


def market_tokens(raw):
    """Marchés d'un événement Gamma avec le jeton du « Oui », y compris les marchés clos."""
    events = raw if isinstance(raw, list) else [raw]
    if not events or not isinstance(events[0], dict) or not events[0].get("markets"):
        raise ValueError("Événement Polymarket absent ou schéma modifié.")
    event = events[0]
    markets = []
    for market in event["markets"]:
        name = (market.get("groupItemTitle") or "").strip()
        if not name or PLACEHOLDER_MARKET.match(name):
            continue
        try:
            outcomes = _loads(market.get("outcomes", []))
            tokens = _loads(market.get("clobTokenIds", []))
            token = tokens[outcomes.index("Yes")]
        except (ValueError, TypeError, IndexError):
            continue
        markets.append({
            "id": slug(name),
            "name": name,
            "question": market.get("question"),
            "createdAt": market.get("createdAt"),
            "closed": bool(market.get("closed")),
            "url": f"https://polymarket.com/event/{event.get('slug', '')}/{market.get('slug', '')}",
            "token": token,
        })
    return event, markets


def parse_price_history(raw):
    """Série {date UTC: prix en %} ; le dernier point d'une même journée l'emporte."""
    payload = json.loads(raw)
    points = payload.get("history") if isinstance(payload, dict) else None
    if not isinstance(points, list):
        raise ValueError("Historique de prix absent ou schéma modifié.")
    series = {}
    for point in sorted(points, key=lambda item: item.get("t", 0)):
        try:
            day = datetime.fromtimestamp(int(point["t"]), timezone.utc).date().isoformat()
            price = float(point["p"])
        except (KeyError, ValueError, TypeError, OverflowError):
            continue
        if 0 <= price <= 1:
            series[day] = round(price * 100, 2)
    return series


def merge_series(previous, current):
    """Les points déjà enregistrés restent ; un nouveau relevé remplace seulement les jours qu'il couvre."""
    return dict(sorted({**(previous or {}), **current}.items()))


def _read(path):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None


def _write(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(value, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    temporary.replace(path)


def _status(key, captured_at):
    title = BOARDS[key][1]
    return {"id": f"polymarket-history-{key}", "title": f"Historique Polymarket · {title}", "attemptedAt": captured_at}


def collect_board(key, fetch, directory: Path, captured_at, pause=0.1):
    """Met à jour un tableau et renvoie son statut. Les marchés clos déjà enregistrés ne sont pas relus."""
    event_slug, title = BOARDS[key]
    path = directory / f"{key}.json"
    known = (_read(path) or {}).get("markets", {})
    status = _status(key, captured_at)
    try:
        event, markets = market_tokens(json.loads(fetch(GAMMA_EVENTS + event_slug)))
    except Exception as error:
        return {**status, "status": "cached" if known else "unavailable", "error": str(error)[:200]}

    records, errors = dict(known), []
    for market in markets:
        old = known.get(market["id"], {})
        if market["closed"] and old.get("closed") and old.get("series"):
            continue
        try:
            series = parse_price_history(fetch(CLOB_HISTORY.format(token=market["token"])))
        except Exception as error:
            errors.append(f"{market['id']} : {str(error)[:60]}")
            continue
        details = {name: market[name] for name in MARKET_DETAILS}
        records[market["id"]] = {**details, "series": merge_series(old.get("series"), series)}
        time.sleep(pause)

    if not records:
        return {**status, "status": "unavailable", "error": " ; ".join(errors)[:200] or "Aucun marché exploitable."}
    body = dict(sorted(records.items()))
    record = {
        "board": key,
        "title": title,
        "event": event_slug,
        "eventUrl": f"https://polymarket.com/event/{event_slug}",
        "eventCreatedAt": event.get("creationDate") or event.get("createdAt"),
        "fetchedAt": captured_at,
        "note": SOURCE_NOTE,
        "sha256": hashlib.sha256(json.dumps(body, sort_keys=True).encode()).hexdigest(),
        "markets": body,
    }
    _write(path, record)
    partial = {"error": f"{len(errors)} marché(s) non lus : " + " ; ".join(errors)[:200]} if errors else {}
    return {**status, **partial, "status": "ok", "fetchedAt": captured_at, "markets": len(body)}


def collect_market_history(fetch, directory: Path, captured_at, offline=False, pause=0.1):
    """Tous les tableaux, chacun isolé des échecs des autres."""
    if offline:
        return [{**_status(key, captured_at), "status": "cached"} for key in BOARDS]
    return [collect_board(key, fetch, directory, captured_at, pause) for key in BOARDS]


def long_series(directory: Path, key="president"):
    """Séries {candidat: {date: prix}} d'un tableau enregistré."""
    record = _read(directory / f"{key}.json") or {}
    return {market_id: market.get("series", {}) for market_id, market in record.get("markets", {}).items()}


def fill_history(recent, long, first_day, as_of):
    """Complète l'historique récent par l'historique long, sans jamais remplacer un relevé du site."""
    filled = {candidate: dict(values) for candidate, values in recent.items()}
    for candidate, values in long.items():
        for day, price in values.items():
            if first_day <= day <= as_of:
                filled.setdefault(candidate, {}).setdefault(day, price)
    return {candidate: dict(sorted(values.items())) for candidate, values in filled.items() if values}
