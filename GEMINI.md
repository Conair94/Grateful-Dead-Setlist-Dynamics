# Workspace Mandates: Grateful Dead Setlist Dynamics

These instructions are foundational and take absolute precedence over general workflows.

## 📋 Session Protocol
- **Research Phase:** ALWAYS read `PROJECT_TRACKER.md` at the start of every session to synchronize on current goals, active phases, and the roadmap.
- **Execution Phase:** When performing architectural changes or significant data processing updates, ensure they align with the "Proposed Directory Structure" defined in the tracker.
- **Closure Phase:** ALWAYS update `PROJECT_TRACKER.md` before ending the session. Mark completed tasks, update the "Current Status", and log any new technical debt or "next steps" discovered during the work.

## 🛠 Technical Standards
- **Data Integrity:** The primary database is located at `data/raw/grateful_dead.db`. Never modify the schema without a corresponding update to the scraper and export scripts.
- **Pipeline Hygiene:** All temporary audio files must be stored in `data/temp/` and cleaned up after processing to avoid bloating the workspace.
- **Dependencies:** This project leverages **Essentia** for mood extraction. Verify library availability before attempting feature engineering tasks.

## 📂 Organizational Discipline
- Maintain the separation between `pipeline/` (extraction), `models/` (logic), and `notebooks/` (exploration).
- Keep `Legacy Files/` intact for historical reference but prioritize the new structure for all new development.
