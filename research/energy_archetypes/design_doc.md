# Design Doc: Energy Arc Archetype Research

## 1. Requirements
*   **Goal:** Identify repeating structural "shapes" in Grateful Dead shows (e.g., "The Slow Burn," "The Double Peak").
*   **Methodology:** 
    *   Apply Dynamic Time Warping (DTW) to handle varying setlist lengths.
    *   Use K-Means or Hierarchical Clustering on the resulting distance matrix.
*   **Success Metric:** High silhouette scores and qualitative alignment with known "legendary" show structures.

## 2. Specifications
*   **Tooling:** Python (Scikit-learn, Scipy, DTAIDistance).
*   **Feature Set:** Use a composite "Vibe Vector" (Loudness + BPM + Danceability).
*   **Output:** A new dataset `data/show_archetypes.json` mapping every `show_id` to a cluster ID.

## 3. I/O
*   **Input:** Full setlist database + Song Fingerprints.
*   **Output:** Cluster centroids (the "archetype shapes") and show assignments.

## 4. Questions
*   **Question:** Should we separate Set 1 and Set 2 into different analysis pipelines, as their "ritual" structures differ significantly?
*   **Question:** How many archetypes do we hypothesize exist? (Start with 5?)
