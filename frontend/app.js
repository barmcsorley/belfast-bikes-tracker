// Map and Chart State
let map;
let markers = {};
let selectedStationId = null;
let chartInstance = null;
let stationCache = {}; // Cache station metadata locally
const API_BASE_URL = '';
// Initialize Map
function initMap() {
    map = L.map('map', { zoomControl: false }).setView([54.5973, -5.9301], 14); // Centered on Belfast

    L.control.zoom({ position: 'bottomright' }).addTo(map);

    const locateControl = L.control({ position: 'bottomright' });
    locateControl.onAdd = function() {
        const div = L.DomUtil.create('div', 'leaflet-bar leaflet-control');
        div.innerHTML = '<a href="#" title="Current Location" style="font-size: 16px; line-height: 30px; text-align: center; text-decoration: none; color: #fff; background-color: rgba(17, 24, 39, 0.75); display: block; width: 30px; height: 30px; border-radius: 4px; border: 1px solid rgba(255,255,255,0.2);">📍</a>';
        div.onclick = function(e) {
            e.preventDefault();
            map.locate({setView: true, maxZoom: 16});
        }
        return div;
    };
    locateControl.addTo(map);

    let locationMarker = null;
    map.on('locationfound', function(e) {
        if (!locationMarker) {
            locationMarker = L.circleMarker(e.latlng, {
                radius: 8,
                fillColor: "#3b82f6",
                color: "#ffffff",
                weight: 2,
                opacity: 1,
                fillOpacity: 1,
                className: 'pulse-dot'
            }).addTo(map);
        } else {
            locationMarker.setLatLng(e.latlng);
        }
    });

    map.on('locationerror', function(e) {
        console.warn("Location error:", e.message);
        if (e.message.includes("secure") || e.message.includes("https") || e.code === 1) {
            console.warn("Geolocation requires HTTPS on non-localhost domains.");
        }
    });

    // Auto locate
    map.locate({setView: true, maxZoom: 14});

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 20
    }).addTo(map);

    fetchWeather();
    fetchStations();
}

async function fetchWeather() {
    try {
        const response = await fetch(`${API_BASE_URL}/weather`);
        const data = await response.json();
        const weatherWidget = document.getElementById('weather-widget');
        const icon = data.is_raining ? '🌧️' : '☀️';
        weatherWidget.innerHTML = `
            <div style="font-size: 1.5rem; line-height: 1;">${icon}</div>
            <div style="font-size: 0.85rem; color: var(--text-secondary);">${data.temperature}°C</div>
        `;
    } catch (error) {
        console.error('Error fetching weather:', error);
    }
}

