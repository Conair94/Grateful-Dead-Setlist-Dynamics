import sqlite3
import pandas as pd

def load_data():
    # Connect to the local SQLite database
    conn = sqlite3.connect('grateful_dead.db')
    
    # Query to join the shows and the setlists into a single useful DataFrame
    query = '''
        SELECT s.show_date, s.venue_name, s.city, s.state,
               ss.set_sequence, ss.song_sequence, ss.title, ss.segue
        FROM shows s
        JOIN show_songs ss ON s.show_id = ss.show_id
        ORDER BY s.show_date, ss.set_sequence, ss.song_sequence
    '''
    
    print("Loading data from local database...")
    df = pd.read_sql(query, conn)
    
    # Close the connection
    conn.close()
    
    return df

if __name__ == "__main__":
    df = load_data()
    print(f"\nSuccessfully loaded {len(df)} song performances from the database!")
    print("\nPreview of the data:")
    print(df.head(10))
    
    # Example: you can now easily do calculations, like total times a song was played
    # song_counts = df['title'].value_counts()
    # print(song_counts.head())
