import os
import json
import sqlite3
import numpy as np
import logging
from collections import defaultdict

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

DATA_DIR = "data/processed"
REFINED_DIR = "data/refined"
DB_PATH = "data/raw/grateful_dead.db"
REVIEW_MANIFEST = "data/review_manifest.json"

os.makedirs(REFINED_DIR, exist_ok=True)

def get_song_years():
    """Map song titles to their earliest appearance year."""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("""
        SELECT s.title, MIN(sh.show_date) 
        FROM songs s 
        JOIN show_songs ss ON s.song_id = ss.song_id 
        JOIN shows sh ON ss.show_id = sh.show_id 
        GROUP BY s.title
    """)
    mapping = {row[0]: int(row[1][:4]) for row in cursor.fetchall()}
    conn.close()
    return mapping

def get_era_bucket(year):
    """Group years into 5-year buckets."""
    if year < 1970: return "1965-1969"
    if year < 1975: return "1970-1974"
    if year < 1980: return "1975-1979"
    if year < 1985: return "1980-1984"
    if year < 1990: return "1985-1989"
    return "1990-1995"

def refine_song_data(song_data):
    """Apply 'Best 2 of 3' logic to average features."""
    versions = song_data.get("raw_versions", [])
    if len(versions) < 2:
        return song_data, None

    # We focus on BPM and Loudness for outlier detection
    bpms = [v["features"].get("rhythm.bpm", 0) for v in versions]
    loudness = [v["features"].get("lowlevel.loudness_ebu128.integrated", 0) for v in versions]

    def get_best_indices(values, threshold_pct=0.2):
        if not values: return []
        median = np.median(values)
        # Identify which versions are within the threshold of the median
        valid_indices = [i for i, v in enumerate(values) if abs(v - median) <= (abs(median) * threshold_pct)]
        return valid_indices

    best_bpm_indices = get_best_indices(bpms)
    best_loudness_indices = get_best_indices(loudness, threshold_pct=0.3) # Louder variance allowed

    # Intersection of reliable indices
    final_indices = list(set(best_bpm_indices) & set(best_loudness_indices))

    if len(final_indices) < 2:
        # If we can't find 2 that agree, flag for review
        return song_data, "High Variance / No Consensus"

    # Re-average using only the best versions
    selected_versions = [versions[i]["features"] for i in final_indices]
    all_keys = set()
    for feat in selected_versions:
        all_keys.update(feat.keys())

    new_averages = {}
    for key in all_keys:
        vals = [f[key] for f in selected_versions if key in f and isinstance(f[key], (int, float))]
        if vals:
            new_averages[key] = float(np.mean(vals))

    song_data["average_features"] = new_averages
    song_data["refined_from_n_versions"] = len(final_indices)
    return song_data, None

def main():
    song_years = get_song_years()
    processed_files = [f for f in os.listdir(DATA_DIR) if f.endswith(".json") and f != "outliers_for_review.json"]
    
    all_refined_data = []
    review_needed = []
    era_stats = defaultdict(lambda: defaultdict(list))

    logging.info(f"Processing {len(processed_files)} songs for refinement...")

    # Step 1: Refine (Best 2 of 3) and Collect Era Stats
    for filename in processed_files:
        with open(os.path.join(DATA_DIR, filename), 'r') as f:
            data = json.load(f)
        
        title = data.get("song_title")
        year = song_years.get(title, 1970) # Default to 1970 if unknown
        era = get_era_bucket(year)
        data["era"] = era

        # Some files use "features" instead of "average_features"
        if "average_features" not in data and "features" in data:
            data["average_features"] = data["features"]

        # Only refine if raw_versions are present
        if "raw_versions" in data:
            refined_data, issue = refine_song_data(data)
            if issue:
                review_needed.append({
                    "song_title": title,
                    "reason": issue,
                    "versions": [v["title"] for v in data.get("raw_versions", [])]
                })
        else:
            refined_data = data
        
        # Collect features for baseline calculation (only from refined data)
        if "average_features" in refined_data:
            for key, val in refined_data["average_features"].items():
                if isinstance(val, (int, float)):
                    era_stats[era][key].append(val)
        
        all_refined_data.append(refined_data)

    # Step 2: Calculate Baselines (Era Normalization)
    baselines = {}
    for era, features in era_stats.items():
        baselines[era] = {
            key: {"mean": float(np.mean(vals)), "std": float(np.std(vals)) + 1e-6}
            for key, vals in features.items()
        }

    # Step 3: Apply Normalization (Z-Score)
    for data in all_refined_data:
        era = data["era"]
        norm_features = {}
        for key, val in data["average_features"].items():
            if key in baselines[era]:
                stat = baselines[era][key]
                z_score = (val - stat["mean"]) / stat["std"]
                norm_features[key] = z_score
        
        data["normalized_features"] = norm_features
        
        # Save refined file
        safe_title = data["song_title"].replace(" ", "_").replace("/", "-")
        with open(os.path.join(REFINED_DIR, f"{safe_title}_refined.json"), 'w') as f:
            json.dump(data, f, indent=4)

    # Step 4: Write Review Manifest
    with open(REVIEW_MANIFEST, 'w') as f:
        json.dump(review_needed, f, indent=4)

    logging.info(f"Refinement complete. {len(all_refined_data)} songs processed.")
    logging.info(f"{len(review_needed)} songs flagged for manual review in {REVIEW_MANIFEST}.")

if __name__ == "__main__":
    main()
