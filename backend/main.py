from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime
from model import BikePredictionModel
from data_loader import get_mock_stations

app = FastAPI(title="Belfast Bikes Prediction API")

# Enable CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify exact origin
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize Model
model = BikePredictionModel()
stations_db = get_mock_stations()

@app.on_event("startup")
def startup_event():
    model.train()

@app.get("/")
def read_root():
    return {"message": "Belfast Bikes Prediction API is running"}

@app.get("/stations")
def get_stations():
    """Returns all stations with current estimated availability."""
    current_time = datetime.now()
    hour = current_time.hour
    day_of_week = current_time.weekday()
    
    response = []
    for station in stations_db:
        try:
            prediction = model.predict(station["id"], hour, day_of_week)
        except:
            prediction = int(station["capacity"] * 0.5) # Fallback
            
        response.append({
            **station,
            "current_bikes_available": prediction
        })
    return response

@app.get("/predict")
def predict_availability(
    station_id: int, 
    hour: int = Query(..., ge=0, le=23), 
    day_of_week: int = Query(..., ge=0, le=6, description="0=Monday, 6=Sunday")
):
    """Predicts bike availability for a given station and time."""
    station = next((s for s in stations_db if s["id"] == station_id), None)
    if not station:
        raise HTTPException(status_code=404, detail="Station not found")
        
    prediction = model.predict(station_id, hour, day_of_week)
    return {
        "station_id": station_id,
        "station_name": station["name"],
        "hour": hour,
        "day_of_week": day_of_week,
        "predicted_bikes": prediction,
        "capacity": station["capacity"]
    }
