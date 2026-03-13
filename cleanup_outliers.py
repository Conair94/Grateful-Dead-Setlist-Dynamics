import json
import glob
import os
import re

def clean_reasons(reasons, bpm_limit=60, dance_limit=0.4):
    if not reasons:
        return None
    
    new_reasons = []
    for reason in reasons:
        # Match "BPM Variance: 60.26 (limit 20)"
        bpm_match = re.search(r'BPM Variance: ([\d.]+)', reason)
        if bpm_match:
            val = float(bpm_match.group(1))
            if val > bpm_limit:
                new_reasons.append(reason)
            continue
            
        # Match "Danceability Variance: 0.22 (limit 0.2)"
        dance_match = re.search(r'Danceability Variance: ([\d.]+)', reason)
        if dance_match:
            val = float(dance_match.group(1))
            if val > dance_limit:
                new_reasons.append(reason)
            continue
            
        # Keep other reasons as is (if any)
        new_reasons.append(reason)
        
    return new_reasons if new_reasons else None

# 1. Update outliers_for_review.json
outliers_path = 'data/processed/outliers_for_review.json'
if os.path.exists(outliers_path):
    with open(outliers_path, 'r') as f:
        outliers = json.load(f)
    
    new_outliers = []
    for entry in outliers:
        cleaned = clean_reasons(entry.get('reasons', []))
        if cleaned:
            entry['reasons'] = cleaned
            new_outliers.append(entry)
            
    with open(outliers_path, 'w') as f:
        json.dump(new_outliers, f, indent=4)
    print(f"Updated {outliers_path}")

# 2. Update *_features.json files
feature_files = glob.glob('data/processed/*_features.json')
outlier_count = 0

for file_path in feature_files:
    with open(file_path, 'r') as f:
        data = json.load(f)
    
    reasons = data.get('outlier_reasons')
    if reasons:
        cleaned = clean_reasons(reasons)
        if cleaned:
            data['outlier_reasons'] = cleaned
            data['outlier_flag'] = True
            outlier_count += 1
        else:
            data['outlier_reasons'] = None
            data['outlier_flag'] = False
    else:
        # Ensure outlier_flag is consistent if reasons are null/empty
        data['outlier_reasons'] = None
        data['outlier_flag'] = False

    with open(file_path, 'w') as f:
        json.dump(data, f, indent=4)

print(f"Processed {len(feature_files)} feature files.")
print(f"Total songs still flagged as outliers: {outlier_count}")
