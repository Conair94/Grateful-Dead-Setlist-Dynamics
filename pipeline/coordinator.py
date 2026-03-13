import sqlite3
import os
import json
import logging
import numpy as np
import shutil
import argparse
from pipeline.audio_fetcher.youtube_searcher import search_youtube_live, download_audio
from pipeline.mood_extractor.essentia_processor import extract_mood_features

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

def get_all_songs(db_path="data/raw/grateful_dead.db"):
    """Fetch all unique song titles from the database."""
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    cursor.execute("SELECT title FROM songs")
    songs = [row[0] for row in cursor.fetchall()]
    conn.close()
    return songs

def average_features(feature_list):
    """Average a list of feature dictionaries."""
    if not feature_list:
        return {}
        
    all_keys = set()
    for feat in feature_list:
        all_keys.update(feat.keys())
        
    averaged = {}
    for key in all_keys:
        vals = [feat[key] for feat in feature_list if key in feat and isinstance(feat[key], (int, float))]
        if vals:
            averaged[key] = np.mean(vals)
            
    return averaged

import time
from datetime import timedelta
import concurrent.futures
from tqdm import tqdm

class TqdmLoggingHandler(logging.Handler):
    def emit(self, record):
        try:
            msg = self.format(record)
            tqdm.write(msg)
            self.flush()
        except (KeyboardInterrupt, SystemExit):
            raise
        except:
            self.handleError(record)

def get_output_filename(song_title):
    """Generate the standardized output filename for a song."""
    return f"{song_title.replace(' ', '_').replace('/', '_')}_features.json"

def process_single_version(video, song_title, temp_dir):
    """Worker function to process a single YouTube version."""
    temp_audio_path = os.path.join(temp_dir, f"{video['id']}.wav")
    
    # Download at lower quality for faster turnaround
    downloaded_path = download_audio(video['link'], temp_audio_path, temp_dir)
    
    if downloaded_path:
        # Essentia features extraction
        features = extract_mood_features(downloaded_path)
        
        # Clean up temp file immediately
        if os.path.exists(downloaded_path):
            try:
                os.remove(downloaded_path)
            except:
                pass
            
        if features:
            return {
                'id': video['id'],
                'title': video['title'],
                'views': video['viewCount'],
                'features': features
            }
    
    return None

def log_outlier(song_title, reasons, version_metadata, output_dir="data/processed"):
    """Log flagged songs to a central review file."""
    log_path = os.path.join(output_dir, "outliers_for_review.json")
    
    # Extract titles for easier review
    version_titles = [v.get('title', 'Unknown Title') for v in version_metadata]
    
    entry = {
        "song_title": song_title,
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
        "reasons": reasons,
        "version_titles": version_titles
    }
    
    data = []
    if os.path.exists(log_path):
        try:
            with open(log_path, 'r') as f:
                data = json.load(f)
        except:
            data = []
            
    data.append(entry)
    with open(log_path, 'w') as f:
        json.dump(data, f, indent=4)

def check_for_outliers(version_metadata):
    """
    Check if the 3 versions are wildly different across key 'Spotify-like' features.
    Returns a list of reasons if outliers are found, else None.
    """
    if len(version_metadata) < 2:
        return None
        
    outlier_reasons = []
    # Thresholds: Increased to account for Grateful Dead's stylistic evolution over 30 years.
    # BPM spread > 60, Danceability spread > 0.4
    keys_to_check = [
        ('rhythm.bpm', 60, "BPM Variance"),
        ('rhythm.danceability', 0.4, "Danceability Variance")
    ]
    
    for key, threshold, label in keys_to_check:
        vals = [v['features'].get(key) for v in version_metadata if key in v['features']]
        if len(vals) >= 2:
            spread = max(vals) - min(vals)
            if spread > threshold:
                outlier_reasons.append(f"{label}: {spread:.2f} (limit {threshold})")
                
    return outlier_reasons if outlier_reasons else None

