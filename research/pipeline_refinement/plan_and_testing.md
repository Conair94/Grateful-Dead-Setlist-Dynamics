# Implementation Plan: Pipeline Refinement (Phase 2.5)

## Phase 1: Outlier Detection & "Best 2 of 3" Logic
- [ ] Create `pipeline/refiner.py`.
- [ ] Implement `detect_outliers(versions)`:
    - Compare BPM, Loudness, and Duration.
    - If one version's BPM is >20% different from the median, mark it as a "mismatch."
    - If 2 versions are similar but 1 is an outlier, discard the outlier and re-average.
    - If all 3 are different, flag for **Manual Review**.

## Phase 2: 5-Year Era Normalization
- [ ] Create 5-year buckets (1965-69, 1970-74, 1975-79, 1980-84, 1985-89, 1990-95).
- [ ] Calculate "Sonic Baselines" (Mean/StdDev) for each bucket using all processed songs.
- [ ] Implement `normalize_features(features, year_bucket)`:
    - Transform raw values into Z-scores (Standard Deviations from the era mean).

## Phase 3: Manual Review System
- [ ] Create `pipeline/generate_review_manifest.py`.
- [ ] Output `data/review_manifest.json` containing:
    - Song Title.
    - Reason for flagging (e.g., "High Variance", "Official Release Missing").
    - Current YouTube URLs for easy clicking/replacement.

## Phase 4: Official Release Filter
- [ ] Implement a keyword filter for "Official" titles (e.g., "Dick's Picks", "Download Series", "Official Video").
- [ ] Flag songs that lack at least one official version in their 3-version ensemble.

# Testing Checklist
- [ ] **Logic Test:** Pass 3 versions where one is a 30-second clip and two are 10-minute jams; verify the clip is discarded.
- [ ] **Normalization Test:** Compare a 1967 "Dark Star" and a 1990 "Dark Star" after normalization; their "Energy" scores should now be on a comparable relative scale.
- [ ] **Official Filter:** Verify that a YouTube title containing "Official Video" is correctly prioritized or flagged.
- [ ] **Stability:** Ensure `refiner.py` can process all 486 songs in under 30 seconds (it should be CPU-bound, not network-bound).
