# Implementation Plan: Mood Arc Visualization

## Phase 1: Data Prep
- [ ] Create `pipeline/export_mood_manifest.py` to consolidate `data/processed/*.json` into one `docs/data/mood_data.json`.
- [ ] Implement min-max normalization in the export script to save frontend CPU.

## Phase 2: Frontend
- [ ] Add `<div id="mood-arc-container"></div>` to `docs/index.html`.
- [ ] Create `docs/mood_arc.js` using D3.js.
- [ ] Define `updateMoodArc(showId, setlist)` function.

## Phase 3: Integration
- [ ] Hook into the existing "Show Selection" logic in `app.js`.
- [ ] Add toggle buttons for different features (Energy, BPM, Danceability).

# Testing Checklist
- [ ] **Edge Case:** Show with only 1 song (ensure no crash on line rendering).
- [ ] **Edge Case:** Songs missing from `mood_data.json` (placeholder with 0.5/neutral value).
- [ ] **UX:** Hovering over the arc correctly updates the "Node Info" panel in the main app.
- [ ] **Performance:** Ensure no memory leaks when switching shows rapidly.
