"""Public-data parsers. Standard library only; no bot dependency."""
from __future__ import annotations

import csv
import io
import json
import math
import re
import statistics
import unicodedata
import xml.etree.ElementTree as ET
from collections import defaultdict
from datetime import date, timedelta
from email.utils import parsedate_to_datetime
from urllib.parse import quote

BAROMETER_BASE = "https://lhermyne.github.io/L_Hermyne/data"
POLL_URL = "https://sondax.fr/donnees/sondages-presidentielle-2027.csv"
GAMMA_EVENTS = "https://gamma-api.polymarket.com/events?slug="
MARKET_URL = GAMMA_EVENTS + "next-french-presidential-election"
# Marchés complémentaires : indicateurs de premier tour, de qualification et de candidature.
MARKET_EVENTS = {
    "winner": ("french-presidential-election-first-round-winner", "Vainqueur du premier tour"),
    "second": ("french-presidential-election-first-round-2nd-place", "Deuxième place du premier tour"),
    "third": ("french-presidential-election-first-round-3rd-place", "Troisième place du premier tour"),
    "advance": ("next-french-presidential-election-who-will-advance-to-the-2nd-round", "Qualification au second tour"),
    "ballot": ("2027-french-presidential-election-who-will-be-on-the-ballot", "Présence sur le bulletin de vote"),
}
# Lignes de remplissage de Polymarket (« Candidate A », « Other ») : jamais un vrai candidat.
PLACEHOLDER_MARKET = re.compile(r"^(candidate [a-z]+|other|autre)$", re.IGNORECASE)
TRENDS_URL = "https://trends.google.com/trending/rss?geo=FR"
WIKIPEDIA_API = "https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/fr.wikipedia/all-access/user"
WIKIPEDIA_DOCUMENTATION = "https://doc.wikimedia.org/generated-data-platform/aqs/analytics-api/reference/page-views.html"
# Articles dont le titre diffère du nom affiché dans les sondages (aucun à ce jour).
WIKIPEDIA_TITLES: dict[str, str] = {}
PLATFORMS = ("instagram", "twitter", "tiktok", "facebook")
ATTRIBUTION = "Sondax, d’après Wikipédia"


def slug(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value.casefold())
    ascii_text = "".join(char for char in normalized if not unicodedata.combining(char))
    return re.sub(r"[^a-z0-9]+", "-", ascii_text).strip("-")


def number(value):
    try:
        result = float(str(value).replace(",", ".").replace("%", "").strip())
        return result if math.isfinite(result) else None
    except (ValueError, TypeError):
        return None


COLORS = {
    "marine-le-pen": "#344b87", "jordan-bardella": "#344b87",
    "edouard-philippe": "#bd7840", "jean-luc-melenchon": "#ad3e68",
    "raphael-glucksmann": "#b56b97", "gabriel-attal": "#c29826",
    "bruno-retailleau": "#3886a0", "marine-tondelier": "#4c855e",
    "francois-ruffin": "#af5651", "francois-hollande": "#a95b8d",
    "eric-zemmour": "#665587", "sarah-knafo": "#665587",
    "fabien-roussel": "#b84839", "nathalie-arthaud": "#ad472f",
    "dominique-de-villepin": "#6c7d94", "david-lisnard": "#3b8081",
    "nicolas-dupont-aignan": "#7f6a46", "francois-asselineau": "#68795d",
}