def process_song_pipeline(song_title, artist="Grateful Dead", top_n=3, temp_dir="data/temp", output_dir="data/processed"):
    """Run the full pipeline for a single song using parallel threads."""
    os.makedirs(temp_dir, exist_ok=True)
    os.makedirs(output_dir, exist_ok=True)
    
    output_filename = get_output_filename(song_title)
    output_path = os.path.join(output_dir, output_filename)
    
    if os.path.exists(output_path):
        return "SKIPPED"

    # Step 1: Search
    results = search_youtube_live(song_title, artist, top_n)
    if not results:
        return None
        
    version_metadata = []
    
    # Step 2: Download & Extract (Parallelized)
    with concurrent.futures.ThreadPoolExecutor(max_workers=top_n) as executor:
        future_to_video = {executor.submit(process_single_version, v, song_title, temp_dir): v for v in results}
        
        for future in concurrent.futures.as_completed(future_to_video):
            try:
                result = future.result()
                if result:
                    version_metadata.append(result)
            except Exception as e:
                logging.error(f"  Version processing error: {e}")
            
    # Step 3: Average and Save
    if version_metadata:
        song_feature_vectors = [v['features'] for v in version_metadata]
        averaged_features = average_features(song_feature_vectors)
        
        # Step 4: QA Check for Outliers
        outlier_reasons = check_for_outliers(version_metadata)
        
        final_data = {
            'song_title': song_title,
            'artist': artist,
            'num_versions_processed': len(version_metadata),
            'average_features': averaged_features,
            'outlier_flag': outlier_reasons is not None,
            'outlier_reasons': outlier_reasons,
            'raw_versions': version_metadata
        }
        
        if outlier_reasons:
            log_outlier(song_title, outlier_reasons, version_metadata, output_dir)
        
        with open(output_path, 'w') as f:
            json.dump(final_data, f, indent=4)
            
        return final_data
    else:
        return None

def main():
    """Main entry point with clean TUI via tqdm."""
    parser = argparse.ArgumentParser(description="Run the mood extraction pipeline.")
    parser.add_argument("--limit", type=int, default=3, help="Max NEW songs to process.")
    parser.add_argument("--artist", type=str, default="Grateful Dead", help="Artist to search.")
    parser.add_argument("--verbose", action="store_true", help="Show all logs.")
    args = parser.parse_args()

    # Setup Tqdm Logging
    log_level = logging.INFO
    root_logger = logging.getLogger()
    for h in root_logger.handlers[:]:
        root_logger.removeHandler(h)
    
    tqdm_handler = TqdmLoggingHandler()
    tqdm_handler.setFormatter(logging.Formatter('%(asctime)s - %(levelname)s - %(message)s'))
    root_logger.addHandler(tqdm_handler)
    root_logger.setLevel(log_level)

    songs = list(dict.fromkeys(get_all_songs())) # Unique titles
    total_songs = len(songs)
    
    output_dir = "data/processed"
    os.makedirs(output_dir, exist_ok=True)
    already_processed_files = {f for f in os.listdir(output_dir) if f.endswith('_features.json')}
    already_processed_count = len(already_processed_files)
    
    # Filter songs to only those not yet processed using the same logic as the pipeline
    songs_to_process = [s for s in songs if get_output_filename(s) not in already_processed_files]
    
    print(f"\n🚀 Mood Extraction Pipeline (Optimized)")
    print(f"📊 Total Catalog: {total_songs} | ✅ Done: {already_processed_count} | ⏳ Remaining: {len(songs_to_process)}")
    
    if args.limit > 0:
        songs_to_process = songs_to_process[:args.limit]
        print(f"🎯 Target for this run: {len(songs_to_process)} songs\n")
    else:
        print(f"🎯 Target for this run: ALL {len(songs_to_process)} remaining songs\n")

    processed_count = 0
    start_time_run = time.time()
    
    # Use a single robust progress bar
    with tqdm(total=len(songs_to_process), desc="Catalog Progress", unit="song", dynamic_ncols=True) as pbar:
        for song in songs_to_process:
            pbar.set_description(f"Working: {song[:25]}...")
            song_start_time = time.time()
            try:
                result = process_song_pipeline(song, artist=args.artist)
                
                if result and result != "SKIPPED":
                    processed_count += 1
                    song_duration = time.time() - song_start_time
                    
                    # Update overall progress
                    elapsed_run = time.time() - start_time_run
                    avg_per_song = elapsed_run / processed_count
                    pbar.set_postfix({"last_song": f"{song_duration:.1f}s", "avg": f"{avg_per_song:.1f}s"})
                
                pbar.update(1)
                    
            except Exception as e:
                logging.error(f"Error processing '{song}': {e}")
                pbar.update(1)
            
            # Short pause to prevent display flooding
            time.sleep(0.1)
            
    total_duration = str(timedelta(seconds=int(time.time() - start_time_run)))
    print(f"\n✅ Pipeline run complete!")
    print(f"📦 New songs added: {processed_count}")
    print(f"⏱ Total time: {total_duration}\n")

if __name__ == "__main__":
    main()
