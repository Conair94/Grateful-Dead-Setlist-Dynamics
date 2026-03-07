
import pandas as pd
import networkx as nx

def create_song_graph(csv_path):
    # Read the CSV file into a pandas DataFrame
    df = pd.read_csv(csv_path)

    # Calculate the total count for each song
    song_counts = df.groupby('song')['count'].sum().to_dict()

    # Create a new directed graph
    G = nx.DiGraph()

    # Iterate through each row of the DataFrame to add edges
    for index, row in df.iterrows():
        source_song = row['song']
        dest_song = row['after_song']
        count = row['count']

        # Ensure the destination song is not empty and the count is not zero
        if pd.notna(dest_song) and dest_song.strip() != '' and count > 0:
            # Get the total count for the source song
            total_count = song_counts.get(source_song, 0)

            if total_count > 0:
                # Calculate the edge weight
                weight = count / total_count

                # Add the edge to the graph
                G.add_edge(source_song, dest_song, weight=weight)

    return G

if __name__ == '__main__':
    csv_file = 'before_and_after/afterSongs.csv'
    song_graph = create_song_graph(csv_file)

    # Save the graph to a file
    nx.write_graphml(song_graph, 'song_graph.graphml')

    print(f"Graph created with {song_graph.number_of_nodes()} nodes and {song_graph.number_of_edges()} edges.")
    print("Graph saved to song_graph.graphml")
