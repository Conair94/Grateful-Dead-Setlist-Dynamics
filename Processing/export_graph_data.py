import sqlite3
import json
import os
from collections import defaultdict

def export_graph_data(db_path='grateful_dead.db', output_path='../docs/data/graph_data.json'):
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
        
        for i, set_seq in enumerate(set_keys):
            current_set = sets[set_seq]
            
            # Determine Set Type based on index
            if i == 0:
                set_type = "set1"
            elif i == 1:
                set_type = "set2"
            else:
                set_type = "epilogue"
            
            for j, song_data in enumerate(current_set):
                current_song = song_data['song_id']
                is_segue = bool(song_data['segue'])
                
                # First song of the set
                if j == 0:
                    if i == 0:
                        # First set of the show
                        edges.append({
                            "source": "START", 
                            "target": current_song, 
                            "date": show_date, 
                            "segue": False,
                            "set_type": set_type
                        })
                    elif set_type == "epilogue" and i == 2:
                        # Entering the epilogue from set 2
                        edges.append({
                            "source": "ENCORE_BREAK", 
                            "target": current_song, 
                            "date": show_date, 
                            "segue": False,
                            "set_type": set_type
                        })
                    elif set_type == "epilogue" and i > 2:
                        # Multiple encores, continue from previous
                        edges.append({
                            "source": "ENCORE_BREAK", 
                            "target": current_song, 
                            "date": show_date, 
                            "segue": False,
                            "set_type": set_type
                        })
                    else:
                        # First song of Set 2
                        edges.append({
                            "source": "SET_BREAK", 
                            "target": current_song, 
                            "date": show_date, 
                            "segue": False,
                            "set_type": set_type
                        })
                
                # Link to next song or end of set
                if j < len(current_set) - 1:
                    # Next song in the same set
                    next_song = current_set[j+1]['song_id']
                    edges.append({
                        "source": current_song, 
                        "target": next_song, 
                        "date": show_date, 
                        "segue": is_segue,
                        "set_type": set_type
                    })
                else:
                    # Last song of the set
                    if i == len(set_keys) - 1:
                        # Absolute last set of the show
                        edges.append({
                            "source": current_song, 
                            "target": "END", 
                            "date": show_date, 
                            "segue": False,
                            "set_type": set_type
                        })
                    else:
                        # Ends a set, but there is another set coming
                        next_set_index = i + 1
                        if next_set_index >= 2: # Going into an epilogue
                            edges.append({
                                "source": current_song, 
                                "target": "ENCORE_BREAK", 
                                "date": show_date, 
                                "segue": False,
                                "set_type": set_type
                            })
                        else:
                            edges.append({
                                "source": current_song, 
                                "target": "SET_BREAK", 
                                "date": show_date, 
                                "segue": False,
                                "set_type": set_type
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
    db_loc = '../grateful_dead.db' if os.path.exists('../grateful_dead.db') else 'grateful_dead.db'
    export_graph_data(db_path=db_loc, output_path='../docs/data/graph_data.json')
