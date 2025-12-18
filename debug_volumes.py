
import os
import sys
import logging
from pathlib import Path

# Add api directory to path
sys.path.append(str(Path(__file__).parent / "api"))

from api.DFConnector import DataFabricConnector
from api.main import get_profile_from_db

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("debug_volumes")

def check_volumes():
    profile = get_profile_from_db()
    if not profile:
        logger.error("No profile found in DB")
        return

    print(f"Connecting to {profile.get('cluster_host')}...")
    connector = DataFabricConnector(profile)
    
    try:
        volumes = connector.list_volumes()
        print(f"Found {len(volumes)} volumes:")
        for v in volumes:
            print(f" - Name: '{v.get('name')}', Path: '{v.get('path')}'")
            
        # Check against expectations
        expected = ["bronze", "silver", "gold"]
        found_names = [v.get("name") for v in volumes]
        
        print("\nVerification:")
        for name in expected:
            if name in found_names:
                print(f" [OK] Volume '{name}' found")
            else:
                print(f" [MISSING] Volume '{name}' NOT found")
                
    except Exception as e:
        logger.error(f"Error listing volumes: {e}")

if __name__ == "__main__":
    check_volumes()
