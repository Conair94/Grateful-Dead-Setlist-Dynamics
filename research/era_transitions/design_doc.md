# Design Doc: Era Transition Verification

## 1. Requirements
*   **Goal:** Quantitatively prove that Grateful Dead "Eras" are distinct sonic and structural entities.
*   **Hypothesis:** Sonic shifts (BPM/Loudness) will lag or lead structural shifts (Transition Probabilities).
*   **Metrics:**
    *   **Structural:** KL-Divergence between transition matrices of Year X and Year Y.
    *   **Sonic:** Euclidean distance between the "Global Mood Vector" of Year X and Year Y.

## 2. Specifications
*   **Data Prep:** Aggregate all transitions and song features by year.
*   **Visualization:** A "Change Heatmap" where the X and Y axes are years, and the color intensity represents the delta in style.
*   **Era Markers:** Overlay historical keyboardist changes (Pigpen, Keith, Brent, Vince) to see if data-driven shifts align with personnel changes.

## 3. I/O
*   **Input:** `grateful_dead.db`.
*   **Output:** Statistical validation of era boundaries; P-values for "Era Distinctness."

## 4. Questions
*   **Question:** Should we include "Dead & Company" or "JRAD" data eventually to see if they successfully "mimic" specific era fingerprints?
