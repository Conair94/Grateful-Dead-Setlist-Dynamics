# Research Avenues (proposed 2026-06-12)

Ranked suggestions following the full code/data audit and the first
next-song-prediction results. Each entry has a concrete first step and the
finding it would unlock.

---

## A. Modeling avenues

### A1. Rotation-aware prediction (cross-show context) — *highest expected gain*
The transformer sees one show at a time, so it cannot learn the band's
**rotation logic**: songs rest for N shows and then return; a song played
last night is very unlikely tonight. This is the largest known signal the
current model ignores.
- **First step:** add a per-song "shows since last played" feature at
  prediction time (bucketed embedding), or prepend the previous show's
  setlist to the context window.
- **Unlocks:** a much stronger forecaster; also makes "tour position"
  effects measurable (night 1 vs night 3 of a run).

### A2. Predictability as a historiographic measure (entropy over time)
Score every show with the trained model and plot **per-year perplexity**.
This turns "the band got more predictable in the late 80s" (a common fan
claim) into a measurable curve, and links to the Shannon-entropy idea in
the README.
- **First step:** `eval_transformer` per year on a model trained with
  temporal split; one figure, publishable in the SWPACA paper.
- **Caveat to handle:** control for repertoire size per era.

### A3. Show "exceptionality" via model surprise (the "magic" variable)
A show's mean negative log-likelihood under the forecaster is an
**anomaly score**: high-surprise shows are structurally unusual ones.
Correlate with community ratings (archive.org stars, headyversion votes)
to test whether *legendary = surprising*.
- **First step:** rank all 1,968 shows by model surprise; eyeball the top
  20 against known legendary/odd shows (acoustic sets, Dylan tour, etc.).

### A4. Song2Vec vs. sound: two similarity spaces
Train skip-gram embeddings on setlist context (song2vec), then compare the
embedding-space geometry with the Essentia audio-feature space
(representational similarity analysis). **Question:** do the Dead sequence
songs by sonic similarity or by something else (key, lyric theme, ritual)?
- **First step:** `gensim` Word2Vec on the show token sequences (10 lines);
  Spearman correlation between pairwise cosine matrices.

### A5. Era-boundary changepoint detection (formalizes `era_transitions/`)
Sliding-window transition matrices + Jensen-Shannon divergence between
adjacent windows; Bayesian changepoint detection (e.g. `ruptures`) on the
divergence series. Overlay keyboardist eras as ground truth.
- **First step:** 12-month windows stepped monthly over the edge list
  already exported in `docs/data/graph_data.json`.

### A6. Song survival analysis
Kaplan–Meier curves for song "lifespans" (debut → retirement), hazard
modeling of what predicts retirement (singer, tempo, era of debut).
Mature stats methodology (`lifelines`), very fresh in this domain.

---

## B. Data avenues

### B1. Per-performance audio from archive.org — *fixes the biggest data limitation*
Current features are **per-song catalog averages from arbitrary YouTube
versions** — every "Dark Star" has identical features in every show's
mood arc. Archive.org hosts dated soundboards for most shows with a clean
API (`archive.org/metadata/gd1977-05-08...`). Fetching per-performance
audio gives:
- show-specific mood arcs (the explorer page becomes per-night real),
- the "Dark Star 1969 vs 1974 vs 1990" song-evolution study (tracker
  Phase 4 question),
- per-era song fingerprints for the ISMIR paper.
- **First step:** extend `pipeline/audio_fetcher` with an archive.org
  searcher keyed on show date + song position; pilot on ~20 well-known
  shows. Mind the rate limits and the taper-section terms of use.

### B2. True mood features (valence/arousal) — *closes a naming gap*
**Audit finding:** despite the module name, no actual mood features exist —
the Essentia `MusicExtractor` output contains no `mood_*`/valence/arousal
keys (those require `essentia-tensorflow` classifier models). The "mood
signal fingerprint" is currently energy/tempo/brightness only.
- **First step:** run `essentia-tensorflow`'s `mood_happy`, `mood_sad`,
  `mood_aggressive`, and DEAM-trained valence/arousal regressors over the
  already-downloaded refined catalog; add to `data/refined/` and the
  explorer's feature toggles. Alternative: CLAP or MERT embeddings.

### B3. Cross-band corpus (Phish first)
Already in the tracker; the forecasting framework makes it concrete:
train on GD, fine-tune (or zero-shot) on Phish — **does jam-band
sequencing logic transfer?** Phish.net has a documented API.
- **First step:** scraper for Phish.net `setlists/` endpoint into the same
  SQLite schema (it was designed band-agnostically).

### B4. Setlist completeness audit
332 of 2,300 shows (14%, mostly 1965–69) have no setlist rows, and they
silently disappear from exports. Cross-check against Jerrybase / Deadlists
to either fill them or formally exclude them with a documented cutoff.

---

## C. Publication-shaped packages

- **SWPACA (cultural):** A2 (predictability curve) + A3 (the "magic"
  variable) + the Show Explorer as the public-facing artifact.
- **ISMIR (MIR):** A1 (rotation-aware transformer) + B1 (per-performance
  features) + B2 (real mood) as a "setlist fingerprinting" system paper,
  with the Turing-test validation from the tracker as the evaluation.

## Suggested order
B2 (cheap, fixes honesty of "mood" claims) → A1 (biggest model gain) →
A2+A3 (papers fall out of the trained model) → B1 (unlocks the song-evolution
study) → B3 (cross-band).
