# Plan & Testing: Next-Song Prediction

## Implementation plan (done 2026-06-12)
1. [x] Dataset builder (`dataset.py`): show → token sequence with era +
       structural tokens; song-feature matrix aligned to vocab; random and
       temporal split modes.
2. [x] Baselines (`markov.py`): unigram and add-alpha-smoothed bigram with
       a shared `next_distribution` interface.
3. [x] Transformer (`transformer.py`): 3-layer decoder-only, causal mask,
       weight tying, optional feature-augmented embeddings, era-conditioned
       sampling with within-show repeat masking.
4. [x] Shared eval (`train.py`): identical scoring positions for all models;
       top-1/top-5/perplexity over all-token and song-only scopes.

## Testing / verification
- Verified all three models run end-to-end on the real DB
  (1,968 shows, ~47k tokens) and produce sane orderings:
  unigram ≪ markov < transformer on every metric.
- Sanity-checked the sampled era-conditioned setlists against known
  conventions (openers, Drums in set 2, short encores).
- Results table: `models/setlist_forecasting/RESULTS.md`.

## Planned experiments (not yet run)
- [ ] Rotation-aware context (avenue A1): "shows since last played" feature
      or multi-show context window. Expect the largest single gain.
- [ ] Per-year perplexity curve from the temporal-split model (avenue A2).
- [ ] Hyperparameter sweep is deliberately deferred — at ~47k tokens the
      gains live in better features/context, not tuning.
      Trigger to revisit: after A1 lands.