def parse_polls(text: str, as_of: str):
    reader = csv.DictReader(io.StringIO(text.lstrip("\ufeff")))
    required = {"sondage_id", "institut", "terrain_debut", "terrain_fin", "tour", "configuration", "candidat", "score", "url_source"}
    if not required.issubset(set(reader.fieldnames or [])):
        raise ValueError("Schéma CSV de sondages inattendu ; aucune donnée précédente écrasée.")
    groups = {}
    candidates = {}
    rejected = []
    for row in reader:
        try:
            end = date.fromisoformat(row["terrain_fin"]).isoformat()
            start = date.fromisoformat(row["terrain_debut"]).isoformat()
            if end > as_of:
                continue
            if start > end:
                raise ValueError("dates inversées")
            round_number = int(row["tour"])
            if round_number not in (1, 2):
                continue
            candidate_id = slug(row["candidat"])
            score = number(row["score"])
            if not candidate_id or score is None or not 0 <= score <= 100:
                raise ValueError("score invalide")
            key = (row["sondage_id"], round_number, row["configuration"])
            group = groups.setdefault(key, {
                "id": row["sondage_id"], "institute": row["institut"],
                "fieldStart": start, "fieldEnd": end,
                "sampleSize": number(row.get("echantillon_configuration")) or number(row.get("echantillon")),
                "configurationSampleKnown": number(row.get("echantillon_configuration")) is not None,
                "round": round_number, "configuration": row["configuration"],
                "main": row.get("configuration_principale") == "1",
                "sourceUrl": row["url_source"], "scores": {},
            })
            if candidate_id in group["scores"] and group["scores"][candidate_id] != score:
                group["invalid"] = True
            group["scores"][candidate_id] = score
            candidates.setdefault(candidate_id, {
                "id": candidate_id, "name": row["candidat"], "party": row.get("parti", ""),
                "family": row.get("parti") or candidate_id,
                "color": COLORS.get(candidate_id, "#667975"),
            })
        except (ValueError, TypeError, KeyError) as error:
            rejected.append({"poll": row.get("sondage_id"), "reason": str(error)})
    output = []
    configurations_by_survey = defaultdict(set)
    for group in groups.values():
        configurations_by_survey[(group["id"], group["round"])].add(group["configuration"])
    for group in groups.values():
        total = sum(group["scores"].values())
        expected_length = len(group["scores"]) >= 2 if group["round"] == 1 else len(group["scores"]) == 2
        if group.pop("invalid", False) or not expected_length or abs(total - 100) > 2:
            rejected.append({"poll": group["id"], "configuration": group["configuration"], "reason": f"total incohérent : {total:g}"})
            continue
        # A global sample is not evidence that every alternative used that sample.
        if not group["configurationSampleKnown"] and len(configurations_by_survey[(group["id"], group["round"])]) > 1:
            group["sampleSize"] = min(group["sampleSize"] or 1000, 1000)
        output.append(group)
    if not any(poll["round"] == 1 for poll in output):
        raise ValueError("Aucun sondage complet de premier tour exploitable.")
    return {"polls": output, "candidates": list(candidates.values()), "rejected": rejected}


def normalize_history(raw):
    if not isinstance(raw, list):
        raise ValueError("Historique du baromètre : liste attendue.")
    by_date = {}
    for snapshot in raw:
        try:
            day = date.fromisoformat(snapshot["date"]).isoformat()
            accounts = snapshot["accounts"]
            if not isinstance(accounts, dict):
                continue
            clean = {}
            for key, account in accounts.items():
                if not isinstance(account, dict):
                    continue
                followers = number(account.get("followers"))
                if followers is not None and followers > 0:
                    clean[slug(account.get("display_name") or key)] = int(followers)
            if clean:
                by_date[day] = {"date": day, "accounts": clean}
        except (ValueError, TypeError, KeyError):
            continue
    if not by_date:
        raise ValueError("Historique social vide ou invalide.")
    return [by_date[day] for day in sorted(by_date)]


def barometer_window(histories, anchor, as_of):
    """Relative barometer dynamic since a known poll field-end, without bot imports."""
    values = defaultdict(list)
    for platform, history in histories.items():
        rows = [row for row in history if row["date"] <= as_of]
        if not rows:
            continue
        latest = rows[-1]
        if (date.fromisoformat(as_of) - date.fromisoformat(latest["date"])).days > 3 or latest["date"] < anchor:
            continue
        previous_rows = [row for row in rows if row["date"] <= anchor and
                         (date.fromisoformat(anchor) - date.fromisoformat(row["date"])).days <= 3]
        if not previous_rows:
            continue
        previous = previous_rows[-1]
        surface = max(latest["accounts"].values(), default=0)
        for candidate, followers in latest["accounts"].items():
            old = previous["accounts"].get(candidate)
            if old and surface > 0:
                values[candidate].append({"value": (followers - old) / old * 1000 * followers / surface,
                                          "followers": followers, "platform": platform,
                                          "from": previous["date"], "through": latest["date"]})
    signals = {}
    for candidate, observations in values.items():
        maximum = max(item["followers"] for item in observations)
        weights = [item["followers"] / maximum for item in observations]
        signals[candidate] = {"score": sum(item["value"] * weight for item, weight in zip(observations, weights)) / sum(weights),
                              "coverage": len(observations),
                              "periods": [{key: item[key] for key in ("platform", "from", "through")} for item in observations]}
    return {"anchor": anchor, "anchorKind": "fieldEnd", "signals": signals}


