import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "pipeline"))
import collect
from sources import normalize_history, parse_market, parse_polls, slug, social_signals, parse_trends, merge_trends, trend_signals, barometer_window

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


if __name__ == "__main__":
    unittest.main()
