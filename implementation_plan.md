# Implementation Plan - Belfast Bikes

## Goal
Predict bike availability using a simple ML model and a nice UI.

## Strategy
> [!NOTE]
> We will use **Mock Data** initially because the live API URL is currently 404.

## Proposed Changes

### Backend (`backend/`)
- `main.py`: FastAPI app serves `GET /stations` and `GET /predict`.
- `model.py`: Random Forest Regressor trained on mock data (Hour/Day -> Availability).
- `data.py`: Generates synthetic data for training.

### Frontend (`frontend/`)
- `index.html`: Leaflet Map dashboard.
- `style.css`: Premium dark/glassmorphism design.
- `script.js`: Fetches data from backend.

## Verification
1. **Backend**: Run `uvicorn` and `curl` the endpoints.
2. **Frontend**: Open `index.html` and click stations on map.
