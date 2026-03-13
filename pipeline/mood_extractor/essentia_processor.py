import essentia
import essentia.standard as es
import logging
import numpy as np
import json
import os

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

def extract_mood_features(audio_path):
    """
    Extract high-level mood features from an audio file using Essentia.
    """
    if not os.path.exists(audio_path):
        logging.error(f"Audio file not found: {audio_path}")
        return None
        
    logging.info(f"Extracting features from: {audio_path}")
    
    try:
        # Silence Essentia's internal C++ logging if possible
        # Some versions allow: essentia.log.infoActive = False
        try:
            import essentia
            essentia.log.infoActive = False
            essentia.log.warningActive = False
        except:
            pass

        # Load audio
        loader = es.MonoLoader(filename=audio_path)
        audio = loader()
        
        # Use MusicExtractor for a comprehensive set of features
        extractor = es.MusicExtractor()
        features, features_stats = extractor(audio_path)
        
        mood_data = {}
        
        # In Essentia standard mode, features is a Pool object.
        # descriptorNames() gives the list of all available keys.
        for key in features.descriptorNames():
            val = features[key]
            
            # Filter for interesting numeric features
            is_interesting = any(p in key.lower() for p in ['mood', 'danceability', 'valence', 'arousal', 'bpm', 'loudness', 'spectral_centroid'])
            
            if is_interesting:
                # Some features are single values, some are lists/arrays
                if isinstance(val, (float, int, np.float32, np.float64, np.int32, np.int64)):
                    mood_data[key] = float(val)
                elif isinstance(val, (np.ndarray, list)) and len(val) == 1:
                    mood_data[key] = float(val[0])
                elif isinstance(val, str):
                    mood_data[key] = val
                    
        return mood_data
        
    except Exception as e:
        logging.error(f"Error extracting features from {audio_path}: {e}")
        return None

if __name__ == "__main__":
    # This test requires an actual audio file
    print("Essentia module loaded. Ready for feature extraction.")
