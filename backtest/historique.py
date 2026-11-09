"""Chargement des sondages et résultats des présidentielles passées.

Sources (voir data/historique/SOURCES.md) :
- pollsposition/data (licence MIT) : sondages par camp 1965-2017, sondages 2017, résultats officiels ;
- nsppolls/nsppolls (licence MIT) : sondages par candidat de la présidentielle 2022.
"""
from __future__ import annotations

import csv
import json
from collections import defaultdict
from datetime import date
from pathlib import Path

SOURCES = Path(__file__).resolve().parents[1] / "data" / "historique" / "sources"

BLOC_COLUMNS = {
    "nbfarleft": "extreme-gauche",
    "nbleft": "gauche",
    "nbgreen": "ecologistes",
    "nbcenterleft": "centre-gauche",
    "nbcenter": "centre",
    "nbcenterright": "centre-droit",
    "nbright": "droite",
    "nbsouverainistes": "souverainistes",
    "nbfarright": "extreme-droite",
}

# Résultats officiels du premier tour 2022 (Conseil constitutionnel, suffrages exprimés).
RESULTS_2022 = {
    "Emmanuel Macron": 27.85, "Marine Le Pen": 23.15, "Jean-Luc Mélenchon": 21.95, "Éric Zemmour": 7.07,
    "Valérie Pécresse": 4.78, "Yannick Jadot": 4.63, "Jean Lassalle": 3.13, "Fabien Roussel": 2.28,
    "Nicolas Dupont-Aignan": 2.06, "Anne Hidalgo": 1.75, "Philippe Poutou": 0.77, "Nathalie Arthaud": 0.56,
}
FIRST_ROUND_2022 = date(2022, 4, 10)
SECOND_ROUND_2022 = date(2022, 4, 24)
SECOND_ROUND_RESULT_2022 = {"Emmanuel Macron": 58.55, "Marine Le Pen": 41.45}
FIRST_ROUND_2017 = date(2017, 4, 23)
SECOND_ROUND_2017 = date(2017, 5, 7)
SECOND_ROUND_RESULT_2017 = {"Emmanuel Macron": 66.10, "Marine Le Pen": 33.90}


def _number(value):
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def bloc_elections():
    """Présidentielles par camp : {date du scrutin: {"result": {...}, "polls": [...]}}."""
    elections = defaultdict(lambda: {"result": None, "polls": []})
    with open(SOURCES / "pollsposition-tour1.csv", encoding="utf-8") as handle:
        for row in csv.DictReader(handle):
            if row["type"] != "president":
                continue
            scores = {bloc: _number(row[column]) for column, bloc in BLOC_COLUMNS.items()}
            scores = {bloc: value for bloc, value in scores.items() if value is not None}
            election = elections[date.fromisoformat(row["dateelection"])]
            if row["sondage"] == "result":
                election["result"] = scores
            else:
                election["polls"].append({"date": date.fromisoformat(row["date"]), "institute": row["sondage"], "scores": scores})
    return {day: value for day, value in elections.items() if value["result"]}


def polls_2022():
    """Sondages 2022 par candidat : une entrée par liste testée (enquête, tour, hypothèse)."""
    lists = {}
    with open(SOURCES / "nsppolls-2022.csv", encoding="utf-8") as handle:
        for row in csv.DictReader(handle):
            score = _number(row["intentions"])
            if score is None:
                continue
            key = (row["id"], row["tour"], row["hypothese"])
            entry = lists.setdefault(key, {
                "id": row["id"],
                "institute": row["nom_institut"],
                "date": date.fromisoformat(row["fin_enquete"]),
                "round": 1 if row["tour"] == "Premier tour" else 2,
                "scores": {},
            })
            entry["scores"][row["candidat"]] = score
    return list(lists.values())


def second_round_polls_2017():
    """Sondages du second tour 2017. Le fichier source date les enquêtes en 2021 : l'année est corrigée."""
    with open(SOURCES / "pollsposition-2017.json", encoding="utf-8") as handle:
        surveys = json.load(handle)["sondages"]
    polls = []
    for key, survey in surveys.items():
        for scenario in survey.get("second_tour", []):
            day = date.fromisoformat(survey["date_fin"]).replace(year=2017)
            polls.append({"id": key, "institute": survey["institut"], "date": day, "round": 2, "scores": scenario["intentions"]})
    return polls
