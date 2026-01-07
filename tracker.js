// --- Global Variables ---
let map, driverMarker, pathCoordinates = [];
let polyline, goalMarker, goalCircle;
let initialGeofence;
let goalcoord = null;
let lastdistanceToGoal = null;
let watchId = null;
//intial location
function showInitialLocation() {
    if ("geolocation" in navigator) {
        document.getElementById('status').innerText = "LOCATING SIGNAL...";
        
        navigator.geolocation.getCurrentPosition((position) => {
            const { latitude, longitude } = position.coords;
            const currentPos = L.latLng(latitude, longitude);

            // Set the map view to the user
            map.setView(currentPos, 15);

            // Update the marker position
            driverMarker.setLatLng(currentPos);
            
            // Update the UI coordinates
            document.getElementById('coords').innerText = 
                `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
            
            document.getElementById('status').innerText = "SIGNAL ACQUIRED";
            document.getElementById('status').style.color = "#3498db";
        }, (error) => {
            document.getElementById('status').innerText = "GPS ACCESS DENIED";
            document.getElementById('status').style.color = "#e74c3c";
        });
    }
}
// --- 1. Initialize Page on Load ---
window.onload = function() {
    const selectedMode = localStorage.getItem('userTransportMode');
    
    if (selectedMode) {
        document.getElementById('mode-badge').innerText = selectedMode.toUpperCase();
        initMap();
        showInitialLocation();
    } else {
        // Redirect back if no mode selected
        window.location.href = 'index.html';
    }
};

// --- 2. Leaflet Map Setup ---
function initMap() {
    map = L.map('map', { zoomControl: false }).setView([12.9716, 77.5946], 15);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);

    // Default Sentinel User Icon (Green)
    const greenIcon = L.divIcon({
        className: 'custom-div-icon',
        html: "<div style='background-color:#2ecc71; height:12px; width:12px; border-radius:50%; border:2px solid white; box-shadow:0 0 10px #2ecc71;'></div>",
        iconSize: [12, 12],
        iconAnchor: [6, 6]
    });

    driverMarker = L.marker([0, 0], { icon: greenIcon }).addTo(map);
    
    // Path color changed to Green to match the user
    polyline = L.polyline([], { 
        color: '#2ecc71', 
        weight: 4, 
        opacity: 0.6,
        dashArray: '5, 10' 
    }).addTo(map);
}

// --- 3. Activation & Transition Logic ---
function activateSecurity() {
    const dashboard = document.querySelector('.dashboard-container');
    const endInput = document.getElementById('end-input').value;

    if (!endInput) return alert("Please enter destination coordinates (Lat, Lng)");

    // Start UI Transitions
    dashboard.classList.add('activating');
    dashboard.classList.add('active');

    // Remove scanner and fix map after slide finishes
    setTimeout(() => {
        dashboard.classList.remove('activating');
        map.invalidateSize(); 
        document.getElementById('status').innerText = "MONITORING ENCRYPTED";
        document.getElementById('status').style.color = "#2ecc71";
    }, 1200);

    // Set Goal Location
    const coords = endInput.split(',').map(Number);
    goalcoord = L.latLng(coords[0], coords[1]);

    // Add Goal Visuals
    if (goalMarker) map.removeLayer(goalMarker);
    goalMarker = L.marker(goalcoord).addTo(map).bindPopup("Destination");
    
    startGPSMonitoring();
}

// --- 4. Real-Time GPS Logic ---
function startGPSMonitoring() {
    if ("geolocation" in navigator) {
        watchId = navigator.geolocation.watchPosition(
            (position) => {
                const { latitude, longitude, speed } = position.coords;
                const currentPos = L.latLng(latitude, longitude);

                updateTracker(currentPos, speed);
            },
            (error) => console.error("GPS Error:", error),
            { enableHighAccuracy: true }
        );
    }
}

// --- 5. Movement & Security Logic ---
function updateTracker(currentPos, rawSpeed) {
    const prevPos = driverMarker.getLatLng();

    // 1. Smoothly move marker
    moveMarker(driverMarker, prevPos, currentPos, 1000);

    // 2. Update Path
    pathCoordinates.push([currentPos.lat, currentPos.lng]);
    polyline.setLatLngs(pathCoordinates);

    // 3. Center Map (Using panTo for smoother following)
    map.panTo(currentPos, { animate: true, duration: 1.0 });

    // 4. Update Stats UI
    const speedKmh = (rawSpeed || 0) * 3.6;
    document.getElementById('speed').innerText = speedKmh.toFixed(1) + " km/h";
    document.getElementById('coords').innerText = `${currentPos.lat.toFixed(4)}, ${currentPos.lng.toFixed(4)}`;

    if (goalcoord) {
        const dist = (currentPos.distanceTo(goalcoord) / 1000).toFixed(2);
        document.getElementById('goaldist').innerText = dist + " km";
        checkSecurityRisk(currentPos, dist, speedKmh);
    }
}

// --- 6. Deviation & Risk Detection ---
function checkSecurityRisk(currentPos, currentDist, speed) {
    const status = document.getElementById('status');
    const mode = localStorage.getItem('userTransportMode');

    // Logic: If distance to goal increases significantly
    if (lastdistanceToGoal !== null && parseFloat(currentDist) > parseFloat(lastdistanceToGoal) + 0.05) {
        status.innerText = "🚨 DEVIATION DETECTED";
        status.style.color = "#e74c3c";
    }

    // Logic: Speed thresholds
    if (mode === 'walking' && speed > 12) {
        status.innerText = "⚠️ UNUSUAL SPEED";
        status.style.color = "#f1c40f";
    }

    lastdistanceToGoal = currentDist;
}

// Helper: Smooth Marker interpolation
function moveMarker(marker, startLatLng, endLatLng, duration) {
    const start = performance.now();
    function animate(currentTime) {
        const elapsed = currentTime - start;
        const progress = Math.min(elapsed / duration, 1);
        const lat = startLatLng.lat + (endLatLng.lat - startLatLng.lat) * progress;
        const lng = startLatLng.lng + (endLatLng.lng - startLatLng.lng) * progress;
        marker.setLatLng([lat, lng]);
        if (progress < 1) requestAnimationFrame(animate);
    }
    requestAnimationFrame(animate);
}