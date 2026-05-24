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

            // Create custom HTML teardrop marker
            let lightning = station.current_electric_bikes > 0 ? '<div style="position: absolute; top: -10px; right: -10px; font-size: 14px; transform: rotate(45deg); text-shadow: 0 0 5px black;">⚡</div>' : '';
            const customIcon = L.divIcon({
                className: 'custom-bike-marker',
                html: `<div class="marker-pin ${availabilityClass}">
                         <div class="marker-content">
                            <span>${station.current_bikes_available}</span>
                            ${lightning}
                         </div>
                       </div>`,
                iconSize: [32, 32],
                iconAnchor: [16, 32]
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
    const subnameEl = document.getElementById('station-subname');
    const currentEl = document.getElementById('current-bikes');
    const capacityEl = document.getElementById('capacity-display');
    const currentPedal = document.getElementById('current-pedal');
    const currentElectric = document.getElementById('current-electric');

    nameEl.textContent = station.name.toUpperCase() + " STATION";
    if (subnameEl) subnameEl.textContent = station.name;
    currentEl.textContent = station.current_bikes_available;
    capacityEl.textContent = `${station.capacity} bikes available`;
    currentPedal.textContent = station.current_pedal_bikes;
    currentElectric.textContent = station.current_electric_bikes;

    // Update star button
    const favStarBtn = document.getElementById('fav-star-btn');
    if (favStarBtn) {
        let favs = JSON.parse(localStorage.getItem('belfastBikesFavourites')) || [];
        if (favs.includes(station.id)) {
            favStarBtn.classList.add('active');
            favStarBtn.textContent = '★';
        } else {
            favStarBtn.classList.remove('active');
            favStarBtn.textContent = '☆';
        }
    }

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
                        borderColor: '#06b6d4', // Cyan
                        backgroundColor: 'rgba(6, 182, 212, 0.1)',
                        borderWidth: 2,
                        tension: 0.4,
                        fill: true,
                        spanGaps: true,
                        pointRadius: 0,
                        pointHoverRadius: 4
                    },
                    {
                        label: 'Electric (History)',
                        data: electricPast,
                        borderColor: '#a855f7', // Purple
                        backgroundColor: 'rgba(168, 85, 247, 0.1)',
                        borderWidth: 2,
                        tension: 0.4,
                        fill: true,
                        spanGaps: true,
                        pointRadius: 0,
                        pointHoverRadius: 4
                    },
                    {
                        label: 'Pedal (Forecast)',
                        data: pedalFuture,
                        borderColor: '#06b6d4',
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
                        borderColor: '#a855f7',
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
        const displayValEl = document.getElementById('predicted-display-val');

        if (predEl) predEl.textContent = data.predicted_bikes;
        if (predPedalEl) predPedalEl.textContent = data.predicted_pedal_bikes;
        if (predElecEl) predElecEl.textContent = data.predicted_electric_bikes;
        if (displayValEl) displayValEl.textContent = data.predicted_bikes;
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

// Navigation logic for the sidebar tabs
document.querySelectorAll('.nav-links a').forEach(link => {
    link.addEventListener('click', (e) => {
        e.preventDefault();
        const li = link.parentElement;
        
        // Remove active class from all tabs
        document.querySelectorAll('.nav-links li').forEach(item => {
            item.classList.remove('active');
        });
        
        // Add active class to the clicked tab
        li.classList.add('active');

        const text = link.textContent.trim();
        if (text.includes('Map')) {
            document.getElementById('favourites-panel').classList.add('hidden');
        } else if (text.includes('Favourites')) {
            renderFavourites();
            document.getElementById('favourites-panel').classList.remove('hidden');
        } else {
            document.getElementById('favourites-panel').classList.add('hidden');
            alert(text + " module is currently under active development and will be available soon!");
        }
    });
});

document.getElementById('close-favourites').addEventListener('click', () => {
    document.getElementById('favourites-panel').classList.add('hidden');
});

// --- Search and Favourites Logic ---

// Default favourites by name (will be converted to IDs once data loads)
const DEFAULT_FAV_NAMES = ['Sandown Road', 'CS Lewis Square'];

function initFavourites() {
    let favs = localStorage.getItem('belfastBikesFavourites');
    if (!favs && Object.keys(stationCache).length > 0) {
        // First load: find IDs for default names
        const defaultIds = Object.values(stationCache)
            .filter(s => DEFAULT_FAV_NAMES.some(name => s.name.includes(name)))
            .map(s => s.id);
        localStorage.setItem('belfastBikesFavourites', JSON.stringify(defaultIds));
    }
}

// Ensure initFavourites runs after fetchStations
const originalFetch = window.fetchStations || fetchStations;
window.fetchStations = async function() {
    await originalFetch();
    initFavourites();
};

function renderFavourites() {
    const list = document.getElementById('favourites-list');
    list.innerHTML = '';
    const favs = JSON.parse(localStorage.getItem('belfastBikesFavourites')) || [];
    
    if (favs.length === 0) {
        list.innerHTML = '<p style="color:var(--text-secondary);font-size:0.85rem;text-align:center;margin-top:20px;">No favourites yet. Click the star on any station to add it!</p>';
        return;
    }

    favs.forEach(id => {
        const station = stationCache[id];
        if (!station) return;
        
        const div = document.createElement('div');
        div.className = 'fav-item';
        div.innerHTML = `
            <h4>${station.name}</h4>
            <div class="fav-stats">
                <span>🚲 ${station.current_pedal_bikes}</span>
                <span>⚡ ${station.current_electric_bikes}</span>
                <span style="margin-left:auto;">${station.current_bikes_available}/${station.capacity} Total</span>
            </div>
        `;
        div.onclick = () => {
            map.setView([station.lat, station.lng], 16);
            if (markers[id]) markers[id].fire('click');
        };
        list.appendChild(div);
    });
}

const favStarBtn = document.getElementById('fav-star-btn');
if (favStarBtn) {
    favStarBtn.addEventListener('click', () => {
        if (!selectedStationId) return;
        
        let favs = JSON.parse(localStorage.getItem('belfastBikesFavourites')) || [];
        
        if (favs.includes(selectedStationId)) {
            favs = favs.filter(id => id !== selectedStationId);
            favStarBtn.classList.remove('active');
            favStarBtn.textContent = '☆';
        } else {
            favs.push(selectedStationId);
            favStarBtn.classList.add('active');
            favStarBtn.textContent = '★';
        }
        
        localStorage.setItem('belfastBikesFavourites', JSON.stringify(favs));
        
        // Refresh list if panel is open
        if (!document.getElementById('favourites-panel').classList.contains('hidden')) {
            renderFavourites();
        }
    });
}

// Search Logic
const searchInput = document.getElementById('search-input');
const searchResults = document.getElementById('search-results');

searchInput.addEventListener('input', (e) => {
    const val = e.target.value.toLowerCase();
    searchResults.innerHTML = '';
    
    if (val.length < 2) {
        searchResults.classList.add('hidden');
        return;
    }
    
    const matches = Object.values(stationCache).filter(s => s.name.toLowerCase().includes(val));
    if (matches.length > 0) {
        searchResults.classList.remove('hidden');
        matches.slice(0, 6).forEach(station => {
            const li = document.createElement('li');
            li.textContent = station.name;
            li.onclick = () => {
                searchResults.classList.add('hidden');
                searchInput.value = '';
                map.setView([station.lat, station.lng], 16);
                if (markers[station.id]) markers[station.id].fire('click');
            };
            searchResults.appendChild(li);
        });
    } else {
        searchResults.classList.add('hidden');
    }
});

// Close search results when clicking outside
document.addEventListener('click', (e) => {
    if (!e.target.closest('.nav-search-box')) {
        searchResults.classList.add('hidden');
    }
});
