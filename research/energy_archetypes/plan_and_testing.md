# Implementation Plan: Energy Arc Archetype Research

## Phase 1: Data Assembly
- [ ] Script to join `grateful_dead.db` setlists with `average_features`.
- [ ] Normalize sequence lengths using interpolation or padding for DTW.

## Phase 2: Modeling
- [ ] Use `tslearn` or `scipy` for Dynamic Time Warping.
- [ ] K-Means clustering on the DTW distance matrix.
- [ ] Silhouette analysis to determine optimal $k$.

## Phase 3: Export
- [ ] Save archetypes to `data/archetypes.json`.
- [ ] Add `archetype_id` column to a temporary analysis SQLite table.

# Testing Checklist
- [ ] **Algorithm:** Compare results using Euclidean vs. DTW distance; DTW should yield more "musically intuitive" clusters.
- [ ] **Stability:** Run 10-fold cross-validation on clustering to ensure archetypes are robust.
- [ ] **Manual Review:** Expert review of "Top 10 Energy Shows" vs "Bottom 10" to verify cluster assignments.
