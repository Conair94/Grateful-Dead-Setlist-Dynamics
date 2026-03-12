import os
import time
import sqlite3
import requests
import logging

# Configure logging to print progress to the console
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

# API Configuration
BASE_URL = "https://api.gratefulstats.com/deadapi/v2/"

# to stay safely within the 50 calls per 5 minutes limit.
RATE_LIMIT_DELAY = 7

def get_headers():
    api_key = os.environ.get("GRATEFUL_STATS_API_KEY")
    api_user_id = os.environ.get("GRATEFUL_STATS_API_USER_ID")
    
    if not api_key or not api_user_id:
        raise ValueError("Missing API credentials. Please set GRATEFUL_STATS_API_KEY and GRATEFUL_STATS_API_USER_ID environment variables.")
        
    return {
        "apiKey": api_key,
        "apiUserId": api_user_id
    }

def validate_keys():
    """Validates the API keys before starting the scrape using the validation endpoint."""
    url = BASE_URL + "keytest/validatekey"
    logging.info("Validating API keys...")
    try:
        response = requests.get(url, headers=get_headers())
        # Always sleep to respect rate limit for the subsequent call
        time.sleep(RATE_LIMIT_DELAY)
        
        response_text = response.text.lower()
        if response.status_code == 200 and ("key works" in response_text or "key valid" in response_text):
            logging.info("API Key validation successful!")
            return True
        else:
            logging.error(f"API Key validation failed. Status: {response.status_code}")
            logging.error(f"Server response: {response.text}")
            return False
    except Exception as e:
        logging.error(f"Validation request failed: {e}")
        return False

def fetch_data(endpoint, max_retries=3):
    """Fetches data from the API with rate limiting and retry logic."""
    url = BASE_URL + endpoint
    
    for attempt in range(max_retries):
        logging.info(f"Fetching {url} (Attempt {attempt + 1}/{max_retries})...")
        try:
            response = requests.get(url, headers=get_headers())
            
            # Always sleep after a request to maintain the rate limit
            time.sleep(RATE_LIMIT_DELAY)
            
            if response.status_code == 200:
                try:
                    return response.json()
                except ValueError:
                    logging.error(f"Server returned non-JSON response for {url}: {response.text}")
                    return None
            
            logging.error(f"Error {response.status_code} for {url}")
            logging.error(f"Server response: {response.text}")
            
            # Retry logic for server errors (5xx) or Rate Limiting (429)
            if 500 <= response.status_code < 600 or response.status_code == 429:
                wait_time = (attempt + 1) * 10
                if response.status_code == 429:
                    wait_time = 60 # Wait a full minute if rate limited
                
                if attempt < max_retries - 1:
                    logging.info(f"Retrying in {wait_time}s...")
                    time.sleep(wait_time)
                    continue
            
            # For 4xx errors (except 429), we don't retry
            return None
            
        except requests.exceptions.RequestException as e:
            logging.error(f"Request failed: {e}")
            time.sleep(RATE_LIMIT_DELAY)
            if attempt < max_retries - 1:
                continue
            return None
            
    return None

def setup_database(db_path='../data/raw/grateful_dead.db'):
    """Sets up the SQLite database schema for concerts, songs, and venues."""
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    # Table for all the concerts (shows) and their locations
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS shows (
        show_id TEXT PRIMARY KEY,
        show_date TEXT,
        venue_id TEXT,
        venue_name TEXT,
        city TEXT,
        state TEXT,
        country TEXT
    )
    ''')
    
    # Table for all unique songs
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS songs (
        song_id TEXT PRIMARY KEY,
        title TEXT
    )
    ''')
    
    # Table for the setlists (song order per show)
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS show_songs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        show_id TEXT,
        set_id TEXT,
        set_sequence INTEGER,
        song_sequence INTEGER,
        song_id TEXT,
        title TEXT,
        segue BOOLEAN,
        FOREIGN KEY(show_id) REFERENCES shows(show_id),
        FOREIGN KEY(song_id) REFERENCES songs(song_id)
    )
    ''')
    
    # Index for faster querying
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_show_id ON show_songs(show_id)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_song_id ON show_songs(song_id)')
    
    conn.commit()
    return conn

def scrape_shows_for_year(year, conn):
    """Fetches all shows for a given year and saves them."""
    data = fetch_data(f"years/getyeardata/{year}")
    if not data or "ShowsOneYear" not in data:
        return []
    
    shows = data["ShowsOneYear"]
    cursor = conn.cursor()
    for show in shows:
        cursor.execute('''
        INSERT OR IGNORE INTO shows (show_id, show_date, venue_id, venue_name, city, state, country)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ''', (
            show.get("showId"), show.get("showDate"), show.get("venueId"), 
            show.get("venue"), show.get("city"), show.get("state"), show.get("country")
        ))
    conn.commit()
    return shows

def scrape_show_details(show_id, conn):
    """Fetches the setlist details for a specific show."""
    data = fetch_data(f"shows/getshowdatabyshowid/{show_id}")
    if not data or len(data) == 0:
        return
    
    # The endpoint returns a list with one item for the show detail
    show_detail = data[0]
    sets = show_detail.get("sets", [])
    
    cursor = conn.cursor()
    for s in sets:
        set_id = s.get("setId")
        set_sequence = s.get("sequence")
        songs = s.get("songs", [])
        
        for song in songs:
            song_id = song.get("songId")
            title = song.get("title")
            
            # Insert song into songs table
            if song_id:
                cursor.execute('''
                INSERT OR IGNORE INTO songs (song_id, title) VALUES (?, ?)
                ''', (song_id, title))
            
            # Insert into show_songs table to preserve order
            cursor.execute('''
            INSERT INTO show_songs (show_id, set_id, set_sequence, song_sequence, song_id, title, segue)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ''', (
                show_id, set_id, set_sequence, song.get("songSequence"), 
                song_id, title, song.get("segue")
            ))
    conn.commit()

def main():
    db_path = '../data/raw/grateful_dead.db'
    conn = setup_database(db_path)
    logging.info(f"Database initialized at {db_path}")
    
    # Check if we have credentials and validate them
    try:
        if not validate_keys():
            logging.error("Stopping script due to invalid API keys or connection error.")
            return
    except ValueError as e:
        logging.error(e)
        return

    # Valid values for year are 1965 - 1995 per the API documentation
    start_year = 1965
    end_year = 1995
    
    for year in range(start_year, end_year + 1):
        logging.info(f"=== Scraping year {year} ===")
        shows = scrape_shows_for_year(year, conn)
        
        for show in shows:
            show_id = show.get("showId")
            if not show_id:
                continue
            
            # Resume capability: Check if we already have details for this show
            cursor = conn.cursor()
            cursor.execute("SELECT COUNT(*) FROM show_songs WHERE show_id = ?", (show_id,))
            if cursor.fetchone()[0] > 0:
                logging.info(f"Already have setlist for show {show_id}. Skipping.")
                continue
                
            scrape_show_details(show_id, conn)
            
    logging.info("Scraping complete!")

if __name__ == "__main__":
    main()
