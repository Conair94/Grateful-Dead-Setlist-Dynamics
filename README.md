# Grateful-Dead-Setlist-Dynamics

A study of Grateful Dead setlist composition: transition graphs, audio "mood fingerprints," and next-song forecasting models, with an interactive website for researchers and fans.
<img width="1268" height="962" alt="Screenshot 2025-12-09 at 23 09 46" src="https://github.com/user-attachments/assets/15207096-1666-48b4-8c88-b32c8b965247" />

## The website (`docs/`, GitHub Pages)

- **Transition Graph** (`index.html`) — interactive force graph of song transitions, filterable by era, with set-aware node partitioning, delta comparison between eras, and Markov-chain setlist generation.
- **Show Explorer** (`explorer.html`) — browse all 1,968 shows with known setlists (1965–1995); view each show's **mood arc** (energy / tempo / danceability / brightness / dynamics across the setlist), compare two shows, deep-link by date (`explorer.html#1977-05-08`), and download per-show CSVs.

## The data

- `data/raw/grateful_dead.db` — SQLite: 2,300 shows, 489 songs, 37,551 setlist rows (scraped from the GratefulStats API; not tracked in git).
- `data/processed/`, `data/refined/` — per-song Essentia audio features from live recordings, era-normalized (z-scores within 5-year buckets) to remove recording-quality bias. 486/489 songs covered.

## The models (`models/setlist_forecasting/`)

Next-song prediction in a standard forecasting framing: unigram → Markov bigram → small causal transformer with era conditioning and audio-feature-augmented embeddings. See `models/setlist_forecasting/README.md` and `RESULTS.md`.

## Research direction

Active research questions and the project roadmap live in `PROJECT_TRACKER.md`;
design docs and proposed avenues are under `research/` (start with
`research/RESEARCH_AVENUES.md`).