def social_signals(histories, as_of, anchors=()):
    as_date = date.fromisoformat(as_of)
    growth = defaultdict(lambda: {7: [], 28: []})
    observation_dates = []
    starts = []
    platforms = []
    audiences = {}
    for platform, history in histories.items():
        eligible = [row for row in history if row["date"] <= as_of]
        if not eligible:
            continue
        latest = eligible[-1]
        platforms.append(platform)
        observation_dates.append(latest["date"])
        starts.append(eligible[0]["date"])
        if (as_date - date.fromisoformat(latest["date"])).days > 3:
            continue
        audiences[platform] = {"date": latest["date"], "accounts": latest["accounts"]}
        # Anchor every platform to its own latest observation, not a future day.
        latest_date = date.fromisoformat(latest["date"])
        for window in (7, 28):
            target = (latest_date - timedelta(days=window)).isoformat()
            previous_rows = [row for row in eligible if row["date"] <= target and (date.fromisoformat(target) - date.fromisoformat(row["date"])).days <= 3]
            if not previous_rows:
                continue
            previous = previous_rows[-1]
            elapsed = (latest_date - date.fromisoformat(previous["date"])).days
            for candidate, followers in latest["accounts"].items():
                old = previous["accounts"].get(candidate)
                if old and elapsed > 0:
                    value = ((followers / old) ** (window / elapsed) - 1) * 100
                    if math.isfinite(value):
                        growth[candidate][window].append(value)
    signals = {}
    for candidate, windows in growth.items():
        signals[candidate] = {
            "growth7": statistics.median(windows[7]) if windows[7] else None,
            "growth28": statistics.median(windows[28]) if windows[28] else None,
            "coverage": len(windows[7]),
        }
    weighted = defaultdict(list)
    for platform, history in histories.items():
        rows = [row for row in history if row["date"] <= as_of]
        if len(rows) < 7:
            continue
        latest, previous = rows[-1], rows[-7]
        elapsed = (date.fromisoformat(latest["date"]) - date.fromisoformat(previous["date"])).days
        if (as_date - date.fromisoformat(latest["date"])).days > 3 or not 5 <= elapsed <= 9:
            continue
        surface = max(latest["accounts"].values(), default=0)
        for candidate, followers in latest["accounts"].items():
            old = previous["accounts"].get(candidate)
            if old and surface > 0:
                # Same formula as the public barometer: relative growth × platform
                # surface, then candidate-audience weights across platforms.
                weighted[candidate].append({"value": (followers - old) / old * 1000 * followers / surface,
                                            "followers": followers, "elapsedDays": elapsed})
    for candidate, values in weighted.items():
        maximum = max(item["followers"] for item in values)
        weights = [item["followers"] / maximum for item in values]
        signals.setdefault(candidate, {"growth7": None, "growth28": None, "coverage": 0})
        signals[candidate].update({"barometerScore": sum(item["value"] * weight for item, weight in zip(values, weights)) / sum(weights),
                                   "barometerCoverage": len(values), "windowElapsedDays": sorted(set(item["elapsedDays"] for item in values))})
    return {"asOf": max(observation_dates) if observation_dates else None,
            "historyStart": min(starts) if starts else None, "platforms": platforms,
            "signals": signals, "audiences": audiences,
            "windows": {anchor: barometer_window(histories, anchor, as_of) for anchor in sorted(set(anchors))},
            "method": "Dynamique pondérée du baromètre sur 7 relevés : variation en ‰ × audience/max plateforme, moyenne pondérée par l’audience du candidat entre plateformes. Aucun score électoral déduit de l’audience."}


