import sqlite3
import os
import json
import logging
import numpy as np
import shutil
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

def process_song_pipeline(song_title, artist="Grateful Dead", top_n=3, temp_dir="data/temp", output_dir="data/processed"):
    """Run the full pipeline for a single song."""
    os.makedirs(temp_dir, exist_ok=True)
    os.makedirs(output_dir, exist_ok=True)
    
    # Check if we already have this song processed
    output_filename = f"{song_title.replace(' ', '_').replace('/', '_')}_features.json"
    output_path = os.path.join(output_dir, output_filename)
    
    if os.path.exists(output_path):
        logging.info(f"Features already exist for '{song_title}', skipping.")
        return None

    # Step 1: Search
    results = search_youtube_live(song_title, artist, top_n)
    if not results:
        logging.warning(f"Could not find any YouTube videos for '{song_title}'")
        return None
        
    song_feature_vectors = []
    
    # Step 2: Download & Extract
    for idx, video in enumerate(results):
        logging.info(f"Processing version {idx+1}/{len(results)}: {video['title']}")
        
        temp_audio_path = os.path.join(temp_dir, f"{video['id']}.wav")
        downloaded_path = download_audio(video['link'], temp_audio_path, temp_dir)
        
        if downloaded_path:
            features = extract_mood_features(downloaded_path)
            if features:
                song_feature_vectors.append(features)
            
            # Clean up temp file immediately after extraction
            if os.path.exists(downloaded_path):
                os.remove(downloaded_path)
        else:
            logging.error(f"Failed to download/process video {video['id']}")
            
    # Step 3: Average and Save
    if song_feature_vectors:
        averaged_features = average_features(song_feature_vectors)
        
        # Add metadata
        final_data = {
            'song_title': song_title,
            'artist': artist,
            'num_versions_processed': len(song_feature_vectors),
            'features': averaged_features
        }
        
        with open(output_path, 'w') as f:
            json.dump(final_data, f, indent=4)
            
        logging.info(f"Successfully processed '{song_title}' and saved to {output_path}")
        return final_data
    else:
        logging.error(f"Failed to extract any features for '{song_title}'")
        return None

import argparse

def main():
    """Main entry point for the pipeline with resume logic and processing limits."""
    parser = argparse.ArgumentParser(description="Run the mood extraction pipeline for songs.")
    parser.add_argument("--limit", type=int, default=3, help="Maximum number of NEW songs to process in this run.")
    parser.add_argument("--artist", type=str, default="Grateful Dead", help="Artist name to search for.")
    args = parser.parse_args()

    songs = get_all_songs()
    logging.info(f"Found {len(songs)} songs in the database.")
    
    processed_count = 0
    
    for song in songs:
        if args.limit > 0 and processed_count >= args.limit:
            logging.info(f"Reached limit of {args.limit} new songs. Stopping.")
            break
            
        try:
            # process_song_pipeline returns None if song already exists
            result = process_song_pipeline(song, artist=args.artist)
            if result:
                processed_count += 1
                logging.info(f"Progress: {processed_count}/{args.limit} new songs processed.")
        except Exception as e:
            logging.error(f"Critical error processing '{song}': {e}")
            
    logging.info(f"Pipeline run complete. {processed_count} new songs added.")

if __name__ == "__main__":
    main()
