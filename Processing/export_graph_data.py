import sqlite3
import json
import os
from collections import defaultdict

def export_graph_data(db_path='../data/raw/grateful_dead.db', output_path='../docs/data/graph_data.json'):
    # Ensure output directory exists
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    # 1. Fetch all unique songs
    cursor.execute("SELECT song_id, title FROM songs")
    songs = cursor.fetchall()
    
    nodes = [
        {"id": "START", "title": "Start of Concert", "type": "special"},
        {"id": "SET_BREAK", "title": "Set Break", "type": "special"},
        {"id": "ENCORE_BREAK", "title": "Encore Break", "type": "special"},
        {"id": "END", "title": "End of Concert", "type": "special"}
    ]
    
    for s in songs:
        nodes.append({"id": s['song_id'], "title": s['title'], "type": "song"})

    # 2. Fetch all shows ordered by date
    cursor.execute("SELECT show_id, show_date FROM shows ORDER BY show_date")
    shows = cursor.fetchall()
    
    edges = []
    
    for show in shows:
        show_id = show['show_id']
        show_date = show['show_date']
        
        # Format date handling, keep it simple YYYY-MM-DD
        if show_date and "T" in show_date:
            show_date = show_date.split("T")[0]
        elif not show_date:
            show_date = "1970-01-01" # fallback if missing
            
        # Fetch all songs for this show, ordered correctly
        cursor.execute("""
            SELECT song_id, set_sequence, song_sequence, segue 
            FROM show_songs 
            WHERE show_id = ? 
            ORDER BY set_sequence ASC, song_sequence ASC
        """, (show_id,))
        
        show_songs = cursor.fetchall()
        
        if not show_songs:
            continue

        # Group by sets
        sets = defaultdict(list)
        for ss in show_songs:
            sets[ss['set_sequence']].append(ss)
            
        set_keys = sorted(list(sets.keys()))

        # Classify each set up front so transitions between sets can use a
        # consistent label. A short (<=2 song) final set in a multi-set show is
        # treated as an encore even when it's the 2nd set: ~40 shows in the DB
        # have a 1-2 song "set 2" that is really set1 + encore.
        set_types = []
        for i, set_seq in enumerate(set_keys):
            is_last = (i == len(set_keys) - 1)
            if i == 0:
                set_types.append("set1")
            elif (is_last and len(sets[set_seq]) <= 2) or i >= 2:
                set_types.append("epilogue")
            else:
                set_types.append("set2")

        for i, set_seq in enumerate(set_keys):
            current_set = sets[set_seq]
            set_len = len(current_set)
            set_type = set_types[i]

            for j, song_data in enumerate(current_set):
                current_song = song_data['song_id']
                is_segue = bool(song_data['segue'])
                
                # Positional calc (0.0 is opener, 1.0 is closer)
                current_pos = j / (set_len - 1) if set_len > 1 else 0.5
                next_pos = (j + 1) / (set_len - 1) if set_len > 1 else 0.5
                
                # First song of the set
                if j == 0:
                    if i == 0:
                        entry_source = "START"
                    elif set_type == "epilogue":
                        entry_source = "ENCORE_BREAK"
                    else:
                        entry_source = "SET_BREAK"
                    edges.append({
                        "source": entry_source,
                        "target": current_song,
                        "date": show_date,
                        "segue": False,
                        "set_type": set_type,
                        "target_pos": current_pos
                    })
                
                # Link to next song or end of set
                if j < set_len - 1:
                    # Next song in the same set
                    next_song = current_set[j+1]['song_id']
                    edges.append({
                        "source": current_song, 
                        "target": next_song, 
                        "date": show_date, 
                        "segue": is_segue,
                        "set_type": set_type,
                        "source_pos": current_pos,
                        "target_pos": next_pos
                    })
                else:
                    # Last song of the set
                    if i == len(set_keys) - 1:
                        exit_target = "END"
                    elif set_types[i + 1] == "epilogue":
                        exit_target = "ENCORE_BREAK"
                    else:
                        exit_target = "SET_BREAK"
                    edges.append({
                        "source": current_song,
                        "target": exit_target,
                        "date": show_date,
                        "segue": False,
                        "set_type": set_type,
                        "source_pos": current_pos
                    })

    # 3. Export to JSON
    graphData = {
        "nodes": nodes,
        "edges": edges
    }
    
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(graphData, f, separators=(',', ':'))
        
    print(f"Successfully exported {len(nodes)} nodes and {len(edges)} edges to {output_path}")

if __name__ == '__main__':
    # When run from Processing folder
    db_loc = '../data/raw/grateful_dead.db' if os.path.exists('../data/raw/grateful_dead.db') else 'data/raw/grateful_dead.db'
    export_graph_data(db_path=db_loc, output_path='../docs/data/graph_data.json')
