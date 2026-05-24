import pandas as pd
import numpy as np
import random
import os
import json
import urllib.request
from datetime import datetime, timedelta

STATION_INFO_URL = "https://beryl-gbfs-production.web.app/v2_2/Belfast/station_information.json"
STATION_STATUS_URL = "https://beryl-gbfs-production.web.app/v2_2/Belfast/station_status.json"
FALLBACK_FILE = os.path.join(os.path.dirname(__file__), "beryl_stations_fallback.json")

def fetch_json(url):
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=5) as response:
            return json.loads(response.read().decode('utf-8'))
    except Exception as e:
        print(f"Error fetching JSON from {url}: {e}")
        return None

def fetch_live_weather():
    """
    Fetches real-time temperature and precipitation status for Belfast
    using the public free Open-Meteo API.
    """
    url = "https://api.open-meteo.com/v1/forecast?latitude=54.5973&longitude=-5.9301&current=temperature_2m,precipitation"
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=5) as response:
            data = json.loads(response.read().decode('utf-8'))
            current = data.get("current", {})
            temp = float(current.get("temperature_2m", 12.0))
            precip = float(current.get("precipitation", 0.0))
            is_raining = 1 if precip > 0.1 else 0
            return {
                "temperature": temp,
                "is_raining": is_raining
            }
    except Exception as e:
        print(f"Weather fetch failed, using default: {e}")
        return {"temperature": 12.0, "is_raining": 0}

def get_stations():
    """
    Returns the list of Belfast Bike stations.
    Tries to fetch live data from Beryl GBFS, falls back to local JSON if offline.
    """
    stations = []
    data = fetch_json(STATION_INFO_URL)
    raw_stations = []
    if data and "data" in data and "stations" in data["data"]:
        raw_stations = data["data"]["stations"]
    
    if not raw_stations and os.path.exists(FALLBACK_FILE):
        try:
            with open(FALLBACK_FILE, "r") as f:
                raw_stations = json.load(f)
        except Exception as e:
            print(f"Error reading fallback file: {e}")
            
    for s in raw_stations:
        try:
            station_id = int(s["station_id"])
            stations.append({
                "id": station_id,
                "name": s["name"],
                "lat": float(s["lat"]),
                "lng": float(s["lon"]),
                "capacity": int(s.get("capacity", 15))
            })
        except (ValueError, KeyError) as e:
            print(f"Skipping station due to parsing error: {s.get('station_id')} - {e}")
            
    if not stations:
        stations = [
            {"id": 8270, "name": "Victoria Square", "lat": 54.598195, "lng": -5.924032, "capacity": 8},
            {"id": 8271, "name": "City Hall", "lat": 54.5965, "lng": -5.9301, "capacity": 20},
            {"id": 8272, "name": "Queen's University", "lat": 54.5847, "lng": -5.9344, "capacity": 25},
        ]
        
    return stations

def get_live_status():
    """
    Fetches the current live status of all stations from Beryl GBFS.
    Returns a dictionary mapping station_id (int) to status dict.
    """
    status_dict = {}
    data = fetch_json(STATION_STATUS_URL)
    if data and "data" in data and "stations" in data["data"]:
        for s in data["data"]["stations"]:
            try:
                sid = int(s["station_id"])
                pedal_count = 0
                electric_count = 0
                for v in s.get("vehicle_types_available", []):
                    if v.get("vehicle_type_id") == "beryl_bike":
                        pedal_count = int(v.get("count", 0))
                    elif v.get("vehicle_type_id") == "bbe":
                        electric_count = int(v.get("count", 0))
                        
                status_dict[sid] = {
                    "bikes_available": int(s.get("num_bikes_available", 0)),
                    "pedal_bikes_available": pedal_count,
                    "electric_bikes_available": electric_count,
                    "docks_available": int(s.get("num_docks_available", 0)),
                    "is_renting": bool(s.get("is_renting", True))
                }
            except (ValueError, KeyError):
                continue
    return status_dict

def generate_mock_training_data(days=30):
    """
    Generates synthetic training data for bike availability based on actual Beryl stations.
    Injects realistic patterns (rush hours, day/night cycles, weekday vs weekend, weather impact).
    """
    stations = get_stations()
    data = []
    
    random.seed(42)
    start_time = datetime.now() - timedelta(days=days)
    
    for station in stations:
        capacity = station["capacity"]
        station_id = station["id"]
        
        station_type = "commuter"
        if "University" in station["name"] or "College" in station["name"] or "Library" in station["name"]:
            station_type = "university"
        elif "Park" in station["name"] or "Garden" in station["name"] or "Water" in station["name"] or "Arena" in station["name"]:
            station_type = "recreation"
            
        for i in range(days * 24):
            current_time = start_time + timedelta(hours=i)
            hour = current_time.hour
            day_of_week = current_time.weekday()
            
            # 1. Simulate temperature (colder at night, warmer during day, seasonal noise)
            # Base temperature varies from 5°C to 15°C depending on time of day
            base_temp = 10.0 + 5.0 * np.sin((hour - 8) / 24.0 * 2.0 * np.pi)
            temp = round(base_temp + random.uniform(-4.0, 4.0), 1)
            
            # 2. Simulate rain (Belfast probability: 30%)
            is_raining = 1 if random.random() < 0.3 else 0
            
            # Base availability ratio starts at 50%
            base_ratio = 0.5
            
            # Day vs Night pattern
            if 0 <= hour <= 5:
                base_ratio = 0.7
            elif 6 <= hour <= 23:
                base_ratio = 0.45
                
            # Type-specific patterns
            if station_type == "commuter":
                if day_of_week < 5:  # Weekday
                    if 7 <= hour <= 9:
                        base_ratio -= 0.25
                    elif 16 <= hour <= 18:
                        base_ratio -= 0.3
                else:
                    base_ratio = 0.5
            elif station_type == "university":
                if day_of_week < 5:
                    if 9 <= hour <= 17:
                        base_ratio -= 0.2
                else:
                    base_ratio = 0.6
            elif station_type == "recreation":
                if day_of_week >= 5:  # Weekend
                    if 10 <= hour <= 16:
                        base_ratio -= 0.3
                else:
                    if 18 <= hour <= 21:
                        base_ratio -= 0.15
            
            # 3. Apply weather impact on bike usage
            if is_raining == 1:
                # Rainy: users avoid renting bikes, so more bikes stay parked at stations (higher availability)
                base_ratio += 0.12
            else:
                # Sunny / warm: higher usage, more bike churn
                if temp > 14.0:
                    base_ratio -= 0.1
            
            # Add random noise
            noise = random.uniform(-0.1, 0.1)
            final_ratio = max(0.05, min(0.95, base_ratio + noise))
            bikes_available = int(round(capacity * final_ratio))
            
            # Split into electric and pedal (approx 20% electric)
            electric_bikes = 0
            if bikes_available > 0:
                electric_ratio = random.uniform(0.1, 0.3)
                electric_bikes = int(round(bikes_available * electric_ratio))
            pedal_bikes = bikes_available - electric_bikes
            
            data.append({
                "station_id": station_id,
                "hour": hour,
                "day_of_week": day_of_week,
                "temperature": temp,
                "is_raining": is_raining,
                "bikes_available": bikes_available,
                "pedal_bikes_available": pedal_bikes,
                "electric_bikes_available": electric_bikes,
                "capacity": capacity
            })
            
    return pd.DataFrame(data)
