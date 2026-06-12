# Setlist Forecasting: Next-Song Prediction

Treats a Grateful Dead show as a token sequence and asks: **given the songs
played so far, what comes next?** This is the standard autoregressive
forecasting framing — the same one language models use — applied to setlists.

## Framing

Each show is one sequence:

```
<ERA_1975-1979> <START> The Music Never Stopped → Friend Of The Devil → … <SET_BREAK> … <ENCORE_BREAK> U.S. Blues <END>
```

- The **era token** is prepended so the model conditions on the band's period
  (this is *conditional generation*: prompting with `<ERA_1970-1974>` yields
  primal-Dead-shaped shows, `<ERA_1985-1989>` yields late-80s shows).
- **Structural tokens** (`<SET_BREAK>`, `<ENCORE_BREAK>`, `<END>`) let models
  learn show architecture, mirroring the special nodes in the transition graph.

## Models

| Model | Context used | What it captures |
|---|---|---|
| `unigram` | none | song popularity floor |
| `markov-bigram` | previous song only | pairwise transitions (the website's "generative walk") |
| `transformer` | entire show so far | long-range structure: no-repeats, set position, era style, segue suites |

The transformer is a small decoder-only (GPT-style) model with a **causal
attention mask** (each position attends only to the past — exactly the
forecasting constraint), **weight tying** between input embeddings and the
output layer (a small-data regularizer), and optional **feature-augmented
embeddings**: each song's embedding is summed with a linear projection of its
51 era-normalized Essentia audio features, so sonically similar songs share
representation even when rarely played.

## Evaluation

All models are scored on identical positions of identical held-out shows
under **teacher forcing** (the true prefix is always given). Metrics:

- **top-1 / top-5 accuracy** — was the actual next song in the model's top picks?
- **perplexity** — exp(mean negative log-likelihood); how "surprised" the
  model is by reality. Lower is better.

Reported for *all tokens* and for *song-only positions* (the honest number —
predicting `<END>` after an encore is easy; picking 1 of ~480 songs is not).

Two split modes:

- `--split random` (default): random shows held out across all eras.
  Measures how well the distribution is modeled.
- `--split temporal`: train on the past, test on the future (true
  forecasting). Harder, because the band's style drifts — the gap between
  the two splits is itself a measure of non-stationarity.

## Running

```bash
# from the repo root
python3 -m models.setlist_forecasting.train                  # full comparison
python3 -m models.setlist_forecasting.train --split temporal
python3 -m models.setlist_forecasting.train --no-features    # ablation
```

Trains in a few minutes on CPU/MPS (the corpus is ~47k tokens — tiny — which
is why the model is small and heavily regularized; the risk here is
overfitting, not underfitting).

## Results (2026-06-12, random split, seed 42, 200 epochs)

See `RESULTS.md` for the current numbers and sampled setlists.