def parse_trends(raw):
    """Public Trending Now RSS, not the restricted comparative-interest API."""
    root = ET.fromstring(raw)
    channel = root.find("channel")
    if channel is None or root.tag != "rss":
        raise ValueError("Flux RSS Google Trends inattendu.")
    items = []
    namespace = {"ht": "https://trends.google.com/trending/rss"}
    for item in channel.findall("item"):
        title = item.findtext("title", "").strip()
        traffic = item.findtext("ht:approx_traffic", "", namespace)
        # Google publishes lower bounds (e.g. 500+, 2K+), not exact volumes.
        match = re.fullmatch(r"([\d.,\s]+)([KkMm]?)\+?", traffic.strip())
        if not title or not match:
            continue
        multiplier = {"k": 1000, "m": 1000000}.get(match[2].lower(), 1)
        numeric = match[1].replace(" ", "").replace(",", "" if not match[2] else ".")
        volume = number(numeric)
        try:
            observed = parsedate_to_datetime(item.findtext("pubDate", ""))
            if observed.tzinfo is None:
                continue
        except (ValueError, TypeError):
            continue
        if volume is not None and volume > 0:
            items.append({"title": title, "publishedAt": observed.isoformat(),
                          "date": observed.date().isoformat(), "volumeLowerBound": volume * multiplier})
    # An empty but structurally valid feed is a real observation, not a failure.
    return {"items": items, "kind": "trending-now-rss", "geo": "FR"}


def merge_trends(previous, current):
    """A trend reappearing in daily snapshots is counted once, at peak volume."""
    by_key = {}
    for item in [*previous.get("items", []), *current.get("items", [])]:
        key = (slug(item["title"]), item["publishedAt"])
        if key not in by_key or item["volumeLowerBound"] > by_key[key]["volumeLowerBound"]:
            by_key[key] = item
    latest = max((item["date"] for item in by_key.values()), default=None)
    keep_after = (date.fromisoformat(latest) - timedelta(days=60)).isoformat() if latest else ""
    return {**current, "items": sorted((v for v in by_key.values() if v["date"] >= keep_after), key=lambda v: v["publishedAt"])}


def trend_signals(raw, candidates, as_of, fetched_at):
    scores = defaultdict(float)
    matched = []
    for item in (raw or {}).get("items", []):
        age = (date.fromisoformat(as_of) - date.fromisoformat(item["date"])).days
        if not 0 <= age <= 28:
            continue
        title = f"-{slug(item['title'])}-"
        # Full names only: no ambiguous surname guessing or AI classification.
        ids = [c["id"] for c in candidates if f"-{slug(c['name'])}-" in title]
        for candidate in ids:
            scores[candidate] += item["volumeLowerBound"] * 0.5 ** (age / 7)
        if ids:
            matched.append({**item, "candidateIds": ids})
    return {"kind": "trending-now-rss", "asOf": fetched_at[:10] if fetched_at else None,
            "windowDays": 28, "interest": dict(scores), "matched": matched,
            "note": "Recherches en forte hausse en France ; volumes minimums, pas l’ensemble des recherches. Absence du flux ≠ absence d’intérêt."}


def wikipedia_title(candidate) -> str:
    return WIKIPEDIA_TITLES.get(candidate["id"], candidate["name"].replace(" ", "_"))


def wikipedia_url(candidate, start: date, end: date) -> str:
    title = quote(wikipedia_title(candidate), safe="")
    return f"{WIKIPEDIA_API}/{title}/daily/{start:%Y%m%d}/{end:%Y%m%d}"


def parse_pageviews(raw):
    """Réponse Wikimedia Pageviews : consultations humaines quotidiennes, indexées par date ISO."""
    payload = json.loads(raw)
    items = payload.get("items") if isinstance(payload, dict) else None
    if not isinstance(items, list):
        raise ValueError("Réponse Wikimedia inattendue.")
    views = {}
    for item in items:
        stamp = str(item.get("timestamp", ""))
        count = number(item.get("views"))
        if len(stamp) < 8 or count is None or count < 0:
            continue
        views[f"{stamp[:4]}-{stamp[4:6]}-{stamp[6:8]}"] = int(count)
    return views


def merge_pageviews(previous, current, keep_days=180):
    """Fusionne les séries par candidat et ne conserve que les derniers jours utiles."""
    merged = {candidate: dict(views) for candidate, views in (previous or {}).items()}
    for candidate, views in current.items():
        merged.setdefault(candidate, {}).update(views)
    latest = max((day for views in merged.values() for day in views), default=None)
    if not latest:
        return merged
    keep_after = (date.fromisoformat(latest) - timedelta(days=keep_days)).isoformat()
    return {candidate: {day: count for day, count in sorted(views.items()) if day >= keep_after}
            for candidate, views in merged.items()}


WIKIPEDIA_REFERENCE_DAYS = 28
WIKIPEDIA_MINIMUM_DAILY = 30


