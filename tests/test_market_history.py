import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "pipeline"))
from market_history import collect_board, fill_history, market_tokens, merge_series, parse_price_history

DAY = 86400
MIDNIGHT = 1762992000  # 2025-11-13 00:00 UTC


def gamma_event(markets):
    return json.dumps([{"slug": "next-french-presidential-election", "creationDate": "2025-11-13T23:10:18Z",
                        "markets": markets}]).encode()


def market(name, token, closed=False):
    return {"groupItemTitle": name, "question": f"Will {name} win?", "closed": closed, "slug": name.lower(),
            "outcomes": json.dumps(["Yes", "No"]), "clobTokenIds": json.dumps([token, f"{token}-no"])}


def prices(*values):
    return json.dumps({"history": [{"t": MIDNIGHT + index * DAY, "p": value} for index, value in enumerate(values)]}).encode()


class MarketHistoryTests(unittest.TestCase):
    def test_tokens_keep_closed_markets_and_drop_placeholders(self):
        raw = json.loads(gamma_event([market("Marine Le Pen", "a"), market("Other", "b"), market("Jordan Bardella", "c", True)]))
        _, markets = market_tokens(raw)
        self.assertEqual([(m["id"], m["token"], m["closed"]) for m in markets],
                         [("marine-le-pen", "a", False), ("jordan-bardella", "c", True)])

    def test_price_history_is_daily_in_percent(self):
        series = parse_price_history(prices(0.155, 0.2, 1.4))
        self.assertEqual(series, {"2025-11-13": 15.5, "2025-11-14": 20.0})

    def test_merge_keeps_older_points(self):
        self.assertEqual(merge_series({"2025-11-13": 10}, {"2025-11-14": 12}), {"2025-11-13": 10, "2025-11-14": 12})

    def test_closed_market_is_not_fetched_again_and_failures_stay_isolated(self):
        with tempfile.TemporaryDirectory() as directory:
            folder = Path(directory)
            previous = {"markets": {"jordan-bardella": {"closed": True, "series": {"2025-11-13": 34.0}}}}
            (folder / "president.json").write_text(json.dumps(previous), encoding="utf-8")
            answers = iter([gamma_event([market("Marine Le Pen", "a"), market("Jordan Bardella", "c", True),
                                         market("Jean-Luc Mélenchon", "d")]),
                            prices(0.15, 0.16), RuntimeError("HTTP 500")])

            def fetch(url):
                answer = next(answers)
                if isinstance(answer, Exception):
                    raise answer
                return answer

            status = collect_board("president", fetch, folder, "2026-11-10T00:30:00Z", pause=0)
            saved = json.loads((folder / "president.json").read_text(encoding="utf-8"))["markets"]
        self.assertEqual(status["status"], "ok")
        self.assertIn("1 marché(s) non lus", status["error"])
        self.assertEqual(saved["jordan-bardella"]["series"], {"2025-11-13": 34.0})
        self.assertEqual(saved["marine-le-pen"]["series"], {"2025-11-13": 15.0, "2025-11-14": 16.0})
        self.assertNotIn("jean-luc-melenchon", saved)

    def test_fill_history_never_replaces_site_readings(self):
        recent = {"marine-le-pen": {"2026-11-09": 45.0}}
        long = {"marine-le-pen": {"2026-11-08": 44.0, "2026-11-09": 40.0, "2026-01-01": 9.0}, "x": {"2026-11-08": 1.0}}
        filled = fill_history(recent, long, "2026-08-11", "2026-11-09")
        self.assertEqual(filled["marine-le-pen"], {"2026-11-08": 44.0, "2026-11-09": 45.0})
        self.assertEqual(filled["x"], {"2026-11-08": 1.0})


if __name__ == "__main__":
    unittest.main()
