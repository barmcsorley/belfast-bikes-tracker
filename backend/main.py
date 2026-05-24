from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime, timedelta
import math
import os
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from model import BikePredictionModel
from data_loader import get_stations, get_live_status, fetch_live_weather

app = FastAPI(title="Belfast Bikes Prediction API")

# Enable CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify exact origin
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize Model and load station database
model = BikePredictionModel()
stations_db = get_stations()

@app.on_event("startup")
def startup_event():
    # Retrain model on startup using the Beryl Belfast stations configuration & weather patterns
    model.train()


@app.get("/weather")
def get_weather_endpoint():
    """Returns the current live weather for Belfast."""
    return fetch_live_weather()

@app.get("/stations")
def get_stations_endpoint():
    """Returns all stations with their current live availability (and capacity)."""
    # Fetch live status from Beryl
    try:
        live_status = get_live_status()
    except Exception as e:
        print(f"Error fetching live status: {e}")
        live_status = {}
        
    # Fetch live weather for prediction fallback
    weather = fetch_live_weather()
    current_temp = weather.get("temperature", 12.0)
    is_raining = weather.get("is_raining", 0)
        
    current_time = datetime.now()
    hour = current_time.hour
    day_of_week = current_time.weekday()
    
    response = []
    for station in stations_db:
        station_id = station["id"]
        # Use live availability if present, otherwise fall back to model prediction
        if station_id in live_status:
            current_bikes = live_status[station_id]["bikes_available"]
            is_active = live_status[station_id]["is_renting"]
        else:
            try:
                current_bikes = model.predict(
                    station_id, hour, day_of_week, 
                    temperature=current_temp, is_raining=is_raining
                )
            except Exception:
                current_bikes = int(station["capacity"] * 0.5)
            is_active = True
            
        response.append({
            **station,
            "current_bikes_available": current_bikes,
            "is_active": is_active
        })
    return response

@app.get("/predict")
def predict_availability(
    station_id: int, 
    hour: int = Query(..., ge=0, le=23), 
    day_of_week: int = Query(..., ge=0, le=6, description="0=Monday, 6=Sunday"),
    temperature: Optional[float] = None,
    is_raining: Optional[int] = Query(None, ge=0, le=1)
):
    """Predicts bike availability for a given station and time using the weather-aware ML model."""
    station = next((s for s in stations_db if s["id"] == station_id), None)
    if not station:
        raise HTTPException(status_code=404, detail="Station not found")
        
    # If weather variables are not supplied, fetch live conditions
    if temperature is None or is_raining is None:
        weather = fetch_live_weather()
        if temperature is None:
            temperature = weather.get("temperature", 12.0)
        if is_raining is None:
            is_raining = weather.get("is_raining", 0)
        
    prediction = model.predict(station_id, hour, day_of_week, temperature, is_raining)
    return {
        "station_id": station_id,
        "station_name": station["name"],
        "hour": hour,
        "day_of_week": day_of_week,
        "temperature": temperature,
        "is_raining": is_raining,
        "predicted_bikes": prediction,
        "capacity": station["capacity"]
    }

@app.get("/stations/{station_id}/history")
def get_station_history(station_id: int):
    """
    Returns past 24h historical (simulated based on patterns + live current value)
    and next 12h predicted bike availability, incorporating simulated diurnal weather cycles.
    """
    station = next((s for s in stations_db if s["id"] == station_id), None)
    if not station:
        raise HTTPException(status_code=404, detail="Station not found")
        
    capacity = station["capacity"]
    current_time = datetime.now()
    
    # Fetch live status to anchor the current hour
    live_bikes = None
    try:
        live_status = get_live_status()
        if station_id in live_status:
            live_bikes = live_status[station_id]["bikes_available"]
    except Exception:
        pass
        
    # Fetch live weather conditions to anchor the weather curve
    weather = fetch_live_weather()
    current_temp = weather.get("temperature", 12.0)
    current_rain = weather.get("is_raining", 0)
        
    # Helper to estimate temperature for any hour offset based on standard diurnal curves
    def estimate_weather(offset_hours):
        # Temperature fluctuates: max around 3 PM, min around 5 AM
        # We model this using a sine wave synced to target hour
        target_time = current_time + timedelta(hours=offset_hours)
        hour = target_time.hour
        
        # Calculate diurnal offset: sine peaks at 15 (3 PM)
        # sin((hour - 9) / 24 * 2 * pi) has min at 3 AM (sin(-pi/2)), max at 15 (sin(pi/2))
        diurnal_diff = 4.0 * math.sin((hour - 9.0) / 24.0 * 2.0 * math.pi)
        
        # Adjust base temp relative to current temp
        current_hour = current_time.hour
        current_diurnal = 4.0 * math.sin((current_hour - 9.0) / 24.0 * 2.0 * math.pi)
        estimated_temp = round(current_temp - current_diurnal + diurnal_diff, 1)
        
        # Rain forecast: keep similar to current rain unless offset is large (adds randomized variation)
        if offset_hours == 0:
            rain = current_rain
        else:
            # Shift rain probability slightly
            random_factor = (hash(offset_hours) % 100) / 100.0
            if current_rain == 1:
                # If it's raining now, 70% chance it keeps raining in near term
                rain = 1 if random_factor < 0.7 else 0
            else:
                # 15% chance it starts raining
                rain = 1 if random_factor < 0.15 else 0
                
        return estimated_temp, rain

    # Generate past 24h (simulated trend)
    past_data = []
    for h_offset in range(-24, 0):
        target_time = current_time + timedelta(hours=h_offset)
        hour = target_time.hour
        day_of_week = target_time.weekday()
        temp, rain = estimate_weather(h_offset)
        
        try:
            bikes = model.predict(station_id, hour, day_of_week, temp, rain)
        except Exception:
            bikes = int(capacity * 0.5)
            
        time_str = target_time.strftime("%I %p")
        past_data.append({
            "time": time_str,
            "timestamp": target_time.isoformat(),
            "bikes": bikes,
            "temperature": temp,
            "is_raining": rain
        })
        
    # Add current status
    current_bikes = live_bikes if live_bikes is not None else int(capacity * 0.5)
    past_data.append({
        "time": "Now",
        "timestamp": current_time.isoformat(),
        "bikes": current_bikes,
        "temperature": current_temp,
        "is_raining": current_rain
    })
    
    # Generate future 12h predictions
    future_data = []
    for h_offset in range(1, 13):
        target_time = current_time + timedelta(hours=h_offset)
        hour = target_time.hour
        day_of_week = target_time.weekday()
        temp, rain = estimate_weather(h_offset)
        
        try:
            bikes = model.predict(station_id, hour, day_of_week, temp, rain)
        except Exception:
            bikes = int(capacity * 0.5)
            
        time_str = target_time.strftime("%I %p")
        future_data.append({
            "time": time_str,
            "timestamp": target_time.isoformat(),
            "bikes": bikes,
            "temperature": temp,
            "is_raining": rain
        })
        
    return {
        "station_id": station_id,
        "station_name": station["name"],
        "capacity": capacity,
        "current_weather": {
            "temperature": current_temp,
            "is_raining": current_rain
        },
        "past_24h": past_data,
        "future_12h": future_data
    }

# Mount static frontend files
frontend_dir = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "../frontend"))
app.mount("/", StaticFiles(directory=frontend_dir, html=True), name="frontend")

