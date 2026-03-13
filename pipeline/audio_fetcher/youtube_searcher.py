import os
import json
import logging
import yt_dlp

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

def search_youtube_live(song_title, artist="Grateful Dead", top_n=3):
    """
    Search YouTube for 'song_title artist live' using yt-dlp.
    If no results are found, fall back to 'song_title live'.
    """
    primary_query = f"ytsearch{top_n}:{song_title} {artist} live"
    logging.info(f"Searching YouTube (Primary): {primary_query}")
    
    ydl_opts = {
        'quiet': True,
        'extract_flat': True,
        'force_generic_extractor': True,
    }
    
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(primary_query, download=False)
            
            # If no entries or entries is empty, try fallback
            if not info or 'entries' not in info or not info['entries']:
                fallback_query = f"ytsearch{top_n}:{song_title} live"
                logging.warning(f"No results for primary query. Trying fallback: {fallback_query}")
                info = ydl.extract_info(fallback_query, download=False)

            if not info or 'entries' not in info or not info['entries']:
                logging.warning(f"No results found even for fallback query.")
                return []
            
            video_metadata = []
            for video in info['entries']:
                video_metadata.append({
                    'id': video['id'],
                    'title': video['title'],
                    'link': f"https://www.youtube.com/watch?v={video['id']}",
                    'viewCount': video.get('view_count', 'Unknown')
                })
                
            return video_metadata
    except Exception as e:
        logging.error(f"Error searching YouTube: {e}")
        return []

def download_audio(video_url, output_path, temp_dir="data/temp"):
    """
    Download audio from a YouTube video URL to the specified output path.
    """
    os.makedirs(temp_dir, exist_ok=True)
    
    ydl_opts = {
        'format': 'bestaudio/best',
        'postprocessors': [{
            'key': 'FFmpegExtractAudio',
            'preferredcodec': 'wav',
            'preferredquality': '192',
        }],
        'outtmpl': os.path.join(temp_dir, '%(id)s.%(ext)s'),
        'quiet': True,
        'no_warnings': True,
    }
    
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(video_url, download=True)
            video_id = info['id']
            # After post-processing, the file will be in data/temp/video_id.wav
            audio_path = os.path.join(temp_dir, f"{video_id}.wav")
            
            if os.path.exists(audio_path):
                # Ensure the destination directory exists
                os.makedirs(os.path.dirname(output_path), exist_ok=True)
                # Move to the desired output path
                os.rename(audio_path, output_path)
                return output_path
            else:
                logging.error(f"Audio file not found after download: {audio_path}")
                # Sometimes yt-dlp might name it slightly differently depending on the version
                return None
    except Exception as e:
        logging.error(f"Error downloading audio from {video_url}: {e}")
        return None

if __name__ == "__main__":
    # Test
    song = "Dark Star"
    artist = "Grateful Dead"
    results = search_youtube_live(song, artist)
    
    print(f"\nTop {len(results)} results for '{song} {artist} live':")
    for idx, res in enumerate(results):
        print(f"{idx+1}. {res['title']} (Views: {res['viewCount']}) - {res['link']}")
