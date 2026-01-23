// Map State
let map;
let markers = {};
let selectedStationId = null;

const API_BASE_URL = 'http://127.0.0.1:8000';

// Initialize Map
function initMap() {
    map = L.map('map').setView([54.5973, -5.9301], 14); // Centered on Belfast

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 20
    }).addTo(map);

    fetchStations();
}

// Fetch Stations from Backend
async function fetchStations() {
    try {
        const response = await fetch(`${API_BASE_URL}/stations`);
        const stations = await response.json();

        stations.forEach(station => {
            const marker = L.marker([station.lat, station.lng])
                .addTo(map)
                .bindPopup(`<b>${station.name}</b><br>Available: ${station.current_bikes_available}`);

            marker.on('click', () => {
                selectStation(station);
            });

            markers[station.id] = marker;
        });
    } catch (error) {
        console.error('Error fetching stations:', error);
        alert('Failed to connect to the prediction backend. Is it running?');
    }
}

// Handle Station Selection
function selectStation(station) {
    selectedStationId = station.id;

    const sidebar = document.getElementById('sidebar');
    const nameEl = document.getElementById('station-name');
    const currentEl = document.getElementById('current-bikes');

    nameEl.textContent = station.name;
    currentEl.textContent = station.current_bikes_available;

    sidebar.classList.remove('hidden');

    // Reset slider
    document.getElementById('hour-slider').value = 1;
    document.getElementById('hour-display').textContent = '+1h';
    document.getElementById('predicted-bikes').textContent = '--';

    updatePrediction(1);
}

// Update Prediction
async function updatePrediction(hoursAhead) {
    if (!selectedStationId) return;

    const now = new Date();
    now.setHours(now.getHours() + parseInt(hoursAhead));
    const targetHour = now.getHours();
    const dayOfWeek = now.getDay() === 0 ? 6 : now.getDay() - 1; // JS Sunday is 0, model expects Mon=0. Wait, python weekday() Mon=0, Sun=6. JS: Sun=0, Mon=1. So JS Day - 1 (if 0 then 6).

    // Fix day of week logic: JS 0=Sun, 1=Mon. Python 6=Sun, 0=Mon.
    // So if JS=0 (Sun), Python=6. If JS=1 (Mon), Python=0. -> (jsDay + 6) % 7
    const pyDay = (now.getDay() + 6) % 7;

    try {
        const response = await fetch(`${API_BASE_URL}/predict?station_id=${selectedStationId}&hour=${targetHour}&day_of_week=${pyDay}`);
        const data = await response.json();

        const predEl = document.getElementById('predicted-bikes');
        predEl.textContent = data.predicted_bikes;
    } catch (error) {
        console.error('Error getting prediction:', error);
    }
}

// Event Listeners
document.addEventListener('DOMContentLoaded', initMap);

document.getElementById('close-sidebar').addEventListener('click', () => {
    document.getElementById('sidebar').classList.add('hidden');
    selectedStationId = null;
});

document.getElementById('hour-slider').addEventListener('input', (e) => {
    const val = e.target.value;
    document.getElementById('hour-display').textContent = `+${val}h`;
    updatePrediction(val);
});
