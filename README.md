# 🚲 Belfast Bikes Predictor & Live Tracker

![Belfast Bikes AI Dashboard Mockup](./belfast_bikes_preview.png)

[![Python Version](https://img.shields.io/badge/python-3.9+-blue.svg?style=for-the-badge&logo=python&logoColor=white)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.100+-009688.svg?style=for-the-badge&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![scikit-learn](https://img.shields.io/badge/scikit--learn-1.3+-F7931E.svg?style=for-the-badge&logo=scikit-learn&logoColor=white)](https://scikit-learn.org/)
[![Leaflet.js](https://img.shields.io/badge/Leaflet.js-1.9.4-green.svg?style=for-the-badge&logo=leaflet&logoColor=white)](https://leafletjs.com/)
[![Chart.js](https://img.shields.io/badge/Chart.js-4.0+-FF6384.svg?style=for-the-badge&logo=chartdotjs&logoColor=white)](https://www.chartjs.org/)

An intelligent web application that tracks Belfast's shared bike network (operated by Beryl) in real-time, visualizes availability trends, and predicts future availability using a **Random Forest Regressor** machine learning model. Built with a premium, responsive **glassmorphism dark UI**.

---

## 🏗️ Architecture & Data Flow

This application is split into a **FastAPI backend** (which feeds the ML model and retrieves GBFS real-time data) and a **Vanilla JavaScript frontend** featuring interactive maps and charts.

```mermaid
graph TD
    subgraph Beryl GBFS Feed (Live API)
        B1[station_information.json] -->|Station Meta & Capacities| BE[FastAPI Backend]
        B2[station_status.json] -->|Real-time Bike & Dock Counts| BE
    end

    subgraph Backend Services
        BE -->|Fallback Data| FBL[Local JSON Backup]
        BE -->|Training Engine| ME[Model Trainer]
        ME -->|Historical Heuristic Patterns| TS[Synthetic Generator]
        TS -->|Random Forest Regressor| RF[Scikit-learn Model]
        BE -->|Hourly Forecast API| RF
    end

    subgraph Web App Frontend
        FE[Leaflet Map Dashboard] -->|AJAX Fetch /stations| BE
        FE -->|AJAX Fetch /history| BE
        FE -->|Draw Live Markers| MAP[Interactive Leaflet Map]
        FE -->|Draw Trends & Forecasts| CJS[Chart.js Line Chart]
        FE -->|Interactive Time Slider| SLD[Forecast Simulator]
    end
```

---

## ✨ Features

*   **🗺️ Interactive Live Map**: View all 60+ active Belfast Bike stations rendered on a custom CartoDB dark-mode map using Leaflet.js.
*   **📍 Live Location Tracking**: Automatically finds and marks your current location on the map with a pulsating blue dot (requires HTTPS).
*   **⚡ Electric Bike Detection**: Stations with available electric bikes are badged with a tiny lightning icon for quick scanning.
*   **🟢 Color-Coded Markers**: Stations are dynamically color-coded based on total bike availability:
    *   **High (Green)**: 6+ bikes available.
    *   **Medium (Sky Blue)**: 3-5 bikes available.
    *   **Critical (Pulsing Red)**: 0-2 bikes remaining.
*   **🚲 Detailed Breakdown**: Clicking any station reveals the exact split of **Pedal vs Electric** bikes available.
*   **📊 Double-Line Trend Chart**: View a beautiful Chart.js visualization plotting separate trend lines for Pedal and Electric bikes, combining **actual past 24-hour availability** and **future 12-hour predictions**.
*   **🎛️ Forecast Simulation Slider**: Scrub through a slider (from +1h to +12h) to get a granular prediction of both bike types for any future hour.
*   **🔋 Offline Resiliency**: The backend dynamically queries Beryl's live GBFS feeds but seamlessly falls back to local data and predictions if the external API is offline.
*   **📱 Glassmorphism Dark UI**: A gorgeous responsive layout utilizing CSS backdrop filters, modern gradients, and smooth slide-in animations.

---

## 🧠 Machine Learning Details

The predictive model uses a **Random Forest Regressor** from `scikit-learn` to forecast bike availability.

### 1. Training Strategy
Because historical APIs for Belfast Bikes do not provide raw timeseries datasets, the backend implements a **high-fidelity synthetic data generator** to simulate 30 days of hourly availability for each station:
*   **Commuter Stations**: Features drop in availability during morning (7-9 AM) and evening (4-6 PM) peak hours.
*   **University Areas**: Features lower availability during active study hours (9 AM - 5 PM) and high availability on weekends.
*   **Recreation Spots**: Peak usage simulated on weekend afternoons and summer evenings.
*   **Day/Night Cycles**: Availability stays relatively static overnight.

### 2. Feature Engineering
The model is trained on:
*   `station_id`: Unique identifier for each bike bay.
*   `hour`: Hour of the day (0-23).
*   `day_of_week`: Day of the week (0=Monday, 6=Sunday).
*   `temperature`: Temperature in Celsius.
*   `is_raining`: Flag for rain (0 or 1).

The model predicts a **multi-output target**: both pedal bike availability and electric bike availability. On server startup, the backend automatically generates mock training data simulating realistic electric bike distribution (approx 20% of fleets) and fits the model. Requests for future predictions feed the target hour, weekday, temperature, and rain status into the Random Forest regressor to output the predicted breakdown.

---

## 🚀 Setup & Installation (Dockerized)

The application is fully containerized so you can run the unified backend/frontend server effortlessly in one go!

1.  **Clone the repository**:
    ```bash
    git clone https://github.com/barmcsorley/belfast-bikes-tracker.git
    cd belfast-bikes-tracker
    ```

2.  **Start the container**:
    ```bash
    docker compose up -d --build
    ```

3.  **Access the App**:
    Open your browser and navigate to `http://localhost:8008` (or your remote server's IP address).

*(Note: The first time the container boots, it takes ~15 seconds to generate the massive synthetic ML dataset and train the Random Forest. The web interface will respond over port 8008 immediately after training completes).*

---

## 🔌 API Endpoints

The FastAPI server exposes the following clean endpoints:

*   **`GET /stations`**: Fetches list of all stations merged with real-time Beryl GBFS counts.
*   **`GET /predict`**: Takes `station_id`, `hour`, `day_of_week`, `temperature`, and `is_raining` to return the Random Forest prediction.
*   **`GET /stations/{station_id}/history`**: Returns the combined past 24 hours of availability and the next 12 hours of predictions for Chart.js visualization.
