import json
import math
import sys
import tempfile
import unittest
from datetime import date, timedelta
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "pipeline"))
import collect
from sources import normalize_history, parse_market, parse_polls, slug, social_signals, parse_trends, merge_trends, trend_signals, barometer_window
from sources import parse_pageviews, wikipedia_signals, wikipedia_url, wikipedia_window, barometer_daily, market_history, recent_series, barometer_anchors

HEADER = "sondage_id,institut,terrain_debut,terrain_fin,echantillon,tour,configuration,configuration_principale,echantillon_configuration,candidat,parti,score,url_source\n"


class SourceTests(unittest.TestCase):
    def test_barometer_anchors_to_last_poll_and_resets_without_future_data(self):
        rows = [{"date": f"2026-10-{day}", "accounts": {"a": audience, "b": 200}}
                for day, audience in [(18, 100), (19, 110), (20, 121), (21, 999)]]
        histories = {"instagram": rows, "twitter": rows}
        signal = barometer_window(histories, "2026-10-19", "2026-10-20")
        self.assertAlmostEqual(signal["signals"]["a"]["score"], 60.5)
        self.assertEqual(signal["signals"]["a"]["coverage"], 2)
        self.assertEqual(signal["signals"]["a"]["periods"][0]["from"], "2026-10-19")
        self.assertEqual(signal["signals"]["a"]["periods"][0]["through"], "2026-10-20")
        reset = barometer_window(histories, "2026-10-20", "2026-10-20")
        self.assertEqual(reset["signals"]["a"]["score"], 0)
        self.assertFalse(barometer_window(histories, "2026-10-17", "2026-10-20")["signals"])

    def test_barometer_formula_keeps_dynamics_and_platform_surface(self):
        first = [{"date": f"2026-10-{day:02d}", "accounts": {"a": 100, "b": 320}} for day in range(14, 20)]
        first.append({"date": "2026-10-20", "accounts": {"a": 160, "b": 320}})
        second = [{"date": f"2026-10-{day:02d}", "accounts": {"a": 20, "b": 80}} for day in range(14, 20)]
        second.append({"date": "2026-10-20", "accounts": {"a": 40, "b": 80}})
        signal = social_signals({"instagram": first, "twitter": second}, "2026-10-20")["signals"]["a"]
        # (600 per mille × 160/320 × 1 + 1000 × 40/80 × .25) / 1.25
        self.assertAlmostEqual(signal["barometerScore"], 340)
        self.assertEqual(signal["barometerCoverage"], 2)
        self.assertEqual(signal["windowElapsedDays"], [6])

    def test_google_rss_volume_dedup_matching_and_no_future(self):
        xml = b'''<rss xmlns:ht="https://trends.google.com/trending/rss"><channel><item><title>Marine Le Pen</title><ht:approx_traffic>2K+</ht:approx_traffic><pubDate>Tue, 20 Oct 2026 06:00:00 +0200</pubDate></item></channel></rss>'''
        parsed = parse_trends(xml)
        self.assertEqual(parsed["items"][0]["volumeLowerBound"], 2000)
        merged = merge_trends(parsed, parsed)
        self.assertEqual(len(merged["items"]), 1)
        candidates = [{"id": "marine-le-pen", "name": "Marine Le Pen"}, {"id": "jean-luc-melenchon", "name": "Jean-Luc Mélenchon"}]
        signal = trend_signals(merged, candidates, "2026-10-20", "2026-10-20T12:00:00Z")
        self.assertEqual(signal["interest"], {"marine-le-pen": 2000})
        self.assertNotIn("jean-luc-melenchon", signal["interest"])
        self.assertEqual(trend_signals(merged, candidates, "2026-10-19", "2026-10-20T12:00:00Z")["interest"], {})
        with self.assertRaises(ValueError):
            parse_trends(b"<html><body>Error</body></html>")

    def test_unicode_matching(self):
        self.assertEqual(slug("François RUFFIN"), "francois-ruffin")
        self.assertEqual(slug("Marine LE PEN"), "marine-le-pen")

    def test_polls_preserve_configurations_and_reject_incomplete_groups(self):
        text = HEADER + "p1,Ifop,2026-10-17,2026-10-19,2000,1,1,1,,Alice A,PA,40,https://example.com/source\n" + "p1,Ifop,2026-10-17,2026-10-19,2000,1,1,1,,Bob B,PB,60,https://example.com/source\n" + "p1,Ifop,2026-10-17,2026-10-19,2000,1,2,0,,Alice A,PA,50,https://example.com/source\n"
        result = parse_polls(text, "2026-10-20")
        self.assertEqual(len(result["polls"]), 1)
        self.assertEqual(result["polls"][0]["sampleSize"], 1000)
        self.assertEqual(len(result["rejected"]), 1)

    def test_unexpected_csv_fails_instead_of_returning_empty_polling_data(self):
        with self.assertRaises(ValueError):
            parse_polls("name,score\nA,30", "2026-10-20")

    def test_social_missing_values_and_actual_dates(self):
        raw = [{"date": "2026-10-12", "accounts": {"Alice A": {"followers": 100}}}, {"date": "2026-10-19", "accounts": {"Alice A": {"followers": 110}, "Bob B": {"followers": None}}}]
        normalized = normalize_history(raw)
        signals = social_signals({"instagram": normalized, "twitter": normalized}, "2026-10-20")
        self.assertAlmostEqual(signals["signals"]["alice-a"]["growth7"], 10)
        self.assertEqual(signals["signals"]["alice-a"]["coverage"], 2)
        self.assertIsNone(signals["signals"]["alice-a"]["growth28"])
        self.assertNotIn("bob-b", signals["signals"])
        self.assertFalse(social_signals({"instagram": normalized}, "2026-10-25")["signals"])

    def test_market_yes_index_and_missing_orderbook(self):
        raw = [{"slug": "example", "markets": [{"groupItemTitle": "Alice A", "outcomes": '["No","Yes"]', "outcomePrices": '["0.7","0.3"]', "slug": "alice", "active": True}]}]
        market = parse_market(raw, "2026-10-20T12:00:00Z")
        self.assertEqual(market["markets"][0]["probability"], 30)
        self.assertIsNone(market["markets"][0]["spread"])

    def test_failed_fetch_preserves_last_success_and_date(self):
        temporary_root = Path(__file__).resolve().parents[1] / "output"
        temporary_root.mkdir(exist_ok=True)
        with tempfile.TemporaryDirectory(dir=temporary_root) as directory:
            cache = Path(directory)
            record = {"data": {"value": 42}, "fetchedAt": "2026-10-19T12:00:00Z", "sha256": "abc"}
            (cache / "source.json").write_text(json.dumps(record), encoding="utf-8")
            with patch.object(collect, "CACHE", cache), patch.object(collect, "fetch", side_effect=RuntimeError("network failed")):
                value, status = collect.collect_source("source", "Source", "https://example.com", json.loads, "2026-10-20T12:00:00Z", False)
            self.assertEqual(value["value"], 42)
            self.assertEqual(status["status"], "cached")
            self.assertEqual(status["fetchedAt"], record["fetchedAt"])
            self.assertEqual(json.loads((cache / "source.json").read_text(encoding="utf-8")), record)

    def test_remote_history_shortening_preserves_older_observations(self):
        temporary_root = Path(__file__).resolve().parents[1] / "output"
        temporary_root.mkdir(exist_ok=True)
        with tempfile.TemporaryDirectory(dir=temporary_root) as directory:
            cache = Path(directory)
            previous = {"data": [{"date": "2026-05-17", "accounts": {"alice": 100}}], "fetchedAt": "2026-10-19T12:00:00Z", "sha256": "old"}
            (cache / "instagram.json").write_text(json.dumps(previous), encoding="utf-8")
            recent = [{"date": "2026-10-18", "accounts": {"alice": 200}}]
            with patch.object(collect, "CACHE", cache), patch.object(collect, "fetch", return_value=json.dumps(recent).encode()):
                value, status = collect.collect_source("instagram", "Instagram", "https://example.com", json.loads, "2026-10-20T12:00:00Z", False)
            self.assertEqual([row["date"] for row in value], ["2026-05-17", "2026-10-18"])
            self.assertEqual(status["observedThrough"], "2026-10-18")
            self.assertEqual(status["fetchedAt"], "2026-10-20T12:00:00Z")

    def test_wikipedia_dynamic_since_poll_uses_medians_and_resets(self):
        def series(before, after, spike=None):
            views = {}
            for offset in range(40):
                day = date(2026, 10, 22) - timedelta(days=offset)
                views[day.isoformat()] = before
            for offset in range(1, 9):
                views[(date(2026, 10, 22) + timedelta(days=offset)).isoformat()] = after
            if spike:
                views["2026-10-05"] = spike
            return views

        raw = json.dumps({"items": [{"timestamp": "2026102900", "views": 120}, {"timestamp": "bad", "views": 5}]})
        self.assertEqual(parse_pageviews(raw), {"2026-10-29": 120})
        pageviews = {"a": series(100, 200), "b": series(100, 50, spike=167000), "small": series(10, 10)}
        window = wikipedia_window(pageviews, "2026-10-22", "2026-10-31")
        self.assertAlmostEqual(window["signals"]["a"]["dynamic"], math.log(2))
        self.assertAlmostEqual(window["signals"]["b"]["dynamic"], math.log(0.5))
        self.assertAlmostEqual(window["signals"]["b"]["referenceDaily"], 100)
        self.assertNotIn("small", window["signals"])
        reset = wikipedia_window(pageviews, "2026-10-30", "2026-10-30")
        self.assertEqual(reset["signals"]["a"]["dynamic"], 0)
        self.assertEqual(reset["signals"]["a"]["days"], 0)
        signals = wikipedia_signals(pageviews, "2026-10-31", "2026-10-31T06:00:00Z", ["2026-10-22", "2026-10-22"])
        self.assertEqual(list(signals["windows"]), ["2026-10-22"])
        self.assertEqual(signals["asOf"], "2026-10-30")
        self.assertIn("Jean-Luc_M%C3%A9lenchon", wikipedia_url({"id": "jlm", "name": "Jean-Luc Mélenchon"},
                                                              date(2026, 10, 1), date(2026, 10, 30)))

    def test_barometer_windows_start_7_to_30_days_before_the_data(self):
        anchors = barometer_anchors("2026-11-10")
        self.assertEqual(len(anchors), 24)
        self.assertEqual(anchors[0], "2026-11-03")
        self.assertEqual(anchors[-1], "2026-10-11")
        rows = [{"date": (date(2026, 10, 5) + timedelta(days=day)).isoformat(), "accounts": {"a": 1000 + 10 * day, "b": 2000}}
                for day in range(37)]
        window = barometer_window({"instagram": rows, "twitter": rows}, anchors[-1], "2026-11-10")
        self.assertEqual(window["anchorKind"], "windowStart")
        self.assertGreater(window["signals"]["a"]["score"], 0)
        self.assertEqual(window["signals"]["b"]["score"], 0)

    def test_history_series_cover_the_recent_window_only(self):
        snapshots = {"2026-01-01": [{"id": "a", "probability": 10}], "2026-10-30": [{"id": "a", "probability": 40.123}], "2026-11-01": [{"id": "a", "probability": 45}]}
        self.assertEqual(market_history(snapshots, "2026-10-31"), {"a": {"2026-10-30": 40.12}})
        self.assertEqual(recent_series({"a": {"2026-01-01": 5, "2026-10-30": 7}}, "2026-10-31"), {"a": {"2026-10-30": 7}})
        rows = [{"date": f"2026-10-{day}", "accounts": {"a": 1000 + day, "b": 2000}} for day in range(20, 26)]
        daily = barometer_daily({"instagram": rows, "twitter": rows}, "2026-10-25", days=4)
        self.assertEqual(sorted(daily["a"]), ["2026-10-22", "2026-10-23", "2026-10-24", "2026-10-25"])
        self.assertGreater(daily["a"]["2026-10-25"], 0)

    def test_market_event_drops_placeholder_rows(self):
        event = [{"slug": "event", "title": "Event", "endDate": "2027-04-18T23:59:00Z", "markets": [
            {"groupItemTitle": name, "outcomes": json.dumps(["Yes", "No"]), "outcomePrices": json.dumps([price, 1 - price]),
             "slug": name.lower().replace(" ", "-"), "liquidity": liquidity}
            for name, price, liquidity in [("Marine Le Pen", .85, "43994"), ("Candidate A", .5, "0"),
                                           ("Other", .5, "0"), ("Jean-Luc Mélenchon", .09, "100")]]}]
        parsed = parse_market(event, "2026-11-05T06:00:00Z", "Vainqueur du premier tour")
        self.assertEqual([m["name"] for m in parsed["markets"]], ["Marine Le Pen", "Jean-Luc Mélenchon"])
        self.assertEqual(parsed["title"], "Vainqueur du premier tour")
        self.assertIn("/event/event", parsed["url"])

    def test_market_events_keep_one_failure_isolated(self):
        temporary_root = Path(__file__).resolve().parents[1] / "output"
        temporary_root.mkdir(exist_ok=True)
        with tempfile.TemporaryDirectory(dir=temporary_root) as directory:
            payload = json.dumps([{"slug": "x", "markets": [{"groupItemTitle": "A B", "outcomes": json.dumps(["Yes", "No"]),
                                                              "outcomePrices": json.dumps([.4, .6])}]}]).encode()
            answers = [payload, RuntimeError("HTTP 500"), payload, payload, payload]
            with patch.object(collect, "CACHE", Path(directory)), patch.object(collect, "fetch", side_effect=answers):
                events = collect.collect_market_events("2026-11-05T06:00:00Z", False)
            self.assertEqual(sorted(events), ["advance", "ballot", "third", "winner"])
            self.assertTrue(all(event["status"] == "ok" for event in events.values()))

    def test_wikipedia_partial_failure_keeps_other_series_and_cache(self):
        temporary_root = Path(__file__).resolve().parents[1] / "output"
        temporary_root.mkdir(exist_ok=True)
        with tempfile.TemporaryDirectory(dir=temporary_root) as directory:
            cache = Path(directory)
            previous = {"data": {"b": {"2026-10-01": 40}}, "fetchedAt": "2026-10-19T12:00:00Z", "sha256": "old"}
            (cache / "wikipedia.json").write_text(json.dumps(previous), encoding="utf-8")
            answers = [json.dumps({"items": [{"timestamp": "2026103000", "views": 80}]}).encode(), RuntimeError("HTTP 429")]
            candidates = [{"id": "a", "name": "Alice A"}, {"id": "b", "name": "Bob B"}]
            with patch.object(collect, "CACHE", cache), patch.object(collect, "fetch", side_effect=answers):
                value, status = collect.collect_wikipedia(candidates, "2026-10-31", "2026-10-31T06:00:00Z", False, pause=0)
            self.assertEqual(value["a"], {"2026-10-30": 80})
            self.assertEqual(value["b"], {"2026-10-01": 40})
            self.assertEqual(status["status"], "ok")
            self.assertIn("1 article(s) non lus", status["error"])


if __name__ == "__main__":
    unittest.main()
