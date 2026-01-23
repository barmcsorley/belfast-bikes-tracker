import pandas as pd
import numpy as np
import random
from datetime import datetime, timedelta

def get_mock_stations():
    """Returns a list of mock stations."""
    return [
        {"id": 1, "name": "City Hall", "lat": 54.5965, "lng": -5.9301, "capacity": 20},
        {"id": 2, "name": "Odyssey Arena", "lat": 54.6042, "lng": -5.9152, "capacity": 15},
        {"id": 3, "name": "Queen's University", "lat": 54.5847, "lng": -5.9344, "capacity": 25},
        {"id": 4, "name": "Central Station", "lat": 54.5956, "lng": -5.9172, "capacity": 18},
        {"id": 5, "name": "Titanic Belfast", "lat": 54.6080, "lng": -5.9083, "capacity": 30},
        {"id": 6, "name": "Botanic Gardens", "lat": 54.5824, "lng": -5.9331, "capacity": 22},
        {"id": 7, "name": "Europa Buscentre", "lat": 54.5938, "lng": -5.9353, "capacity": 20},
        {"id": 8, "name": "Victoria Square", "lat": 54.5985, "lng": -5.9254, "capacity": 16},
    ]

def generate_mock_training_data(days=30):
    """Generates synthetic training data for bike availability."""
    stations = get_mock_stations()
    data = []
    
    start_time = datetime.now() - timedelta(days=days)
    
    for station in stations:
        for i in range(days * 24): # Hourly data
            current_time = start_time + timedelta(hours=i)
            hour = current_time.hour
            day_of_week = current_time.weekday()
            
            # Simple logic for availability:
            # - Weekdays: Rush hours (8-9am, 5-6pm) have low availability.
            # - Weekends: More random, generally higher availability.
            
            base_availability = station["capacity"] * 0.7 # 70% full by default
            
            if day_of_week < 5: # Weekday
                if 7 <= hour <= 9 or 16 <= hour <= 18:
                    noise = random.uniform(-0.4, -0.1) # Decrease by 10-40%
                else:
                    noise = random.uniform(-0.1, 0.1)
            else: # Weekend
                noise = random.uniform(-0.2, 0.2)
            
            availability_ratio = max(0, min(1, 0.7 + noise))
            bikes_available = int(station["capacity"] * availability_ratio)
            
            data.append({
                "station_id": station["id"],
                "hour": hour,
                "day_of_week": day_of_week,
                "bikes_available": bikes_available,
                "capacity": station["capacity"]
            })
            
    return pd.DataFrame(data)