def _views_between(views, first: date, last: date):
    return [views[day] for day in sorted(views) if first.isoformat() <= day <= last.isoformat()]


def wikipedia_window(series, anchor, as_of):
    """Dynamique de consultations depuis la fin d'un terrain de sondage, comme le baromètre.

    Référence : médiane des 28 jours qui précèdent la fin du terrain (jour inclus).
    Actuel : médiane des jours suivants, jusqu'au dernier relevé. Les médianes neutralisent
    les pics d'un jour. Sans jour postérieur au terrain, la dynamique repart de zéro.
    """
    anchor_date = date.fromisoformat(anchor)
    as_of_date = date.fromisoformat(as_of)
    signals = {}
    for candidate, views in (series or {}).items():
        days = sorted(day for day in views if day <= as_of)
        if not days or (as_of_date - date.fromisoformat(days[-1])).days > 3:
            continue
        reference = _views_between(views, anchor_date - timedelta(days=WIKIPEDIA_REFERENCE_DAYS - 1), anchor_date)
        if len(reference) < WIKIPEDIA_REFERENCE_DAYS - 4:
            continue
        reference_level = statistics.median(reference)
        if reference_level < WIKIPEDIA_MINIMUM_DAILY:
            continue
        current = _views_between(views, anchor_date + timedelta(days=1), as_of_date)
        current_level = statistics.median(current) if current else reference_level
        if current_level <= 0:
            continue
        signals[candidate] = {"dynamic": math.log(current_level / reference_level),
                              "change": (current_level / reference_level - 1) * 100,
                              "referenceDaily": round(reference_level, 1), "currentDaily": round(current_level, 1),
                              "days": len(current), "through": days[-1]}
    return {"anchor": anchor, "anchorKind": "fieldEnd", "signals": signals}


def wikipedia_signals(series, as_of, fetched_at, anchors=()):
    latest = max((day for views in (series or {}).values() for day in views if day <= as_of), default=None)
    return {"kind": "wikimedia-pageviews", "project": "fr.wikipedia", "asOf": latest, "fetchedAt": fetched_at,
            "referenceDays": WIKIPEDIA_REFERENCE_DAYS,
            "windows": {anchor: wikipedia_window(series, anchor, as_of) for anchor in sorted(set(anchors))},
            "note": "Consultations humaines de Wikipédia en français (robots exclus). Dynamique depuis la fin du dernier terrain compatible : médiane des jours suivants face à la médiane des 28 jours précédents. Une consultation n’est pas une intention de vote."}


def parse_market(raw, captured_at, title=None):
    events = raw if isinstance(raw, list) else [raw]
    if not events or not isinstance(events[0], dict) or not events[0].get("markets"):
        raise ValueError("Événement Polymarket absent ou schéma modifié.")
    event = events[0]
    markets = []
    for market in event["markets"]:
        if market.get("closed") or not market.get("active", True):
            continue
        name = market.get("groupItemTitle")
        if not name or PLACEHOLDER_MARKET.match(name.strip()):
            continue
        prices = market.get("outcomePrices", [])
        outcomes = market.get("outcomes", [])
        try:
            prices = json.loads(prices) if isinstance(prices, str) else prices
            outcomes = json.loads(outcomes) if isinstance(outcomes, str) else outcomes
            yes = outcomes.index("Yes")
            probability = float(prices[yes])
            if not 0 <= probability <= 1:
                continue
        except (ValueError, TypeError, IndexError):
            continue
        bid, ask = number(market.get("bestBid")), number(market.get("bestAsk"))
        markets.append({"id": slug(name), "name": name, "probability": probability * 100,
                        "bid": bid, "ask": ask, "spread": ask - bid if bid is not None and ask is not None else None,
                        "liquidity": number(market.get("liquidity")),
                        "volume24h": number(market.get("volume24hr")),
                        "url": f"https://polymarket.com/event/{event.get('slug', '')}/{market.get('slug', '')}"})
    if not markets:
        raise ValueError("Aucun prix public exploitable.")
    return {"capturedAt": captured_at, "updatedAt": event.get("updatedAt"),
            "url": f"https://polymarket.com/event/{event.get('slug', 'next-french-presidential-election')}",
            "title": title or event.get("title"), "endDate": event.get("endDate"),
            "scope": "Victoire nationale, toutes candidatures possibles, inconditionnelle.",
            "markets": sorted(markets, key=lambda market: -market["probability"])}
