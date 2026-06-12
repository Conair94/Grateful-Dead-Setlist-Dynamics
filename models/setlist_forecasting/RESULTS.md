# Setlist Forecasting — Results

Run 2026-06-12, seed 42, 200 max epochs with early stopping (patience 8).
Transformer: 3 layers, d_model=128, 4 heads, dropout 0.3, ~530k params.
Scored on held-out shows under teacher forcing; "song" scope = positions where
the true next token is an actual song (the hard part — ~1 of 489), "all" scope
includes structural/era tokens. Lower perplexity is better.

## Random split (80/10/10 shows shuffled across eras)

Measures how well the band's overall distribution is modeled.

| model | scope | top-1 | top-5 | perplexity |
|---|---|---|---|---|
| unigram | song | 0.000 | 0.044 | 191.9 |
| markov bigram | song | 0.187 | 0.438 | 45.7 |
| **transformer** | **song** | **0.267** | **0.579** | **19.5** |
| unigram | all | 0.000 | 0.161 | 149.7 |
| markov bigram | all | 0.251 | 0.494 | 34.4 |
| **transformer** | **all** | **0.340** | **0.624** | **14.5** |

The transformer roughly **halves the Markov model's perplexity** (45.7 → 19.5 on
songs) and lifts top-5 from 0.44 → 0.58. That gap is the value of long-range
context: the model uses the whole show so far (no-repeats, set position, era
style, segue suites), not just the previous song. The Markov bigram is exactly
the model behind the website's "generative walk", so this is a concrete
upgrade path for that feature.

## Feature ablation (random split, audio embeddings on vs off)

| variant | song top-5 | song ppl |
|---|---|---|
| with audio features | 0.579 | 19.5 |
| **without** audio features | 0.586 | 19.6 |

**Negative result, worth knowing:** the 51 Essentia audio features add no
measurable predictive power once song identity is in the model. The learned
token embeddings already capture whatever sequencing-relevant structure the
audio would supply, and a song's identity is a strictly richer signal than its
catalog-average timbre. **Implication for the "mood fingerprint" thesis:** the
fingerprint is real and worth *visualizing* (the Show Explorer), but it is not
what *drives next-song choice* — sequencing is governed by repertoire/role
logic, not by matching the previous song's loudness or tempo. This also makes
sense given the data limitation that features are per-song averages, not
per-performance (see `research/RESEARCH_AVENUES.md` B1); per-performance audio
might tell a different story.

## Temporal split (train ≤ 1990-06, test 1993–1995)

True forecasting: train on the past, predict the future. The held-out tail is
the Vince Welnick era — a different keyboardist and repertoire than most of
training, so this is close to a worst case.

| model | scope | top-1 | top-5 | perplexity |
|---|---|---|---|---|
| markov bigram | song | 0.117 | 0.306 | 159.1 |
| transformer | song | 0.177 | 0.426 | 106.7 |
| transformer | all | 0.264 | 0.492 | 63.2 |

Every model degrades sharply versus the random split (transformer song
perplexity 19.5 → 106.7). **This gap is a direct measure of the band's
non-stationarity** — how much setlist logic in 1993–95 cannot be predicted from
pre-1990 shows. The transformer still beats Markov by a wide margin, i.e. it
generalizes the *grammar* of a show (structure, no-repeats, openers/closers)
even when the specific song vocabulary has drifted.

## Era-conditioned generation (qualitative)

Sampling with `<ERA_1975-1979>`, temperature 0.9, within-show repeat masking
(random-split model):

```
Jack Straw → They Love Each Other → Looks Like Rain → Dire Wolf →
Passenger → Althea → It's All Over Now → Brown Eyed Women →
The Music Never Stopped
-- Set Break --
Drums → The Other One → Dark Star → Ship Of Fools → Sugar Magnolia
-- Encore --
U.S. Blues
```

Reads as a plausible mid-70s show: a Weir rocker opener, a Garcia ballad mid-set-1,
a Music Never Stopped set-1 closer, the Drums→Other One→Dark Star set-2 jam
sequence, and a single U.S. Blues encore — all conventions the model learned
purely from token order, never told explicitly.

## Reproduce

```bash
python3 -m models.setlist_forecasting.train --epochs 200                  # random split
python3 -m models.setlist_forecasting.train --epochs 200 --no-features    # ablation
python3 -m models.setlist_forecasting.train --epochs 200 --split temporal # forecasting
```
