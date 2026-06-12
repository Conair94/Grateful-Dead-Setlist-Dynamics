"""Build next-song-prediction sequences from the setlist database.

Each show becomes one token sequence:

    <ERA_1975-1979> START song song ... SET_BREAK song ... ENCORE_BREAK song END

The leading era token conditions generation on a period of the band's
history ("write me a 1977 setlist"), and the structural tokens let a model
learn set boundaries the same way the transition graph does.

Vocabulary layout: PAD=0, then structural tokens, then era tokens, then
song titles (sorted). Song-level audio features (era-normalized z-scores
from data/refined/) are exposed as a (vocab_size, n_features) matrix for
feature-augmented embeddings; rows for non-song tokens and songs without
audio features are zero.
"""
import glob
import json
import os
import random
import sqlite3
from collections import defaultdict
from dataclasses import dataclass, field

PAD = "<PAD>"
START = "<START>"
SET_BREAK = "<SET_BREAK>"
ENCORE_BREAK = "<ENCORE_BREAK>"
END = "<END>"
STRUCTURAL = [PAD, START, SET_BREAK, ENCORE_BREAK, END]

ERA_BUCKETS = ["1965-1969", "1970-1974", "1975-1979",
               "1980-1984", "1985-1989", "1990-1995"]


def era_bucket(year):
    if year < 1970: return "1965-1969"
    if year < 1975: return "1970-1974"
    if year < 1980: return "1975-1979"
    if year < 1985: return "1980-1984"
    if year < 1990: return "1985-1989"
    return "1990-1995"


def era_token(bucket):
    return f"<ERA_{bucket}>"


def classify_sets(set_lens):
    """Same heuristic as Processing/export_graph_data.py."""
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


@dataclass
class SetlistCorpus:
    vocab: list                      # idx -> token string
    token_to_id: dict
    shows: list                      # list of dicts {date, tokens(list[int])}
    n_songs: int
    feature_names: list = field(default_factory=list)
    features: "object" = None        # numpy (V, F) matrix or None

    @property
    def vocab_size(self):
        return len(self.vocab)

    def decode(self, ids):
        return [self.vocab[i] for i in ids]


def load_corpus(db_path="data/raw/grateful_dead.db",
                refined_dir="data/refined",
                with_features=True):
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()

    cur.execute("SELECT song_id, title FROM songs")
    id_to_title = {r["song_id"]: r["title"] for r in cur.fetchall()}
    song_titles = sorted(set(id_to_title.values()))

    vocab = (STRUCTURAL
             + [era_token(b) for b in ERA_BUCKETS]
             + song_titles)
    token_to_id = {t: i for i, t in enumerate(vocab)}

    cur.execute("SELECT show_id, show_date FROM shows ORDER BY show_date")
    show_rows = cur.fetchall()

    shows = []
    for show in show_rows:
        cur.execute("""
            SELECT song_id, set_sequence, song_sequence
            FROM show_songs WHERE show_id = ?
            ORDER BY set_sequence ASC, song_sequence ASC
        """, (show["show_id"],))
        rows = cur.fetchall()
        if not rows:
            continue

        sets = defaultdict(list)
        for r in rows:
            sets[r["set_sequence"]].append(r)
        set_keys = sorted(sets.keys())
        set_types = classify_sets([len(sets[k]) for k in set_keys])

        date = (show["show_date"] or "1970-01-01").split("T")[0]
        bucket = era_bucket(int(date[:4]))

        tokens = [token_to_id[era_token(bucket)], token_to_id[START]]
        for i, k in enumerate(set_keys):
            if i > 0:
                brk = ENCORE_BREAK if set_types[i] == "epilogue" else SET_BREAK
                tokens.append(token_to_id[brk])
            for r in sets[k]:
                tokens.append(token_to_id[id_to_title[r["song_id"]]])
        tokens.append(token_to_id[END])

        shows.append({"date": date, "tokens": tokens})
    conn.close()

    corpus = SetlistCorpus(
        vocab=vocab,
        token_to_id=token_to_id,
        shows=shows,
        n_songs=len(song_titles),
    )

    if with_features:
        _attach_features(corpus, refined_dir)
    return corpus


def _attach_features(corpus, refined_dir):
    import numpy as np
    by_title = {}
    feature_names = None
    for fp in glob.glob(os.path.join(refined_dir, "*.json")):
        with open(fp) as f:
            d = json.load(f)
        norm = d.get("normalized_features")
        if not norm:
            continue
        if feature_names is None:
            feature_names = sorted(norm.keys())
        by_title[d["song_title"]] = [float(norm.get(k, 0.0)) for k in feature_names]

    if feature_names is None:
        return
    mat = np.zeros((corpus.vocab_size, len(feature_names)), dtype="float32")
    for title, vec in by_title.items():
        if title in corpus.token_to_id:
            mat[corpus.token_to_id[title]] = vec
    corpus.feature_names = feature_names
    corpus.features = mat


def split_shows(shows, mode="random", seed=42, train=0.8, val=0.1):
    """Split shows into train/val/test.

    random:   shows shuffled across all eras (measures distribution modeling)
    temporal: chronological (true forecasting: train on the past, test on
              the future -- harder because the band's style drifts)
    """
    shows = sorted(shows, key=lambda s: s["date"])
    if mode == "random":
        rng = random.Random(seed)
        shows = shows[:]
        rng.shuffle(shows)
    n = len(shows)
    n_train = int(n * train)
    n_val = int(n * val)
    return (shows[:n_train],
            shows[n_train:n_train + n_val],
            shows[n_train + n_val:])
