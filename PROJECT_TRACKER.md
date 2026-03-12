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
- [ ] **Grateful Dead Analytics:** Further work on existing data to deepen baseline insights.
- [ ] **Website Expansion:** Redesign the current interface to allow for interactive data exploration and user engagement.

### Phase 2: Data Engineering (The Pipeline)
- [ ] **Audio Extraction Pipeline:**
    - [ ] Integrate YouTube search functionality to locate specific performances.
    - [ ] Implement a temporary file management module for processing.
- [ ] **Feature Engineering:** 
    - [ ] Build a mood processing pipeline using **Essentia** to extract high-level feature vectors from audio.

### Phase 3: Modeling & Generation
- [ ] **Comparison Framework:** Develop methods to compare fingerprints between bands/eras.
- [ ] **Setlist Generator:** Implement the generative model (Style XYZ for Band ABC).

### Phase 4: Synthesis
- [ ] **Final Synthesis:** Consolidate findings and package the project into a finished research artifact.

---

## 📁 Proposed Directory Structure

To support the upcoming data processing pipeline and ML workflows, we will transition towards this organization:

```text
/
├── data/                   # Data storage (ignored by git where appropriate)
│   ├── raw/                # Original datasets (like grateful_dead.db)
│   ├── processed/          # Cleaned data and feature vectors
│   └── temp/               # Temporary audio files for processing
├── pipeline/               # Data processing scripts
│   ├── audio_fetcher/      # YouTube search and download logic
│   └── mood_extractor/     # Essentia-based feature extraction
├── models/                 # ML models for fingerprinting and generation
├── notebooks/              # Exploratory Data Analysis (EDA) and research notes
├── docs/                   # Current website and documentation
│   └── interaction/        # New interactive web features
├── Legacy Files/           # Existing exploratory scripts and Gephi files
└── PROJECT_TRACKER.md      # This file
```

---

## 📈 Current Status
*   **Current Phase:** Phase 1 (Initial Setup & Logistics)
*   **Last Update:** 2026-03-12
*   **Active Focus:** Establishing project organization and tracking.
