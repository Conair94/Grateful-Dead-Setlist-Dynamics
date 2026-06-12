"""Export show setlists + per-song audio features for the Show Explorer page.

Produces docs/data/shows.json:
    {
      "features": ["energy", "tempo", "danceability", "brightness", "dynamics"],
      "songs": [
          {"t": "Dark Star",
           "raw": {"tempo": 88.1, ...},          # human-readable raw values
           "pct": {"tempo": 0.42, ...}},          # 0-1 percentile rank of the
                                                  # era-normalized z-score
          {"t": "Forever Young"}                  # no audio features available
      ],
      "shows": [
          {"id": "...", "date": "1977-05-08",
           "venue": "Barton Hall", "city": "Ithaca", "state": "NY",
           "sets": [{"type": "set1", "songs": [[songIdx, segue01], ...]}, ...]}
      ]
    }

Display values are percentile ranks (quantile transform) of the era-normalized
z-scores from data/refined/: robust to outliers and directly comparable across
features on a shared 0-1 axis.
"""
import sqlite3
import json
import glob
import os
from collections import defaultdict

# Display feature -> essentia key in normalized_features / average_features
FEATURE_MAP = {
    "energy": "lowlevel.loudness_ebu128.integrated",
    "tempo": "rhythm.bpm",
    "danceability": "rhythm.danceability",
    "brightness": "lowlevel.spectral_centroid.mean",
    "dynamics": "lowlevel.loudness_ebu128.loudness_range",
}


def classify_sets(set_lens):
    """Same heuristic as export_graph_data.py: short final set = encore."""
    types = []
    for i, n in enumerate(set_lens):
        is_last = (i == len(set_lens) - 1)
        if i == 0:
            types.append("set1")
        elif (is_last and n <= 2) or i >= 2:
            types.append("epilogue")
        else:
            types.append("set2")
    return types


def load_refined_features(refined_dir):
    """Map song_title -> {raw: {...}, norm: {...}} for the display features."""
    out = {}
    for fp in glob.glob(os.path.join(refined_dir, "*.json")):
        with open(fp) as f:
            d = json.load(f)
        raw = d.get("average_features", {})
        norm = d.get("normalized_features", {})
        feats_raw, feats_norm = {}, {}
        for name, key in FEATURE_MAP.items():
            if key in raw:
                feats_raw[name] = round(float(raw[key]), 3)
            if key in norm:
                feats_norm[name] = float(norm[key])
        if feats_norm:
            out[d["song_title"]] = {"raw": feats_raw, "norm": feats_norm}
    return out


def percentile_ranks(features_by_title):
    """Convert each feature's z-scores to 0-1 percentile ranks across the catalog."""
    by_feature = defaultdict(list)
    for title, d in features_by_title.items():
        for name, val in d["norm"].items():
            by_feature[name].append(val)
    sorted_vals = {name: sorted(vals) for name, vals in by_feature.items()}

    def rank(name, val):
        vals = sorted_vals[name]
        # midpoint rank, ties handled adequately for display purposes
        import bisect
        lo = bisect.bisect_left(vals, val)
        hi = bisect.bisect_right(vals, val)
        return round(((lo + hi) / 2) / len(vals), 4)

    pct = {}
    for title, d in features_by_title.items():
        pct[title] = {name: rank(name, val) for name, val in d["norm"].items()}
    return pct


def export(db_path="data/raw/grateful_dead.db",
           refined_dir="data/refined",
           output_path="docs/data/shows.json"):
    features = load_refined_features(refined_dir)
    pct = percentile_ranks(features)

    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    cursor.execute("SELECT song_id, title FROM songs")
    song_rows = cursor.fetchall()
    song_index = {}   # song_id -> index in songs list
    songs = []
    for r in song_rows:
        entry = {"t": r["title"]}
        if r["title"] in features:
            entry["raw"] = features[r["title"]]["raw"]
            entry["pct"] = pct[r["title"]]
        song_index[r["song_id"]] = len(songs)
        songs.append(entry)

    cursor.execute("""
        SELECT show_id, show_date, venue_name, city, state, country
        FROM shows ORDER BY show_date
    """)
    shows_out = []
    for show in cursor.fetchall():
        cursor.execute("""
            SELECT song_id, set_sequence, song_sequence, segue
            FROM show_songs WHERE show_id = ?
            ORDER BY set_sequence ASC, song_sequence ASC
        """, (show["show_id"],))
        rows = cursor.fetchall()
        if not rows:
            continue

        sets = defaultdict(list)
        for r in rows:
            sets[r["set_sequence"]].append(r)
        set_keys = sorted(sets.keys())
        set_types = classify_sets([len(sets[k]) for k in set_keys])

        date = show["show_date"] or ""
        if "T" in date:
            date = date.split("T")[0]

        shows_out.append({
            "id": show["show_id"],
            "date": date,
            "venue": show["venue_name"] or "",
            "city": show["city"] or "",
            "state": show["state"] or "",
            "sets": [
                {"type": set_types[i],
                 "songs": [[song_index[r["song_id"]], 1 if r["segue"] else 0]
                           for r in sets[k]]}
                for i, k in enumerate(set_keys)
            ],
        })

    conn.close()

    out = {
        "features": list(FEATURE_MAP.keys()),
        "songs": songs,
        "shows": shows_out,
    }
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(out, f, separators=(",", ":"))

    n_feat = sum(1 for s in songs if "pct" in s)
    print(f"Exported {len(shows_out)} shows, {len(songs)} songs "
          f"({n_feat} with features) to {output_path} "
          f"({os.path.getsize(output_path) / 1e6:.1f} MB)")


if __name__ == "__main__":
    db = "data/raw/grateful_dead.db"
    if not os.path.exists(db):
        db = "../data/raw/grateful_dead.db"
        os.chdir("..")
    export()
