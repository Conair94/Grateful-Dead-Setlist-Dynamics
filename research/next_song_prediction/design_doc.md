# Design Doc: Next-Song Prediction (Setlist Forecasting)

## 1. Requirements
*   **Goal:** Predict the next song in a setlist given the songs already played,
    using a standard autoregressive forecasting framing. This operationalizes the
    "mood signal fingerprint": if a model can predict what comes next, it has
    internalized the band's sequencing logic.
*   **Research Questions:**
    *   How much does *long-range context* (whole show) improve over the Markov
        assumption (previous song only)? The gap quantifies how much setlist
        structure lives beyond pairwise transitions.
    *   Do *audio features* (the mood fingerprint) carry predictive signal beyond
        song identity? Tested via the feature-embedding ablation.
    *   How *non-stationary* is the band? Measured by the random-split vs
        temporal-split performance gap.

## 2. Specifications
*   **Code:** `models/setlist_forecasting/` (dataset builder, baselines,
    transformer, shared evaluation).
*   **Tokenization:** era token + structural tokens (`<START>`, `<SET_BREAK>`,
    `<ENCORE_BREAK>`, `<END>`) + 489 song titles. One show = one sequence
    (~24 tokens, ~47k total).
*   **Models:** unigram → bigram Markov (website parity) → decoder-only
    transformer (3 layers, d=128, dropout 0.3, weight tying, optional
    feature-augmented embeddings from `data/refined/`).
*   **Metrics:** top-1/top-5 next-token accuracy + perplexity, song-only and
    all-token scopes, identical scoring positions across models.

## 3. Status / Findings (2026-06-12)
*   Implemented and trained. Transformer beats Markov by a wide margin
    (song perplexity 45.7 → 19.5; see `models/setlist_forecasting/RESULTS.md`),
    confirming substantial long-range structure beyond bigram transitions.
*   **Audio features add no predictive power** (ablation: song top-5 0.579 with
    vs 0.586 without). Sequencing is driven by repertoire/role logic, not by
    sonic matching to the previous song — the mood fingerprint is worth
    visualizing but is not the next-song mechanism. Caveat: features are
    per-song averages, not per-performance.
*   **Strong non-stationarity:** temporal-split (train ≤1990, test 1993–95)
    perplexity jumps to 106.7, quantifying how much late-era logic is
    unpredictable from earlier shows.
*   Era-conditioned sampling produces qualitatively idiomatic setlists
    (correct opener/closer conventions, cowboy-song clustering, Drums
    placement in set 2, single-song encores).

## 4. Open Questions
*   **Repeat-gap structure:** the model sees one show at a time, so it cannot
    learn the band's *rotation* logic (songs rest N shows before returning).
    Feeding the previous show(s) or a "days since last played" feature per
    song is the obvious next step — likely a large gain.
*   **Turing-test validation:** present generated vs. real setlists to
    community experts (ties into Phase 4 of the tracker).
*   **Cross-band transfer:** train on GD, fine-tune on Phish — does the
    sequencing logic transfer? (Requires Phish.net scrape.)
