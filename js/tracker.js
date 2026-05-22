// --- Global Variables ---
let map, userMarker, pathCoordinates = [];
let polyline, goalMarker;
let goalcoord = null;
let lastdistanceToGoal = null;
let watchId = null;
let userlastpos = null;
let lastsavetime = 0;

let debounceTimeout = null;
let chosendest = null;
let mappicking = false;
let previewmarker = null;
let alertShown = false;
let chosenDestName = null;
let stationaryStartTime = null;
let stationaryTimer = null;
let stationaryReferencePos = null;
let journeyStartTime = null;

let alertTimer = null;
let alerttimeremaining = 120;
let currentalerttype = null;
let alertshownfor = {};
let currentJourneyId = null;

let shareTokenHash = null;
let shareManager = null;
//CONFIGURATION
const geocodeset = {
    api: 'https://nominatim.openstreetmap.org',
    threshold: 3,
    debounce: 300,
    lastrequest: 0,
    minDelay: 1000
};

const constants = {
    stationary_time: 300000,
    proximaldist: 0.5,
    arrivaldist: 0.1,
    deviationdist: 0.05,
    movementspeed: 0.01,
    speedthresholds: {
        walking: 12,
        car: 100,
        train: 200,
    }
};

window.onload = function () {
    const selectedMode = localStorage.getItem('userTransportMode');

    if (!selectedMode) {
        window.location.href = 'index.html';
        return;
    }
    document.getElementById('mode-badge').innerText = selectedMode.toUpperCase();
    shareManager = new ShareManager();
    initMap();
    showInitialLocation();
    enablesearch();
    mappick();
    loadJourneyFromStorage();
    setupShareButton();
};

// --- 2. Leaflet Map Setup ---
function initMap() {
    map = L.map('map', { zoomControl: false }).setView([0, 0], 2);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);

    // User Icon (Green)
    userMarker = L.marker([0, 0], {
        icon: L.divIcon({
            className: 'custom-div-icon',
            html: "<div style='background-color:#2ecc71; height:12px; width:12px; border-radius:50%; border:2px solid white; box-shadow:0 0 10px #2ecc71;'></div>",
            iconSize: [12, 12],
            iconAnchor: [6, 6]
        })
    }).addTo(map);

    // Path polyline
    polyline = L.polyline([], {
        color: '#2ecc71',
        weight: 4,
        opacity: 0.6,
        dashArray: '5, 10'
    }).addTo(map);
    setTimeout(() => {
        map.invalidateSize();
    }, 200);
}

