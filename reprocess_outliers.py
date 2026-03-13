import os
import json
import logging
from pipeline.coordinator import process_song_pipeline

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

def main():
    outlier_path = "data/processed/outliers_for_review.json"
    processed_dir = "data/processed"
    
    if not os.path.exists(outlier_path):
        print(f"File {outlier_path} does not exist.")
        return
        
    with open(outlier_path, 'r') as f:
        try:
            outliers = json.load(f)
        except json.JSONDecodeError:
            print(f"Error decoding {outlier_path}.")
            return
            
    if not outliers:
        print("No outliers to reprocess.")
        return
        
    song_titles = [o['song_title'] for o in outliers]
    print(f"Starting reprocessing for {len(song_titles)} songs.")
    
    # 1. Delete corresponding JSON files
    for song in song_titles:
        filename = f"{song.replace(' ', '_').replace('/', '_')}_features.json"
        filepath = os.path.join(processed_dir, filename)
        if os.path.exists(filepath):
            os.remove(filepath)
            logging.info(f"Deleted {filepath}")
            
    # 2. Clear outliers_for_review.json
    with open(outlier_path, 'w') as f:
        json.dump([], f)
    print(f"Cleared {outlier_path}")
    
    # 3. Reprocess each song
    success_count = 0
    for i, song in enumerate(song_titles):
        print(f"[{i+1}/{len(song_titles)}] Processing: {song}")
        try:
            # top_n=3 is specified by the user
            result = process_song_pipeline(song, top_n=3)
            if result and result != "SKIPPED":
                success_count += 1
                logging.info(f"Successfully reprocessed: {song}")
            else:
                logging.warning(f"Failed to reprocess: {song}")
        except Exception as e:
            logging.error(f"Error reprocessing '{song}': {e}")
            
    print(f"\nReprocessing complete!")
    print(f"Successfully reprocessed: {success_count}/{len(song_titles)}")

if __name__ == "__main__":
    main()
