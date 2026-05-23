# Belfast Bikes Predictor & Tracker - Walkthrough

This walkthrough explains how to run the application, explore its features, and understand the technical implementation.

---

## 🛠️ How to Run the Application

### 1. Launch the Backend (FastAPI)
The backend acts as the data service and the prediction engine.

```bash
cd backend
# Create/Activate virtual environment
python3 -m venv venv
source venv/bin/activate
# Install dependencies
pip install -r requirements.txt
# Run the FastAPI server
uvicorn main:app --reload --port 8000
```
*The API will start running at `http://127.0.0.1:8000`*

### 2. Launch the Frontend
You can open `frontend/index.html` directly in your web browser, or serve it using a local HTTP server:
```bash
npx serve frontend
```

---

## 🌟 Interactive Features Walkthrough

### 1. Dark Mode Map View
When the frontend loads, it renders an interactive map centered on Belfast.
*   **Live Markers**: The map is populated with **61 active Beryl bike bays** dynamically loaded from Beryl's live GBFS feed.
*   **Availability Badges**: Each marker is a clean, custom circular badge showing the **exact number of bikes currently available**.
*   **Visual Urgency (Color Coding)**:
    *   **Emerald Green**: High availability (6+ bikes).
    *   **Sky Blue**: Medium availability (3-5 bikes).
    *   **Pulsing Red**: Low availability (0-2 bikes) - indicates urgency for commuters.

### 2. Detailed Analytics Sidebar
Clicking on any station marker opens a glassmorphism side panel showing deep-dive analytics.
*   **Capacity Indicators**: Displays the current count and maximum capacity of the selected bay.
*   **Availability Trend Graph (Chart.js)**: Displays a combined double-line graph:
    *   **Solid Blue Line**: Actual historical availability over the past 24 hours.
    *   **Dashed Purple Line**: Predicted future availability for the next 12 hours.
*   **Future Simulation Slider**: Drag the forecast slider to query the Random Forest model for predictions up to 12 hours in the future. The "Predicted Availability" card updates in real-time as you slide.

---

## 🔬 Technical Deep Dive

### 1. Data Ingestion & Live Feeds
The backend (`backend/data_loader.py`) pulls from two main Beryl GBFS feeds:
1.  **Station Information**: Coordinates, station names, and total capacities.
2.  **Station Status**: Live counts of available bikes and empty docks.

A local fallback JSON file (`beryl_stations_fallback.json`) ensures the server can boot and serve static station maps even if Beryl's API is temporarily unavailable.

### 2. Predictive Modeling
The forecasting engine (`backend/model.py`) runs a **Random Forest Regressor** trained on 30 days of hourly availability:
*   On startup, the server generates simulated training data mapped to the actual Beryl stations.
*   It models commuter habits, university study schedules, and park/recreational patterns.
*   The model fits inputs (`station_id`, `hour`, `day_of_week`) against the label `bikes_available`.
*   Predictions are fetched instantly via `/predict` and rendered dynamically on the UI.