//intial location
function showInitialLocation() {
    if (!("geolocation" in navigator)) {
        showError("Geolocation is not supported by your browser.");
        return;
    }

    updateStatus("Getting Signals", "#3498db");

    navigator.geolocation.getCurrentPosition((position) => {
        const { latitude, longitude } = position.coords;
        const currentPos = L.latLng(latitude, longitude);

        // Set the map view to the user
        map.flyTo(currentPos, 15, { duration: 1.5 });

        // Update the marker position
        userMarker.setLatLng(currentPos);

        // Update the UI coordinates
        document.getElementById('coords').innerText =
            `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;

        updateStatus("Signals Acquired", "#2ecc71");
        userlastpos = currentPos;

    }, (error) => {
        handleGeolocationError(error);
    });


}

function handleGeolocationError(error) {
    let message = "";
    switch (error.code) {
        case error.PERMISSION_DENIED:
            message = "GPS ACCESS DENIED- Please enable location Permission.";
            break;
        case error.POSITION_UNAVAILABLE:
            message = "GPS POSITION UNAVAILABLE- Check GPS settings.";
            break;
        case error.TIMEOUT:
            message = "GPS TIMEOUT- Request took too long.";
            break;
        default:
            message = "GPS ERROR- An unknown error occurred.";
    }
    updateStatus(message, "#e74c3c");
}
window.addEventListener('offline', () => {
    updateStatus("You are offline. Some features may not work.", "#e67e22");
});
window.addEventListener('online', () => {
    updateStatus("You are back online.", "#2ecc71");
});
//--3.Adress Search Bar
function enablesearch() {
    const searchbox = document.getElementById('start-input');
    const dropdown = document.getElementById('suggestions');

    searchbox.addEventListener('input', function (e) {
        const typed = e.target.value.trim();
        clearTimeout(debounceTimeout);
        if (typed.length < geocodeset.threshold) {
            dropdown.style.display = 'none';
            return;
        }
        debounceTimeout = setTimeout(() => {
            searchplace(typed);
        }, geocodeset.debounce);
    });
    document.addEventListener('click', function (e) {
        if (!e.target.closest('.input-section')) {
            dropdown.style.display = 'none';
        }
    });
}
async function searchplace(query, retries = 3) {
    if (watchId) {
        alert("Please end your current journey before searching for a new destination.");
        return;
    }
    const dropdown = document.getElementById('suggestions');
    try {
        dropdown.innerHTML = '<div class="dropdown-loading">Searching...</div>';
        dropdown.style.display = 'block';

        const url = `${geocodeset.api}/search?format=json&q=${encodeURIComponent(query)}`;
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'SentinelGPS/1.0'
            }
        });
        if (!response.ok) throw new Error('Search failed');
        const places = await response.json();
        showsuggestions(places);
    } catch (error) {
        console.error('Search Error:', error);
        if (retries > 0) {
            console.log(`Retrying search for "${query}". Attempts left: ${retries}`);
            setTimeout(() => {
                searchplace(query, retries - 1);
            }, 1000);
        } else {
            dropdown.innerHTML = '<div class="dropdown-error"> Search failed.Try Again</div>';

        }
    }
}
function showsuggestions(places) {
    const dropdown = document.getElementById('suggestions');
    if (places.length === 0) {
        dropdown.innerHTML = '<div class="dropdown-noresults">No results found</div>';
        return;
    }
    dropdown.innerHTML = '';
    places.forEach(place => {
        const item = document.createElement('div');
        item.className = 'dropdown-item';
        item.innerHTML = `
        <div class="place-name">${highlightMatch(place.display_name)}</div>
        <div class="place-type">${place.type || 'Location'}</div>
        </div>`;
        item.addEventListener('click', () => {
            pickplace(place);
        });
        dropdown.appendChild(item);
    });
    dropdown.style.display = 'block';
}
function highlightMatch(placeName) {
    const query = document.getElementById('start-input').value.trim();
    if (!query) return placeName;
    const pattern = new RegExp(`(${query})`, 'gi');
    return placeName.replace(pattern, '<strong>$1</strong>');
}
function pickplace(place) {
    const searchbox = document.getElementById('start-input');
    const dropdown = document.getElementById('suggestions');
    searchbox.value = place.display_name;
    dropdown.style.display = 'none';
    const coords = {
        lat: parseFloat(place.lat),
        lng: parseFloat(place.lon)
    };
    showdestpreview(coords, place.display_name);
    startbutton();
    chosendest = coords;
    chosenDestName = place.display_name;
}
function mappick() {
    const btn = document.getElementById('map-select-btn');
    btn.addEventListener('click', togglemappick);
}
function togglemappick() {
    mappicking = !mappicking;
    const btn = document.getElementById('map-select-btn');
    const mapDiv = document.getElementById('map');
    if (mappicking) {
        btn.classList.add('active');
        btn.innerText = 'Cancel map selection';
        mapDiv.style.cursor = 'crosshair';
        map.on('click', onmappick);
        notify("Map Selection Active. Click on the map to choose destination.");
    }
    else {
        btn.classList.remove('active');
        btn.innerText = 'SELECT ON MAP';
        mapDiv.style.cursor = '';
        map.off('click', onmappick);
    }
}
async function onmappick(e) {
    if (watchId) {
        showTemporaryMessage("Cannot change destination while journey is active.");
        return;
    }
    const coords = {
        lat: e.latlng.lat,
        lng: e.latlng.lng
    };
    updateStatus("Fetching address...", "#f1c40f");
    try {
        const placeName = await lookupAddress(coords.lat, coords.lng);
        document.getElementById('start-input').value = placeName;
        showdestpreview(coords, placeName);
        togglemappick();
        startbutton();
        chosendest = coords;
        chosenDestName = placeName;
        updateStatus("Address fetched", "#2ecc71");
    } catch (error) {
        console.error('Reverse Geocoding Error:', error);
        const coordsText = `${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}`;
        document.getElementById('start-input').value = coordsText;
        showdestpreview(coords, "Selected Locations");
        togglemappick();
        startbutton();
        chosendest = coords;
        chosenDestName = coordsText;
    }
}
async function lookupAddress(lat, lng) {
    const now = Date.now();
    const timeSinceLast = now - geocodeset.lastrequest;
    if (timeSinceLast < geocodeset.minDelay) {
        await new Promise(resolve => setTimeout(resolve, geocodeset.minDelay - timeSinceLast));
    }
    geocodeset.lastrequest = Date.now();
    const url = `${geocodeset.api}/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18`;
    const response = await fetch(url, {
        headers: { 'User-Agent': 'SentinelGPS/1.0' }
    });
    if (!response.ok) throw new Error('Lookup failed');
    const data = await response.json();
    return data.display_name || `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
}

function showdestpreview(coords, placeName) {
    if (previewmarker) map.removeLayer(previewmarker);
    previewmarker = L.marker([coords.lat, coords.lng], {
        icon: L.divIcon({
            className: 'destination-preview-icon',
            html: "<div class='preview-marker'></div>",
            iconSize: [20, 20],
            iconAnchor: [10, 10]
        })
    }).addTo(map);
    previewmarker.bindPopup(`<div class="preview-popup">
           <strong>Destination</strong><br>
           ${placeName}
           </div>`).openPopup();

    // On mobile, sometimes the bounds don't trigger properly due to layout changes.
    // Ensure we accommodate different zoom experiences.
    const isMobile = window.innerWidth <= 768;
    const zoomLevel = isMobile ? 14 : 16;

    // Invalidate map size FIRST since mobile UI changes map height dynamically.
    setTimeout(() => {
        map.invalidateSize();
        map.flyTo([coords.lat, coords.lng], zoomLevel, { animate: true, duration: 1.5 });
    }, 100);
}
//CHANGES--JOURNEY SHARE
function setupShareButton() {
    const shareBtn = document.getElementById('share-journey-btn');
    if (!shareBtn) return;

    shareBtn.addEventListener('click', async function () {
        try {
            // Disable button during generation
            shareBtn.disabled = true;
            shareBtn.textContent = 'Generating Link...';
            const userName = shareManager.sanitizeInput(
                localStorage.getItem('userName') || 'User'
            );

            // If we already generated a link for this journey, reuse it
            if (shareTokenHash && window.currentShareUrl) {
                const shareData = {
                    shareUrl: window.currentShareUrl,
                    isNew: false,
                    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
                };
                showShareModal(shareData, userName);
                return;
            }

            // Create journey ID if not yet assigned
            if (!currentJourneyId) {
                currentJourneyId = `journey_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            }

            // Generate share link (pending status by default)
            const result = await shareManager.generateShareLink(currentJourneyId, userName);
            shareTokenHash = result.tokenHash || await shareManager.hashToken(result.token);

            // If the journey has ALREADY started, immediately flip the link status to 'active'
            if (journeyStartTime) {
                await shareManager.updateJourneyStatus(shareTokenHash, 'active');
            }

            // Store the URL for reuse
            window.currentShareUrl = result.url;

            const shareData = {
                shareUrl: result.url,
                isNew: true,
                expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
            };
            showShareModal(shareData, userName);

        } catch (error) {
            console.error('Error generating share link:', error);
            alert('Failed to generate share link. Please try again.');
        } finally {
            shareBtn.disabled = false;
            shareBtn.textContent = '\ud83d\udd17 Share Journey';
        }
    });
}


// --- 4. Activation & Transition Logic ---
async function activateSecurity() {
    const btn = document.getElementById('start-btn');
    if (watchId) {
        if (confirm("Are you sure you want to stop tracking and save this journey?")) {
            stoptracking();
        }
        return;
    }
    if (typeof JourneyDB !== 'undefined') {
        const activeJourney = await JourneyDB.checkActiveJourney();
        if (activeJourney) {
            window.alert("You already have an active journey. Please end it before starting a new one.");
            return;
        }
    }
    if (!chosendest) {
        window.alert("Please select a destination before starting the tracker.");
        return;
    }
    if (!userlastpos) {
        window.alert("Please wait for GPS signal before starting the tracker.");
        return;
    }
    if (!currentJourneyId) {
        currentJourneyId = `journey_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    startJourney();

    try {
        // Create the ONE journey document — this is what both tracker and viewer use
        await firebase.firestore()
            .collection('journeys')
            .doc(currentJourneyId)
            .set({
                userId: firebase.auth().currentUser?.uid || 'anonymous',
                userEmail: firebase.auth().currentUser?.email || '',
                userName: firebase.auth().currentUser?.displayName || localStorage.getItem('userName') || 'User',
                startTime: firebase.firestore.FieldValue.serverTimestamp(),
                status: 'active',
                destination: goalcoord ? {
                    lat: goalcoord.lat,
                    lng: goalcoord.lng,
                    name: chosenDestName || document.getElementById('start-input').value || 'Unknown'
                } : null,
                mode: localStorage.getItem('userTransportMode') || 'walking',
                lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
            });

        // FORCE INITIAL LOCATION SYNC
        // If the user's device is completely stationary (e.g. a laptop on a desk), watchPosition may never fire.
        // We manually push their current location to guarantee the viewer page gets at least 1 coordinate.
        if (userlastpos) {
            const initialPosition = {
                coords: {
                    latitude: userlastpos.lat,
                    longitude: userlastpos.lng,
                    speed: 0,
                    accuracy: 10
                }
            };
            await syncLocationToFirestore(initialPosition);
        }


        journeyStartTime = Date.now();
    } catch (error) {
        console.error('Error creating journey:', error);
    }

    // Activate the share link if one was generated before journey started
    // This MUST be outside the main try/catch so it runs even if journey creation had issues
    try {
        if (shareTokenHash) {
            await shareManager.updateJourneyStatus(shareTokenHash, 'active');
        }
    } catch (error) {
        console.error('Error activating share link:', error);
    }

    btn.innerText = "STOP JOURNEY";
    btn.classList.add('stop-btn');

}

function startJourney() {
    const dashboard = document.querySelector('.dashboard-container');
    dashboard.classList.add('activating');
    dashboard.classList.add('active');
    journeyStartTime = Date.now();
    document.getElementById('panic-btn').style.display = 'flex';
    // Use the existing currentJourneyId (set in activateSecurity) — do NOT regenerate
    localStorage.setItem('activeJourneyId', currentJourneyId);

    const searchInput = document.getElementById('start-input');
    const mapSelectBtn = document.getElementById('map-select-btn');
    if (searchInput) searchInput.disabled = true;
    if (mapSelectBtn) mapSelectBtn.disabled = true;

    setTimeout(() => {
        dashboard.classList.remove('activating');
        map.invalidateSize();
        document.getElementById('status').innerText = "Journey started";
        document.getElementById('status').style.color = "#2ecc71";
    }, 1200);

    goalcoord = L.latLng(chosendest.lat, chosendest.lng);
    if (previewmarker) {
        map.removeLayer(previewmarker);
        previewmarker = null;
    }

    // Add Goal Visuals
    if (goalMarker) map.removeLayer(goalMarker);
    goalMarker = L.marker(goalcoord, {
        icon: L.divIcon({
            className: 'destination-icon',
            html: "<div class='destination-final-dot'></div>",
            iconSize: [16, 16],
            iconAnchor: [8, 8]
        })
    }).addTo(map).bindPopup("Destination");
    if (userlastpos) {
        const bounds = L.latLngBounds([userlastpos, goalcoord]);
        map.fitBounds(bounds, { padding: [50, 50] });
    }
    if (mappicking) {
        togglemappick();
    }
    map.off('click', onmappick);

    if (stationaryTimer) clearInterval(stationaryTimer);
    stationaryTimer = setInterval(() => {
        if (stationaryStartTime && (Date.now() - stationaryStartTime) > constants.stationary_time) {
            showalert("stationary", "⚠️ Prolonged Stationary Detected!", "You have been stationary for over 5 minutes.");
            stationaryStartTime = Date.now();
        }
    }, 10000);

    startGPSMonitoring();
}
//GPS Logic
function startGPSMonitoring() {
    if ("geolocation" in navigator) {
        if ('getBattery' in navigator) {
            navigator.getBattery().then(battery => {
                const highAccuracy = battery.level > 0.2 || battery.charging;
                watchId = navigator.geolocation.watchPosition(
                    async (position) => {
                        const { latitude, longitude, speed } = position.coords;
                        const currentPos = L.latLng(latitude, longitude);

                        updateTracker(currentPos, speed);
                        if (currentJourneyId) {
                            await syncLocationToFirestore(position);
                        }
                    },
                    (error) => {
                        console.error("GPS Error:", error);
                        handleGeolocationError(error);
                    },
                    {
                        enableHighAccuracy: highAccuracy,
                        timeout: 10000,
                        maximumAge: highAccuracy ? 0 : 5000
                    }
                );
            });
        } else {
            watchId = navigator.geolocation.watchPosition(
                async (position) => {
                    const { latitude, longitude, speed } = position.coords;
                    const currentPos = L.latLng(latitude, longitude);
                    updateTracker(currentPos, speed);
                    if (currentJourneyId) {
                        await syncLocationToFirestore(position);
                    }
                },
                (error) => {
                    console.error("GPS Error:", error);
                    handleGeolocationError(error);
                },
                {
                    enableHighAccuracy: true,
                    timeout: 10000,
                    maximumAge: 0
                }
            );
        }
    }
}
async function syncLocationToFirestore(position) {
    // Only sync if journey exists
    if (!currentJourneyId) return;

    const now = Date.now();
    const timeSinceLastSync = now - (window.lastFirestoreSync || 0);

    // Throttle to every 5 seconds
    if (timeSinceLastSync < 5000) return;

    try {
        const { latitude, longitude, speed, accuracy } = position.coords;

        // Add location to the journey's locations subcollection
        await db.collection('journeys')
            .doc(currentJourneyId)
            .collection('locations')
            .add({
                lat: latitude,
                lng: longitude,
                speed: speed ? (speed * 3.6) : 0, // Convert m/s to km/h
                accuracy: accuracy || 0,
                timestamp: firebase.firestore.FieldValue.serverTimestamp()
            });

        window.lastFirestoreSync = now;

        // Also update main journey document's lastUpdated
        await db.collection('journeys')
            .doc(currentJourneyId)
            .update({
                lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
            });

    } catch (error) {
        console.error('Error syncing location:', error);
    }
}
// --- 5. Movement & Security Logic ---
function updateTracker(currentPos, rawSpeed) {
    const prevPos = userMarker.getLatLng();

    // 1. Smoothly move marker
    moveMarker(userMarker, prevPos, currentPos, 1000);

    // 2. Update Path
    pathCoordinates.push([currentPos.lat, currentPos.lng]);
    if (pathCoordinates.length > 1000) {
        pathCoordinates.shift();
    }
    polyline.setLatLngs(pathCoordinates);

    // 3. Center Map (Using panTo for smoother following)
    map.panTo(currentPos, { animate: true, duration: 1.0 });

    // 4. Update Stats UI
    const speedKmh = rawSpeed ? (rawSpeed * 3.6) : 0;
    document.getElementById('speed').innerText = rawSpeed ? speedKmh.toFixed(1) + " km/h" : "0.0 km/h";
    document.getElementById('coords').innerText = `${currentPos.lat.toFixed(4)}, ${currentPos.lng.toFixed(4)}`;

    if (goalcoord) {
        const dist = (currentPos.distanceTo(goalcoord) / 1000);
        document.getElementById('goaldist').innerText = dist.toFixed(2) + " km";
        checkProximity(dist);
        checkDeviation(currentPos, dist);
        checkspeed(speedKmh);
        checkStationary(currentPos);
    }
    userlastpos = currentPos;
    if (journeyStartTime) {
        const now = Date.now();
        if (now - lastsavetime > 60000) {
            saveJourneyToStorage();
            lastsavetime = now;
        }
    }

}

// --- 6. Deviation & Risk Detection ---
function checkProximity(dist) {
    if (typeof dist !== 'number' || isNaN(dist) || dist < 0) {
        console.error('Invalid distance :', dist);
        return;
    }
    if (dist <= constants.arrivaldist) {
        notify("✅ You have arrived at your destination.");
        document.getElementById('status').innerText = "ARRIVED AT DESTINATION";
        document.getElementById('status').style.color = "#2ecc71";
        setTimeout(() => {
            if (confirm("Journey completed. Do you want to stop tracking?")) {
                stoptracking();
            }
        }, 2000);
    } else if (dist <= constants.proximaldist && dist > constants.arrivaldist) {
        if (!alertShown) {
            notify("⚠️ You are nearing your destination.");
            alertShown = true;
        }
    }
}
function checkDeviation(currentPos, currentDist) {
    const mode = localStorage.getItem('userTransportMode');
    let deviationThreshold = constants.deviationdist;
    if (mode === 'car') { deviationThreshold = 0.1; }
    else if (mode === 'train') { deviationThreshold = 0.2; }
    if (lastdistanceToGoal != null) {
        const distIncrease = (currentDist - lastdistanceToGoal);
        if (distIncrease > deviationThreshold) {
            showalert("deviation", "🚨 Route Deviation Detected!", `You have deviated from your planned route by ${distIncrease.toFixed(2)} km.`);
        } else if (distIncrease < -deviationThreshold) {
            clearAlertStatus();
        }
    }
    lastdistanceToGoal = currentDist;
}
function checkspeed(speed) {
    const mode = localStorage.getItem('userTransportMode');
    const thresholds = constants.speedthresholds[mode] || constants.speedthresholds.walking;
    if (speed > thresholds) {
        showalert("speed", "⚠️ Unusual Speed Detected!", `Your speed of ${speed.toFixed(1)} km/h exceeds typical ${mode} speed.`);
    }
}
function checkStationary(currentPos) {
    if (!stationaryReferencePos) {
        stationaryReferencePos = currentPos;
        stationaryStartTime = Date.now();
    } else {
        const distFromRef = currentPos.distanceTo(stationaryReferencePos) / 1000;
        if (distFromRef >= constants.movementspeed) {
            // User moved beyond exactly constants.movementspeed indicating significant movement
            stationaryReferencePos = currentPos;
            stationaryStartTime = Date.now();
        }
    }
}


// Helper fn
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
function updateStatus(message, color) {
    const status = document.getElementById('status');
    status.innerText = message;
    status.style.color = color;
}

function startbutton() {
    const btn = document.getElementById('start-btn');
    btn.disabled = false;
    btn.style.opacity = '1';
}
function stopjourneybtn() {
    const btn = document.getElementById('start-btn');
    if (watchId) {
        if (confirm("Are you sure you want to stop tracking and save this journey?")) {
            stoptracking();
        }
    } else {
        activateSecurity();
    }
}
function showalert(type, title, message) {
    if (alertshownfor[type] && Date.now() - alertshownfor[type] < 60000) {
        return;
    }
    const status = document.getElementById('status');
    status.innerText = title;
    status.style.color = type === "deviation" ? "#e74c3c" : "#f1c40f";
    if (type === "deviation" || type === "stationary") {
        alertmodal(type, title, message);
        alertshownfor[type] = Date.now();
    }
    if ("Notification" in window && Notification.permission === "granted") {
        new Notification("Sentinel GPS", {
            body: message,
            icon: '/favicon.ico',
            badge: '/favicon.ico',
            vibrate: [200, 100, 200]
        });
    }
}
function clearAlertStatus() {
    const status = document.getElementById('status');
    if (status.style.color !== "#2ecc71") {
        status.innerText = "MONITORING ACTIVE";
        status.style.color = "#2ecc71";
    }
}
function notify(message) {
    console.log(message);
    if ("Notification" in window && Notification.permission === "granted") {
        new Notification("Sentinel GPS", { body: message });
    }
}

function showError(message) {
    window.alert("⚠️" + message);
}

if ("Notification" in window && Notification.permission == "default") {
    Notification.requestPermission();
}

//journey stop
async function stoptracking() {
    document.getElementById('panic-btn').style.display = 'none';
    if (watchId) {
        navigator.geolocation.clearWatch(watchId);
        watchId = null;
    }
    if (stationaryTimer) {
        clearInterval(stationaryTimer);
        stationaryTimer = null;
    }
    await saveJourneyToHistory();

    // End the journey in Firestore BEFORE clearing the ID
    await endJourney();

    localStorage.removeItem('activeJourney');
    localStorage.removeItem('activeJourneyId');

    // Reset share state so next journey gets a fresh link
    currentJourneyId = null;
    shareTokenHash = null;
    window.currentShareUrl = null;
    chosenDestName = null;

    const searchInput = document.getElementById('start-input');
    const mapSelectBtn = document.getElementById('map-select-btn');
    if (searchInput) searchInput.disabled = false;
    if (mapSelectBtn) mapSelectBtn.disabled = false;
    setTimeout(() => {
        window.location.href = 'dashboard.html';
    }, 1000);
}
async function endJourney() {
    if (!currentJourneyId) return;

    try {
        // Update journey status to completed
        await db.collection('journeys')
            .doc(currentJourneyId)
            .update({
                status: 'completed',
                endTime: firebase.firestore.FieldValue.serverTimestamp()
            });

        // Update share link expiration (1 hour from now or keep existing)
        if (shareTokenHash) {
            await shareManager.updateJourneyStatus(shareTokenHash, 'completed');
        }

        console.log('✅ Journey ended:', currentJourneyId);

    } catch (error) {
        console.error('Error ending journey:', error);
    }
}
function saveJourneyToStorage() {
    try {
        const journeyData = {
            startTime: journeyStartTime,
            destination: goalcoord ? { lat: goalcoord.lat, lng: goalcoord.lng } : null,
            path: pathCoordinates,
            mode: localStorage.getItem('userTransportMode'),
            lastUpdated: Date.now()
        };
        localStorage.setItem('activeJourney', JSON.stringify(journeyData));
    } catch (error) {
        console.error('Failed to save journey:', error);
    }
}
function loadJourneyFromStorage() {
    const saved = localStorage.getItem('activeJourney');
    if (!saved) return false;
    try {
        const data = JSON.parse(saved);
        if (Date.now() - data.lastUpdated > 24 * 60 * 60 * 1000) {
            localStorage.removeItem('activeJourney');
            return false;
        }
        if (data.destination) {
            goalcoord = L.latLng(data.destination.lat, data.destination.lng);
            pathCoordinates = data.path || [];
            journeyStartTime = data.startTime;
            if (goalMarker) map.removeLayer(goalMarker);
            goalMarker = L.marker(goalcoord).addTo(map).bindPopup("Destination");
            polyline.setLatLngs(pathCoordinates);
            startGPSMonitoring();
            document.getElementById('status').innerText = "Journey Resumed";
            document.getElementById('status').style.color = "#2ecc71";
        }
    } catch (error) {
        console.error('Failed to load journey:', error);
        localStorage.removeItem('activeJourney');
    }
}
async function saveJourneyToHistory() {
    if (!goalcoord || pathCoordinates.length === 0) return;

    try {
        const journeyId = currentJourneyId || localStorage.getItem('activeJourneyId') || `journey_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        const journeyData = {
            mode: localStorage.getItem('userTransportMode'),
            startTime: new Date(journeyStartTime),
            endTime: new Date(),
            destination: { lat: goalcoord.lat, lng: goalcoord.lng },
            pathPoints: pathCoordinates.map(coord => ({
                lat: coord[0],
                lng: coord[1],
                timestamp: Date.now()
            })),
            distance: parseFloat(calculateTotalDistance()),
            duration: Date.now() - journeyStartTime,
            avgSpeed: calculateAverageSpeed(),
            alerts: [],
            status: 'completed'
        };

        if (navigator.onLine && typeof JourneyDB !== 'undefined') {
            if (typeof SyncIndicator !== 'undefined') {
                SyncIndicator.saving();
            }
            try {
                await JourneyDB.saveJourneyWithId(journeyId, journeyData);
                console.log('Journey saved to cloud');

                if (typeof SyncIndicator !== 'undefined') {
                    SyncIndicator.synced();
                }
            } catch (error) {
                console.error('Cloud save failed, saving locally:', error);
                if (typeof OfflineSync !== 'undefined') {
                    OfflineSync.saveToLocal({ ...journeyData, _journeyId: journeyId });
                }
                if (typeof SyncIndicator !== 'undefined') {
                    SyncIndicator.offline();
                }
            }
        } else {
            console.log('📴 Offline - saving locally');
            if (typeof OfflineSync !== 'undefined') {
                OfflineSync.saveToLocal(journeyData);
                if (typeof SyncIndicator !== 'undefined') {
                    SyncIndicator.offline();
                }
            } else {
                let history = JSON.parse(localStorage.getItem('journeyHistory')) || [];
                history.unshift(journeyData);
                if (history.length > 50) history = history.slice(0, 50);
                localStorage.setItem('journeyHistory', JSON.stringify(history));
            }
        }

    } catch (error) {
        console.error('Failed to save journey:', error);
        alert('Error saving journey. Please try again.');
    }
}
function calculateAverageSpeed() {
    if (!journeyStartTime || pathCoordinates.length === 0) return 0;

    const durationHours = (Date.now() - journeyStartTime) / (1000 * 60 * 60);
    const distanceKm = parseFloat(calculateTotalDistance());

    if (durationHours === 0) return 0;
    return distanceKm / durationHours;
}
function calculateTotalDistance() {
    let total = 0;
    for (let i = 1; i < pathCoordinates.length; i++) {
        const prev = L.latLng(pathCoordinates[i - 1][0], pathCoordinates[i - 1][1]);
        const curr = L.latLng(pathCoordinates[i][0], pathCoordinates[i][1]);
        total += prev.distanceTo(curr);
    }
    return (total / 1000).toFixed(2);
}

//alert modal
function alertmodal(type, title, message) {
    currentalerttype = type;
    const modal = document.getElementById('alert-modal');
    const icon = document.getElementById('modal-icon');
    document.getElementById('alert-title').innerText = title;
    document.getElementById('alert-message').innerText = message;
    if (type === "deviation") {
        icon.innerText = "🚨";
    }
    else if (type === "stationary") {
        icon.innerText = "⏱️";
    }
    else if (type === "speed") {
        icon.innerText = "⚡";
    }
    modal.classList.remove('hidden');
    startalertcountdown();
    alertSound();

    syncAlertToFirestore(type, {
        location: userlastpos ? { lat: userlastpos.lat, lng: userlastpos.lng } : null,
        message: message
    });
}
async function syncAlertToFirestore(alertType, data) {
    if (!currentJourneyId) return;

    try {
        await db.collection('journeys')
            .doc(currentJourneyId)
            .collection('alerts')
            .add({
                type: alertType,
                status: 'pending',
                timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                location: data.location || null,
                message: data.message || null
            });

        console.log('✅ Alert synced to Firestore:', alertType);
    } catch (error) {
        console.error('Error syncing alert:', error);
    }
}
function startalertcountdown() {
    alerttimeremaining = 120;
    if (alertTimer) {
        clearInterval(alertTimer);
    }
    alertTimer = setInterval(() => {
        alerttimeremaining--;
        const minute = Math.floor(alerttimeremaining / 60);
        const seconds = alerttimeremaining % 60;
        document.getElementById('countdown').innerText = `${minute}:${seconds.toString().padStart(2, '0')}`;
        const progress = (alerttimeremaining / 120) * 100;
        document.getElementById('timer-progress').style.width = progress + '%';
        const progressbar = document.getElementById('timer-progress');
        if (alerttimeremaining <= 30) {
            progressbar.style.background = "#e74c3c";
            progressbar.style.boxShadow = '0 0 10px rgba(231, 76, 60, 0.8)';
        } else if (alerttimeremaining <= 60) {
            progressbar.style.background = '#f1c40f';
            progressbar.style.boxShadow = '0 0 10px rgba(241, 196, 15, 0.6)';
        }
        if (alerttimeremaining <= 0) {
            escalateAlert();
        }
    }, 1000);

}
function alertresponse(response) {
    clearInterval(alertTimer);
    const modal = document.getElementById('alert-modal');
    modal.classList.add('hidden');
    const responsedata = {
        timestamp: Date.now(),
        alertType: currentalerttype,
        response: response,
        location: userlastpos ? {
            lat: userlastpos.lat,
            lng: userlastpos.lng
        } : null
    };
    let alerthistory = JSON.parse(localStorage.getItem('alerthistory') || '[]');
    alerthistory.unshift(responsedata);
    if (alerthistory.length > 50) alerthistory = alerthistory.slice(0, 50);
    localStorage.setItem('alerthistory', JSON.stringify(alerthistory));

    if (response === 'safe') {
        document.getElementById('status').innerText = "✅ User confirmed safe";
        document.getElementById('status').style.color = "#2ecc71";
        delete alertshownfor[currentalerttype];
    } else if (response === 'help') {
        document.getElementById('status').innerText = "🆘 EMERGENCY!!";
        document.getElementById('status').style.color = "#e74c3c";
        sendEmergencyAlert();
    } else if (response === 'snooze') {
        document.getElementById('status').innerText = "Journey Ongoing";
        document.getElementById('status').style.color = "#2ecc71";
        delete alertshownfor[currentalerttype];
    }
    setTimeout(() => {
        if (goalcoord) {
            document.getElementById('status').innerText = "Journey Ongoing";
            document.getElementById('status').style.color = "#2ecc71";
        }
    }, 5000);
}
function escalateAlert() {
    clearInterval(alertTimer);
    const modal = document.getElementById('alert-modal');
    modal.classList.add('hidden');
    document.getElementById('status').innerText = "🚨 ALERT ESCALATED - NO RESPONSE";
    document.getElementById('status').style.color = "#e74c3c";
    const escalationData = {
        timestamp: Date.now(),
        alertType: currentalerttype,
        response: 'ESCALATED',
        location: userlastpos ? {
            lat: userlastpos.lat,
            lng: userlastpos.lng
        } : null
    };
    let alertHistory = JSON.parse(localStorage.getItem('alertHistory') || '[]');
    alertHistory.unshift(escalationData);
    if (alertHistory.length > 50) alertHistory = alertHistory.slice(0, 50);
    localStorage.setItem('alerthistory', JSON.stringify(alertHistory));
    console.warn("⚠️ ALERT ESCALATED - No user response after 2 minutes!");
    if ("Notification" in window && Notification.permission === "granted") {
        new Notification("🚨 Sentinel GPS - ALERT ESCALATED", {
            body: "No response received. Alert has been escalated.",
            requireInteraction: true,
            vibrate: [500, 200, 500]
        });
    }
}
async function manualtrigger() {
    if (!currentJourneyId) return;
    currentalerttype = 'emergency';
    showalert('emergency', '🆘 MANUAL ALERT ACTIVATED', 'Your emergency contacts have been notified.');
    try {
        await firebase.firestore().collection('journeys').doc(currentJourneyId).update({
            status: 'alert',
            alertType: 'emergency',
            lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
        });

        sendEmergencyAlert();

    } catch (error) {
        console.error("Failed to sync manual panic:", error);
    }
}
function alertSound() {
    try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        for (let i = 0; i < 3; i++) {
            setTimeout(() => {
                const oscillator = audioContext.createOscillator();
                const gainNode = audioContext.createGain();
                oscillator.connect(gainNode);
                gainNode.connect(audioContext.destination);
                oscillator.frequency.value = 800;
                oscillator.type = 'sine';
                gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
                gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
                oscillator.start(audioContext.currentTime);
                oscillator.stop(audioContext.currentTime + 0.3);
            }, i * 400);

        }
    }
    catch (error) {
        console.error('Audio API error:', error);
    }
}
function sendEmergencyAlert() {
    window.alert("🆘 EMERGENCY ALERT ACTIVATED!");
    console.error("🚨 EMERGENCY ALERT ACTIVATED at", new Date().toISOString());
    if ('vibrate' in navigator) {
        navigator.vibrate([200, 100, 200, 100, 200, 100, 200]);
    }
    try {
        const emergencyData = {
            timestamp: Date.now(),
            type: 'EMERGENCY_BUTTON',
            location: userlastpos ? {
                lat: userlastpos.lat,
                lng: userlastpos.lng
            } : null,
            alertType: currentalerttype
        };
        let emergency = JSON.parse(localStorage.getItem('emergencyEvents') || '[]');
        emergency.unshift(emergencyData);
        if (emergency.length > 20) emergency = emergency.slice(0, 20);
        localStorage.setItem('emergencyEvents', JSON.stringify(emergency));
    } catch (error) { console.error('Failed to save emergency event:', error); }

}
//journey share helpers
function showShareModal(shareData, userName) {
    // Remove any existing modal
    const existingModal = document.querySelector('.share-modal-overlay');
    if (existingModal) existingModal.remove();

    // Create modal
    const modal = document.createElement('div');
    modal.className = 'modal share-modal-overlay';
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 500px;">
            <h2 style="margin-bottom: 20px; color: #2ecc71;">
                ✅ Share Link Generated
            </h2>
            
            <p style="color: #95a5a6; margin-bottom: 20px;">
                Share this secure link with anyone you trust. 
                ${shareData.isNew ? 'Link expires in 24 hours.' : 'Using existing link.'}
            </p>

            <div style="
                background: rgba(255,255,255,0.05);
                padding: 15px;
                border-radius: 10px;
                border-left: 3px solid #3498db;
                margin-bottom: 20px;
            ">
                <small style="color: #95a5a6; display: block; margin-bottom: 8px;">Share Link:</small>
                <input type="text" 
                       id="share-link-input" 
                       value="${shareData.shareUrl}" 
                       readonly 
                       style="
                           width: 100%;
                           padding: 12px;
                           background: rgba(0,0,0,0.3);
                           border: 1px solid rgba(255,255,255,0.2);
                           border-radius: 5px;
                           color: white;
                           font-family: monospace;
                           font-size: 0.9rem;
                       ">
            </div>

            <div class="alert-actions" style="display: grid; gap: 10px;">
                <button onclick="copyShareLink()" class="btn-safe" style="
                    padding: 14px;
                    background: linear-gradient(135deg, #2ecc71, #27ae60);
                    color: white;
                    border: none;
                    border-radius: 8px;
                    cursor: pointer;
                    font-weight: bold;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 10px;
                ">
                    <span class="btn-icon">📋</span>
                    <span>Copy Link</span>
                </button>
                
                <button onclick="shareViaWhatsApp()" class="btn-help" style="
                    padding: 14px;
                    background: linear-gradient(135deg, #25D366, #128C7E);
                    color: white;
                    border: none;
                    border-radius: 8px;
                    cursor: pointer;
                    font-weight: bold;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 10px;
                ">
                    <span class="btn-icon">📱</span>
                    <span>Share via WhatsApp</span>
                </button>
                
                <button onclick="shareNative()" class="btn-help" style="
                    padding: 14px;
                    background: linear-gradient(135deg, #3498db, #2980b9);
                    color: white;
                    border: none;
                    border-radius: 8px;
                    cursor: pointer;
                    font-weight: bold;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 10px;
                ">
                    <span class="btn-icon">📤</span>
                    <span>Share via...</span>
                </button>
                
                <button onclick="closeShareModal()" class="btn-snooze" style="
                    padding: 14px;
                    background: rgba(255,255,255,0.1);
                    color: white;
                    border: 1px solid rgba(255,255,255,0.2);
                    border-radius: 8px;
                    cursor: pointer;
                    font-weight: bold;
                ">
                    <span>Close</span>
                </button>
            </div>

            <div style="
                margin-top: 20px;
                padding: 15px;
                background: rgba(52, 152, 219, 0.1);
                border-radius: 8px;
                border-left: 3px solid #3498db;
            ">
                <small style="color: #3498db; font-weight: bold;">🔒 Security Features:</small>
                <ul style="margin: 10px 0 0 20px; font-size: 0.85rem; color: #95a5a6; line-height: 1.6;">
                    <li>Max 10 concurrent viewers</li>
                    <li>Auto-expires in 24 hours</li>
                    <li>Stays active 1hr after journey ends</li>
                    <li>Secure encrypted connection</li>
                </ul>
            </div>

            <p style="color: #95a5a6; font-size: 0.85rem; margin-top: 15px; text-align: center; font-style: italic;">
                Expires: ${shareData.expiresAt.toLocaleString()}
            </p>
        </div>
    `;

    document.body.appendChild(modal);

    // Store link for sharing
    window.currentShareUrl = shareData.shareUrl;
    window.currentShareUserName = userName;
}

/**
 * Copy link to clipboard
 */
function copyShareLink() {
    const input = document.getElementById('share-link-input');
    input.select();
    input.setSelectionRange(0, 99999);

    try {
        document.execCommand('copy');

        const btn = event.target.closest('button');
        const originalHTML = btn.innerHTML;
        btn.innerHTML = '<span class="btn-icon">✓</span><span>Copied!</span>';
        btn.style.background = 'linear-gradient(135deg, #27ae60, #229954)';

        setTimeout(() => {
            btn.innerHTML = originalHTML;
            btn.style.background = '';
        }, 2000);

    } catch (error) {
        navigator.clipboard.writeText(window.currentShareUrl).then(() => {
            alert('Link copied to clipboard!');
        }).catch(() => {
            alert('Please copy the link manually');
        });
    }
}


function shareViaWhatsApp() {
    const userName = window.currentShareUserName || 'User';
    const message = encodeURIComponent(
        `🛡️ Track ${userName}'s journey in real-time:\n${window.currentShareUrl}\n\nI'm sharing my live location for safety. You'll receive alerts if anything unusual is detected.`
    );

    const whatsappUrl = `https://wa.me/?text=${message}`;
    window.open(whatsappUrl, '_blank');
}

async function shareNative() {
    const userName = window.currentShareUserName || 'User';

    if (navigator.share) {
        try {
            await navigator.share({
                title: 'Sentinel GPS - Live Journey',
                text: `Track ${userName}'s journey in real-time. I'm sharing my live location for safety.`,
                url: window.currentShareUrl
            });
        } catch (error) {
            if (error.name !== 'AbortError') {
                console.log('Share cancelled or failed:', error);
            }
        }
    } else {
        const subject = encodeURIComponent('Track My Journey - Sentinel GPS');
        const body = encodeURIComponent(
            `I'm sharing my live journey with you for safety.\n\nTrack my location here:\n${window.currentShareUrl}\n\nThis link is secure and will expire in 24 hours.`
        );
        window.location.href = `mailto:?subject=${subject}&body=${body}`;
    }
}

function closeShareModal() {
    const modal = document.querySelector('.share-modal-overlay');
    if (modal) {
        modal.remove();
    }
}
