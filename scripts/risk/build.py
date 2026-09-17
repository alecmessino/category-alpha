"""Build a published Trigger Evidence Record.

    python3 build.py                 # every record
    python3 build.py lowell-2026     # one record

Each record is a module of its own -- its figures and its prose -- over the shared evaluator
in tec.py and the shared machinery in record.py. This file only decides which ones to run.
"""
import importlib
import sys

from tec import EVENTS

MODULE = {slug: f"record_{slug.split('-')[0]}" for slug in EVENTS}


def build(slug: str):
    if slug not in MODULE:
        raise SystemExit(f"unknown record {slug!r}; known: {', '.join(sorted(MODULE))}")
    print(f"=== {slug} ===")
    importlib.import_module(MODULE[slug])


if __name__ == "__main__":
    wanted = sys.argv[1:] or sorted(MODULE)
    for slug in wanted:
        build(slug)
