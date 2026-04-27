# Implementation Plan: Era Transition Verification

## Phase 1: Metric Selection
- [ ] Define "Structural Change" metric (JS-Divergence on transition matrices).
- [ ] Define "Sonic Change" metric (Cosine similarity on era mood centroids).

## Phase 2: Analysis Pipeline
- [ ] Process `grateful_dead.db` into yearly transition slices.
- [ ] Compute all-pairs similarity between years (1965-1995).

## Phase 3: Visualization
- [ ] Create a Python-based heatmap (Seaborn/Matplotlib) of yearly similarity.
- [ ] Plot "Structural vs Sonic" change over time.

# Testing Checklist
- [ ] **Statistical Significance:** Run Monte Carlo simulations to establish a baseline for "random" stylistic drift.
- [ ] **Era Consistency:** Verify that 1972-1974 (Europe '72 / Wall of Sound) shows high internal similarity compared to 1968.
- [ ] **Transition Accuracy:** Ensure the "hiatus" years (1975) don't create artifacts in the timeline.