// Fetch Stations from Backend
async function fetchStations() {
    try {
        const response = await fetch(`${API_BASE_URL}/stations`);
        const stations = await response.json();

        // Clear existing markers if any
        for (let id in markers) {
            map.removeLayer(markers[id]);
        }
        markers = {};

        stations.forEach(station => {
            // Cache station info
            stationCache[station.id] = station;

            // Determine availability class
            let availabilityClass = 'medium';
            if (station.current_bikes_available <= 2) {
                availabilityClass = 'critical';
            } else if (station.current_bikes_available >= 6) {
                availabilityClass = 'high';
            }

            // Create custom HTML marker
            let lightning = station.current_electric_bikes > 0 ? '<div style="position: absolute; top: -8px; right: -8px; font-size: 14px; text-shadow: 0 0 5px black;">⚡</div>' : '';
            const customIcon = L.divIcon({
                className: 'custom-bike-marker',
                html: `<div class="marker-pin ${availabilityClass}" style="position: relative;">
                         <span>${station.current_bikes_available}</span>
                         ${lightning}
                       </div>`,
                iconSize: [36, 36],
                iconAnchor: [18, 18]
            });

            const marker = L.marker([station.lat, station.lng], { icon: customIcon })
                .addTo(map)
                .bindPopup(`<b>${station.name}</b><br>Available: ${station.current_bikes_available} / ${station.capacity} bikes`);

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
async function selectStation(station) {
    selectedStationId = station.id;

    const sidebar = document.getElementById('sidebar');
    const nameEl = document.getElementById('station-name');
    const currentEl = document.getElementById('current-bikes');
    const capacityEl = document.getElementById('capacity-display');
    const currentPedal = document.getElementById('current-pedal');
    const currentElectric = document.getElementById('current-electric');

    nameEl.textContent = station.name;
    currentEl.textContent = station.current_bikes_available;
    capacityEl.textContent = `/ ${station.capacity} capacity`;
    currentPedal.textContent = station.current_pedal_bikes;
    currentElectric.textContent = station.current_electric_bikes;

    // Reset slider
    document.getElementById('hour-slider').value = 1;
    document.getElementById('hour-display').textContent = '+1h';
    document.getElementById('predicted-bikes').textContent = '--';
    document.getElementById('predicted-pedal').textContent = '--';
    document.getElementById('predicted-electric').textContent = '--';

    sidebar.classList.remove('hidden');

    // Fetch and render historical/forecast chart
    await fetchAndRenderChart(station.id);
    
    // Run initial slider prediction
    updatePrediction(1);
}

// Fetch trend data and render Chart.js
async function fetchAndRenderChart(stationId) {
    try {
        const response = await fetch(`${API_BASE_URL}/stations/${stationId}/history`);
        const historyData = await response.json();
        
        const ctx = document.getElementById('availability-chart').getContext('2d');
        
        const labels = [];
        const pedalPast = [];
        const pedalFuture = [];
        const electricPast = [];
        const electricFuture = [];
        
        // Extract past 24 hours
        historyData.past_24h.forEach(item => {
            labels.push(item.time);
            pedalPast.push(item.pedal_bikes);
            electricPast.push(item.electric_bikes);
            pedalFuture.push(null);
            electricFuture.push(null);
        });
        
        // Connect the two datasets at the current point
        const currPedal = historyData.past_24h[historyData.past_24h.length - 1].pedal_bikes;
        const currElectric = historyData.past_24h[historyData.past_24h.length - 1].electric_bikes;
        pedalFuture[historyData.past_24h.length - 1] = currPedal;
        electricFuture[historyData.past_24h.length - 1] = currElectric;
        
        // Extract future 12 hours
        historyData.future_12h.forEach(item => {
            labels.push(item.time);
            pedalPast.push(null);
            electricPast.push(null);
            pedalFuture.push(item.pedal_bikes);
            electricFuture.push(item.electric_bikes);
        });
        
        if (chartInstance) {
            chartInstance.destroy();
        }
        
        chartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Pedal (History)',
                        data: pedalPast,
                        borderColor: '#38bdf8', // Sky blue
                        backgroundColor: 'rgba(56, 189, 248, 0.08)',
                        borderWidth: 2,
                        tension: 0.4,
                        fill: false,
                        spanGaps: true,
                        pointRadius: 0,
                        pointHoverRadius: 4
                    },
                    {
                        label: 'Electric (History)',
                        data: electricPast,
                        borderColor: '#f59e0b', // Amber
                        backgroundColor: 'rgba(245, 158, 11, 0.08)',
                        borderWidth: 2,
                        tension: 0.4,
                        fill: false,
                        spanGaps: true,
                        pointRadius: 0,
                        pointHoverRadius: 4
                    },
                    {
                        label: 'Pedal (Forecast)',
                        data: pedalFuture,
                        borderColor: '#38bdf8',
                        borderWidth: 2,
                        borderDash: [5, 5],
                        tension: 0.4,
                        fill: false,
                        spanGaps: true,
                        pointRadius: 0,
                        pointHoverRadius: 4
                    },
                    {
                        label: 'Electric (Forecast)',
                        data: electricFuture,
                        borderColor: '#f59e0b',
                        borderWidth: 2,
                        borderDash: [5, 5],
                        tension: 0.4,
                        fill: false,
                        spanGaps: true,
                        pointRadius: 0,
                        pointHoverRadius: 4
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: true,
                        position: 'top',
                        labels: {
                            color: '#94a3b8',
                            font: { family: 'Outfit', size: 10, weight: '600' },
                            boxWidth: 12,
                            padding: 10
                        }
                    },
                    tooltip: {
                        mode: 'index',
                        intersect: false,
                        titleFont: { family: 'Outfit', size: 12 },
                        bodyFont: { family: 'Outfit', size: 11 },
                        backgroundColor: 'rgba(15, 23, 42, 0.9)',
                        borderColor: 'rgba(255, 255, 255, 0.1)',
                        borderWidth: 1
                    }
                },
                scales: {
                    x: {
                        grid: { display: false },
                        ticks: {
                            color: '#94a3b8',
                            font: { family: 'Outfit', size: 9 },
                            maxTicksLimit: 6
                        }
                    },
                    y: {
                        grid: { color: 'rgba(255, 255, 255, 0.04)' },
                        ticks: {
                            color: '#94a3b8',
                            font: { family: 'Outfit', size: 9 }
                        },
                        min: 0,
                        max: historyData.capacity,
                        suggestedMax: 10
                    }
                }
            }
        });
        
    } catch (error) {
        console.error('Error fetching trend data:', error);
    }
}

// Update Slider Prediction
async function updatePrediction(hoursAhead) {
    if (!selectedStationId) return;

    const now = new Date();
    now.setHours(now.getHours() + parseInt(hoursAhead));
    const targetHour = now.getHours();
    
    // JS Sunday is 0, model expects Monday=0, Sunday=6
    const pyDay = (now.getDay() + 6) % 7;

    try {
        const response = await fetch(`${API_BASE_URL}/predict?station_id=${selectedStationId}&hour=${targetHour}&day_of_week=${pyDay}`);
        const data = await response.json();

        const predEl = document.getElementById('predicted-bikes');
        const predPedalEl = document.getElementById('predicted-pedal');
        const predElecEl = document.getElementById('predicted-electric');
        predEl.textContent = data.predicted_bikes;
        predPedalEl.textContent = data.predicted_pedal_bikes;
        predElecEl.textContent = data.predicted_electric_bikes;
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
