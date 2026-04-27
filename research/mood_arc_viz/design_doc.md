# Design Doc: Mood Arc Visualization

## 1. Requirements
*   **Goal:** Provide an interactive "Energy Curve" for any selected Grateful Dead concert.
*   **Target Dimensions:**
    *   **Primary:** Energy (proxy: `lowlevel.loudness_ebu128.integrated`) and BPM.
    *   **Secondary:** Danceability, Valence (Mood), and Brightness (`spectral_centroid`).
*   **UI/UX:**
    *   A line chart (D3.js) showing feature values on the Y-axis and setlist sequence on the X-axis.
    *   Syncing: Clicking a point on the arc highlights the corresponding node in the main graph.
    *   Normalization: All features must be normalized to a 0.0 - 1.0 scale for easy overlay.

## 2. Specifications
*   **Frontend Component:** `docs/mood_arc.js` (new module).
*   **Data Source:** `data/processed/*.json` for song features; `data/graph_data.json` for setlist sequences.
*   **Visual Style:** Glowing neon lines matching the existing "Dark Mode" aesthetic.
*   **I/O:**
    *   **Input:** `show_id` -> Look up setlist -> Fetch `average_features` for each song.
    *   **Output:** Interactive SVG line chart with tooltip support.

## 3. Questions / Assumptions
*   **Assumption:** We will use the `average_features` from the JSON files.
*   **Question:** Should the X-axis represent "Song Index" (1, 2, 3...) or "Estimated Time" (using song duration if available)?
*   **Question:** Do we need an "Average Era Arc" overlay for comparison?
