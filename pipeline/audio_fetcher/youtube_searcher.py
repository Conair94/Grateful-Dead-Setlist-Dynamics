import os
import json
import logging
import yt_dlp
import subprocess

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

def search_youtube_live(song_title, artist="Grateful Dead", top_n=3):
    """
    Search YouTube for 'song_title artist live' using yt-dlp.
    Strictly filters results to ensure both song_title and artist are in the video title.
    Only falls back to broader search if zero results match the strict criteria.
    """
    primary_query = f"ytsearch10:{song_title} {artist} live" # Search more so we can filter
    logging.info(f"Searching YouTube (Strict): {primary_query}")
    
    ydl_opts = {
        'quiet': True,
        'extract_flat': True,
        'force_generic_extractor': True,
    }
    
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(primary_query, download=False)
            
            if not info or 'entries' not in info or not info['entries']:
                logging.warning(f"No results for primary search.")
                return []

            # Filter for strict matches
            strict_matches = []
            song_lower = song_title.lower()
            artist_lower = artist.lower()
            
            for video in info['entries']:
                title_lower = video.get('title', '').lower()
                if song_lower in title_lower and artist_lower in title_lower:
                    strict_matches.append({
                        'id': video['id'],
                        'title': video['title'],
                        'link': f"https://www.youtube.com/watch?v={video['id']}",
                        'viewCount': video.get('view_count', 'Unknown')
                    })
                
                if len(strict_matches) >= top_n:
                    break

            if strict_matches:
                logging.info(f"Found {len(strict_matches)} strict matches for '{song_title}' by '{artist}'.")
                return strict_matches

            # If no strict matches, fall back to broader search (as a last resort)
            logging.warning(f"No strict title matches found. Falling back to broader search...")
            fallback_query = f"ytsearch{top_n}:{song_title} live"
            info = ydl.extract_info(fallback_query, download=False)

            if not info or 'entries' not in info or not info['entries']:
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

def trim_audio(input_path):
    """
    Use ffmpeg to trim leading silence and low-energy noise.
    Attempts to find the actual start of the music.
    """
    temp_trimmed = input_path.replace(".wav", "_trimmed.wav")
    try:
        # ffmpeg silenceremove:
        # start_periods=1: stop when sound is detected
        # start_threshold=-30dB: threshold for sound
        # start_silence=0.1: duration of sound to consider it 'started'
        cmd = [
            "ffmpeg", "-y", "-i", input_path,
            "-af", "silenceremove=start_periods=1:start_threshold=-35dB:start_silence=0.2",
            temp_trimmed
        ]
        subprocess.run(cmd, check=True, capture_output=True)
        
        if os.path.exists(temp_trimmed):
            os.replace(temp_trimmed, input_path)
            logging.info(f"  Successfully trimmed leading silence/noise from {os.path.basename(input_path)}")
            return True
    except Exception as e:
        logging.error(f"  Error trimming audio: {e}")
        if os.path.exists(temp_trimmed):
            os.remove(temp_trimmed)
    return False

def download_audio(video_url, output_path, temp_dir="data/temp"):
    """
    Download audio and apply trimming to focus on the song.
    """
    os.makedirs(temp_dir, exist_ok=True)
    
    ydl_opts = {
        'format': 'worstaudio/low',
        'postprocessors': [{
            'key': 'FFmpegExtractAudio',
            'preferredcodec': 'wav',
            'preferredquality': '96',
        }],
        'outtmpl': os.path.join(temp_dir, '%(id)s.%(ext)s'),
        'quiet': True,
        'no_warnings': True,
        'match_filter': yt_dlp.utils.match_filter_func("duration < 2400"),
    }
    
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(video_url, download=True)
            video_id = info['id']
            audio_path = os.path.join(temp_dir, f"{video_id}.wav")
            
            if os.path.exists(audio_path):
                # Apply Trimming
                trim_audio(audio_path)
                
                os.makedirs(os.path.dirname(output_path), exist_ok=True)
                os.rename(audio_path, output_path)
                return output_path
            else:
                logging.error(f"Audio file not found after download: {audio_path}")
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
