# Grateful Dead Setlist Dynamics: Research Tracker

This document tracks the progress, goals, and organizational structure of the machine learning research project focused on jam band setlist dynamics.

## 🎯 Research Goals

### 1. Cultural & Aesthetic Analysis (SWPACA)
*   **Objective:** Gain a deeper understanding of the cultural and aesthetic impact of the setlist creation process as embodied by the Grateful Dead.
*   **Methodology:** Use modern analytical and machine learning techniques to explore anthropological and cultural themes.
*   **Target:** Publication in the Southwest Pop Culture Association (SWPACA) Grateful Dead conference.

### 2. Mood Signal & Setlist Fingerprinting (ISMIR)
*   **Objective:** Extract "mood signals" from song sequences to create a "setlist fingerprint" for bands and specific eras.
*   **Capabilities:**
    *   Quantitative comparison of "live music magic" across jam bands.
    *   Cross-band setlist generation (e.g., generating a Phish setlist in the style of late 70s Grateful Dead).
*   **Target:** Publication in the International Society for Music Information Retrieval (ISMIR) conference.

---

## 🛠 Project Roadmap

### Phase 1: Foundation & Analytics
*   **Grateful Dead Analytics:**
    *   Further work on existing data to deepen baseline insights.
*   **Cross-Band Data Acquisition:**
    *   Scrape setlist data for secondary bands (Phish, Phish.net API, etc.) to enable comparative analysis.
*   **Website Expansion:**
    *   [x] **Phase 1a:** Added interactive transition inspection (click predecessors/successors to see concert dates).
    - [ ] **Phase 1b:** Redesign current interface for broader interactive data exploration.

### Phase 2: Data Engineering (The Pipeline)
*   **Audio Extraction Pipeline:**
    *   [x] **Search Strategy:** Use YouTube to find "Song Name + Artist + Live".
    *   [x] **Fallback Logic:** If primary search fails, fall back to "Song Name + Live" to ensure at least 3 versions are found.
    *   [x] **Fetch Logic:** Implement a download module (using `yt-dlp`) for temporary audio extraction.
        *   **Optimization:** Configured to download low-bitrate audio for faster processing.
        *   **Safety:** Added 40-minute duration limit to avoid accidental compilation downloads.
    *   [x] **Popularity Filtering:** Fetch the 3 most popular/relevant videos per song.
*   **Feature Engineering:**
    *   [x] **Mood Extraction:** Use **Essentia** to extract mood feature vectors (Danceability, Energy, BPM, Valence/Mood, Loudness).
    *   [x] **Ensemble Averaging:** Average the feature vectors from the 3 performances to create a robust "Song Fingerprint."
    *   [x] **Data Quality (QA):** Implemented outlier detection (BPM, Danceability, Loudness variance) with a central review log (`outliers_for_review.json`).
    *   [x] **Storage:** Save averaged feature data and raw per-version vectors to `data/processed/` in JSON format.
    *   **Era-Normalization:**
        *   Develop methods to distinguish between "performance mood" and "recording quality/production style" across decades.

### Phase 3: Modeling & Generation
*   **Comparison Framework:**
    *   Develop methods to compare fingerprints between bands/eras.
*   **Setlist Mood Visualization:**
    *   [ ] **Design & Plan Complete:** (See `research/mood_arc_viz/`)
    *   [ ] **Implementation:** Create "Energy Curves" or "Mood Arcs" to visualize the emotional trajectory of a full concert.
*   **Generative Modeling:**
    *   [ ] **Energy Archetypes:** (See `research/energy_archetypes/`) Define structural shapes of shows.
    *   [ ] **Era Verification:** (See `research/era_transitions/`) Quantitatively verify historical era boundaries.
    *   [ ] **Setlist Generator:** Implement the generative model (Style XYZ for Band ABC).

### Phase 4: Synthesis & Publication
*   **Research Questions:**
    *   **Song Evolution:** Does the "fingerprint" of a specific song (e.g., "Dark Star") fundamentally change over different eras (1969 vs. 1974 vs. 1990)?
    *   **The "Magic" Variable:** Can we quantitatively isolate the "spark" of highly-rated shows vs. average ones?
*   **Validation:**
    *   Perform "Turing Tests" for setlists—have experts/community members rate generated vs. authentic setlists.
*   **Paper Drafting:**
    *   Prepare manuscripts for SWPACA and ISMIR based on synthesized findings.
*   **Final Synthesis:**
    *   Consolidate findings and package the project into a finished research artifact.

---

## 📁 Directory Structure (Updated)

```text
/
├── data/                   # Data storage
├── docs/                   # Frontend and visualization
├── models/                 # Clustering and generative models
├── pipeline/               # Data extraction and manifest generation
├── research/               # NEW: Design docs, plans, and research notes
├── Legacy Files/           # Historical reference
└── PROJECT_TRACKER.md      # This file
```

---

## 📈 Current Status
*   **Current Phase:** Phase 2 (Transitioning to Phase 3)
*   **Last Update:** 2026-04-26
*   **Active Focus:** Design and planning for Mood Arc Visualization and Energy Archetypes.
*   **Recent Changes:** 
    - Created comprehensive design and planning docs for Mood Arc Viz, Energy Archetypes, and Era Transitions.
    - Organized research planning into `/research/` directory.
    - Identified key features for visualization (BPM, Energy, Danceability).

