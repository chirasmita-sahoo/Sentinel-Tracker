// js/viewer.js - Simplified Secure Journey Viewer with Offline Support

class SimpleJourneyViewer {
    constructor() {
        this.map = null;
        this.userMarker = null;
        this.pathPolyline = null;
        this.tokenHash = null;
        this.journeyId = null;
        this.userName = null;
        this.unsubscribeLocation = null;
        this.unsubscribeJourney = null;
        this.lastLocation = null;
        this.isOffline = false;
        this.heartbeatInterval = null;
        this.viewerRegistered = false;
        this.destinationCoords = null;
        this.durationInterval = null;
    }

    /**
     * Initialize viewer
     */
    async init() {
        try {
            // Get token from URL
            const urlParams = new URLSearchParams(window.location.search);
            // Replace any accidental spaces back to pluses if they were URL decoded improperly
            const rawToken = urlParams.get('t');
            if (!rawToken) {
                this.showError('Invalid Link', 'No share token found in URL.');
                return;
            }

            const token = rawToken.replace(/ /g, '+');

            // Rate limiting check
            const clientId = await this.getClientFingerprint();
            if (!shareManager.checkRateLimit(clientId)) {
                this.showError('Too Many Requests', 'Please wait a moment before trying again.');
                return;
            }

            // Anti-bot checking
            if (shareManager.isBot()) {
                this.showError('Access Denied', 'Automated access detected.');
                return;
            }

            // Proof-of-Work challenge
            const loadingText = document.querySelector('#loading-screen div:last-child');
            if (loadingText) loadingText.textContent = 'Verifying security connection...';
            // Allow UI to update before blocking CPU
            await new Promise(resolve => setTimeout(resolve, 50));
            const pow = shareManager.generateChallenge();
            const solution = await shareManager.solveChallenge(pow.challenge, pow.difficulty);
            if (loadingText) loadingText.textContent = 'Validating share link...';

            // Validate token
            const validation = await shareManager.validateToken(token, {
                challenge: pow.challenge,
                difficulty: pow.difficulty,
                nonce: solution.nonce,
                hash: solution.hash
            });

            this.tokenHash = validation.tokenHash;
            this.journeyId = validation.journeyId;
            this.userName = validation.userName;

            // Register as active viewer
            await shareManager.registerViewer(this.tokenHash);
            this.viewerRegistered = true;

            // Update UI with user name
            document.getElementById('user-name').textContent = this.userName;

            // Initialize map
            this.initMap();

            // Check journey status
            if (validation.journeyStatus === 'pending') {
                this.showPreJourneyState();
            } else {
                this.startRealTimeUpdates();
            }

            // Show viewer
            document.getElementById('loading-screen').classList.add('hidden');
            document.getElementById('viewer-container').classList.add('active');

            // Setup heartbeat to maintain viewer count
            this.startHeartbeat();

            // Handle page unload
            this.setupUnloadHandler();

        } catch (error) {
            console.error('Viewer initialization error:', error);
            this.showError('Access Denied', error.message);
        }
    }

    /**
     * Initialize map
     */
    initMap() {
        this.map = L.map('viewer-map', {
            zoomControl: true,
            attributionControl: false
        }).setView([0, 0], 2);

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
        }).addTo(this.map);

        // User marker
        this.userMarker = L.marker([0, 0], {
            icon: L.divIcon({
                className: 'user-marker',
                html: `
                    <div style="
                        background-color: #2ecc71;
                        height: 20px;
                        width: 20px;
                        border-radius: 50%;
                        border: 3px solid white;
                        box-shadow: 0 0 15px #2ecc71;
                        position: relative;
                    ">
                        <div class="pulse-ring"></div>
                    </div>
                    <style>
                        .pulse-ring {
                            position: absolute;
                            width: 100%;
                            height: 100%;
                            border-radius: 50%;
                            background: rgba(46, 204, 113, 0.4);
                            animation: pulse 2s infinite;
                        }
                        @keyframes pulse {
                            0% { transform: scale(1); opacity: 1; }
                            100% { transform: scale(2.5); opacity: 0; }
                        }
                    </style>
                `,
                iconSize: [20, 20],
                iconAnchor: [10, 10]
            })
        }).addTo(this.map);

        // Path polyline
        this.pathPolyline = L.polyline([], {
            color: '#3498db',
            weight: 4,
            opacity: 0.7,
            smoothFactor: 1
        }).addTo(this.map);

        setTimeout(() => {
            this.map.invalidateSize();
        }, 300);
    }

    /**
     * Show pre-journey state
     */
    showPreJourneyState() {
        document.getElementById('status-badge').textContent = 'NOT STARTED';
        document.getElementById('status-badge').className = 'status-badge status-pending';

        document.getElementById('current-coords').textContent = 'Waiting for journey to start...';
        document.getElementById('speed-stat').textContent = '-- km/h';
        document.getElementById('distance-stat').textContent = '-- km';
        document.getElementById('duration-stat').textContent = '--:--';

        // Show waiting message
        const waitingDiv = document.createElement('div');
        waitingDiv.id = 'waiting-message';
        waitingDiv.style.cssText = `
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(0, 0, 0, 0.9);
            padding: 30px;
            border-radius: 15px;
            text-align: center;
            z-index: 1000;
        `;
        waitingDiv.innerHTML = `
            <div style="font-size: 3rem; margin-bottom: 15px;">⏳</div>
            <h3 style="color: #3498db; margin-bottom: 10px;">${this.userName} has not started journey yet</h3>
            <p style="color: #95a5a6;">Waiting for journey to begin...</p>
            <div class="spinner" style="margin: 20px auto;"></div>
        `;
        document.getElementById('viewer-map').appendChild(waitingDiv);

        // Listen for journey start
        this.waitForJourneyStart();
    }

    /**
     * Wait for journey to start
     */
    waitForJourneyStart() {
        this.unsubscribeJourney = firebase.firestore()
            .collection('shareLinks')
            .doc(this.tokenHash)
            .onSnapshot((doc) => {
                if (doc.exists) {
                    const data = doc.data();
                    if (data.journeyStatus === 'active') {
                        // Journey started!
                        const waitingMsg = document.getElementById('waiting-message');
                        if (waitingMsg) waitingMsg.remove();

                        this.startRealTimeUpdates();
                    }
                }
            });
    }

    /**
     * Start real-time location updates
     */
    startRealTimeUpdates() {
        // Update status badge
        document.getElementById('status-badge').textContent = 'LIVE';
        document.getElementById('status-badge').className = 'status-badge status-active';

        // Subscribe to journey document for status
        this.unsubscribeJourney = firebase.firestore()
            .collection('journeys')
            .doc(this.journeyId)
            .onSnapshot((doc) => {
                if (doc.exists) {
                    const data = doc.data();
                    this.updateJourneyStatus(data.status);

                    // Update destination
                    if (data.destination) {
                        this.destinationCoords = {
                            lat: data.destination.lat,
                            lng: data.destination.lng
                        };
                        document.getElementById('destination').textContent =
                            data.destination.name || `${data.destination.lat.toFixed(4)}, ${data.destination.lng.toFixed(4)}`;
                    }
                }
            });

        // Subscribe to location updates (throttled to 5 seconds)
        let lastUpdate = 0;
        this.unsubscribeLocation = firebase.firestore()
            .collection('journeys')
            .doc(this.journeyId)
            .collection('locations')
            .orderBy('timestamp', 'desc')
            .limit(100)
            .onSnapshot((snapshot) => {
                const now = Date.now();
                if (now - lastUpdate < 5000) return; // Throttle to 5 seconds
                lastUpdate = now;

                const locations = [];
                snapshot.forEach(doc => {
                    const data = doc.data();
                    locations.push({
                        lat: data.lat,
                        lng: data.lng,
                        timestamp: data.timestamp ? data.timestamp.toDate() : new Date(),
                        speed: data.speed || 0,
                        accuracy: data.accuracy || 0
                    });
                });

                if (locations.length > 0) {
                    locations.reverse();
                    const current = locations[locations.length - 1];

                    // Update current location
                    this.updateLocation(current);

                    // Update path
                    const pathCoords = locations.map(loc => [loc.lat, loc.lng]);
                    this.pathPolyline.setLatLngs(pathCoords);

                    // Center map on current location
                    this.map.setView([current.lat, current.lng], 15);

                    // Check if offline
                    this.checkOfflineStatus(current.timestamp);
                }
            }, (error) => {
                console.error('Error in location updates:', error);
                this.showOfflineIndicator();
            });

        // Subscribe to alerts
        this.subscribeToAlerts();

        // Start duration timer
        this.startDurationTimer();
    }

    /**
     * Update location display
     */
    updateLocation(location) {
        this.lastLocation = location;
        this.isOffline = false;

        // Update marker
        this.userMarker.setLatLng([location.lat, location.lng]);

        // Update UI
        document.getElementById('current-coords').textContent =
            `${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}`;

        document.getElementById('speed-stat').textContent =
            `${location.speed.toFixed(1)} km/h`;

        // Compute and update distance to destination
        if (this.destinationCoords) {
            const distKm = this.haversineDistance(
                location.lat, location.lng,
                this.destinationCoords.lat, this.destinationCoords.lng
            );
            document.getElementById('distance-stat').textContent =
                `${distKm.toFixed(2)} km`;
        }

        // Update last update time
        this.updateLastUpdateDisplay(location.timestamp);

        // Hide offline indicator if showing
        this.hideOfflineIndicator();
    }

    /**
     * Check if user went offline
     */
    checkOfflineStatus(lastTimestamp) {
        const now = new Date();
        const timeSinceUpdate = now - lastTimestamp;

        // If no update for 30 seconds, mark as possibly offline
        if (timeSinceUpdate > 30000) {
            this.showOfflineIndicator();
        }
    }

    /**
     * Show offline indicator
     */
    showOfflineIndicator() {
        this.isOffline = true;

        let indicator = document.getElementById('offline-indicator');
        if (!indicator) {
            indicator = document.createElement('div');
            indicator.id = 'offline-indicator';
            indicator.style.cssText = `
                position: absolute;
                top: 70px;
                right: 20px;
                background: rgba(231, 76, 60, 0.95);
                padding: 12px 20px;
                border-radius: 25px;
                color: white;
                font-weight: bold;
                z-index: 1000;
                box-shadow: 0 5px 15px rgba(231, 76, 60, 0.4);
                animation: blink 1s infinite;
            `;
            indicator.innerHTML = `
                <span style="margin-right: 8px;">📡</span>
                <span>User Offline - Last Location</span>
            `;
            document.getElementById('viewer-map').appendChild(indicator);
        }

        // Change marker color to orange
        this.userMarker.setIcon(L.divIcon({
            className: 'user-marker-offline',
            html: `
                <div style="
                    background-color: #e67e22;
                    height: 20px;
                    width: 20px;
                    border-radius: 50%;
                    border: 3px solid white;
                    box-shadow: 0 0 15px #e67e22;
                "></div>
            `,
            iconSize: [20, 20],
            iconAnchor: [10, 10]
        }));

        // Update status badge
        document.getElementById('status-badge').textContent = 'OFFLINE';
        document.getElementById('status-badge').className = 'status-badge status-offline';

        // Show last known location
        if (this.lastLocation) {
            document.getElementById('current-coords').textContent =
                `Last: ${this.lastLocation.lat.toFixed(4)}, ${this.lastLocation.lng.toFixed(4)}`;
        }
    }

    /**
     * Hide offline indicator
     */
    hideOfflineIndicator() {
        const indicator = document.getElementById('offline-indicator');
        if (indicator) {
            indicator.remove();
        }

        // Restore marker to green
        this.userMarker.setIcon(L.divIcon({
            className: 'user-marker',
            html: `
                <div style="
                    background-color: #2ecc71;
                    height: 20px;
                    width: 20px;
                    border-radius: 50%;
                    border: 3px solid white;
                    box-shadow: 0 0 15px #2ecc71;
                    position: relative;
                ">
                    <div class="pulse-ring"></div>
                </div>
            `,
            iconSize: [20, 20],
            iconAnchor: [10, 10]
        }));
    }

    /**
     * Subscribe to alerts
     */
    subscribeToAlerts() {
        firebase.firestore()
            .collection('journeys')
            .doc(this.journeyId)
            .collection('alerts')
            .where('status', 'in', ['pending', 'escalated'])
            .orderBy('timestamp', 'desc')
            .limit(1)
            .onSnapshot((snapshot) => {
                snapshot.forEach(doc => {
                    const alert = doc.data();
                    this.showAlert(alert);
                });
            });
    }

    /**
     * Show alert banner
     */
    showAlert(alert) {
        const banner = document.getElementById('alert-banner');
        const icon = document.getElementById('alert-icon');
        const text = document.getElementById('alert-text');

        let message = '';
        let iconText = '🚨';

        switch (alert.type) {
            case 'deviation':
                message = '⚠️ User deviated from planned route';
                iconText = '🚨';
                break;
            case 'stationary':
                message = '⏱️ User stationary for extended period';
                iconText = '⏱️';
                break;
            case 'speed':
                message = '⚡ Unusual speed detected';
                iconText = '⚡';
                break;
            case 'emergency':
                message = '🆘 EMERGENCY ALERT ACTIVATED!';
                iconText = '🆘';
                break;
        }

        if (alert.status === 'escalated') {
            message += ' - NO RESPONSE FROM USER';
        }

        icon.textContent = iconText;
        text.textContent = message;
        banner.classList.add('active');

        // Play sound
        this.playAlertSound();

        // Show notification if permitted
        this.showNotification(message);
    }

    /**
     * Update journey status
     */
    updateJourneyStatus(status) {
        const badge = document.getElementById('status-badge');

        switch (status) {
            case 'active':
                badge.textContent = 'LIVE';
                badge.className = 'status-badge status-active';
                break;
            case 'completed':
                badge.textContent = 'COMPLETED';
                badge.className = 'status-badge status-completed';
                this.showCompletedMessage();
                break;
            case 'emergency':
                badge.textContent = '🆘 EMERGENCY';
                badge.className = 'status-badge status-emergency';
                break;
        }
    }

    /**
     * Show completed message
     */
    showCompletedMessage() {
        const message = document.createElement('div');
        message.style.cssText = `
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(46, 204, 113, 0.95);
            padding: 30px;
            border-radius: 15px;
            text-align: center;
            z-index: 1001;
            color: white;
        `;
        message.innerHTML = `
            <div style="font-size: 3rem; margin-bottom: 15px;">✅</div>
            <h3>Journey Completed Successfully</h3>
            <p style="margin-top: 10px; opacity: 0.9;">This link will remain active for 1 more hour</p>
        `;
        document.getElementById('viewer-map').appendChild(message);

        setTimeout(() => message.remove(), 5000);
    }

    /**
     * Start duration timer
     */
    async startDurationTimer() {
        let startTime = Date.now();

        // Get actual start time from journey BEFORE starting the timer
        try {
            const doc = await firebase.firestore()
                .collection('journeys')
                .doc(this.journeyId)
                .get();
            if (doc.exists && doc.data().startTime) {
                startTime = doc.data().startTime.toDate().getTime();
            }
        } catch (error) {
            console.error('Error fetching journey start time:', error);
        }

        // Clear any existing interval
        if (this.durationInterval) clearInterval(this.durationInterval);

        this.durationInterval = setInterval(() => {
            const elapsed = Date.now() - startTime;
            const hours = Math.floor(elapsed / (1000 * 60 * 60));
            const minutes = Math.floor((elapsed % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((elapsed % (1000 * 60)) / 1000);

            document.getElementById('duration-stat').textContent =
                `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        }, 1000);
    }

    /**
     * Update last update display
     */
    updateLastUpdateDisplay(timestamp) {
        const now = new Date();
        const diff = now - timestamp;
        const seconds = Math.floor(diff / 1000);

        let text;
        if (seconds < 10) text = 'Just now';
        else if (seconds < 60) text = `${seconds}s ago`;
        else if (seconds < 3600) text = `${Math.floor(seconds / 60)}m ago`;
        else text = `${Math.floor(seconds / 3600)}h ago`;

        document.getElementById('last-update-stat').textContent = text;
    }

    /**
     * Start heartbeat to maintain viewer count
     */
    startHeartbeat() {
        this.heartbeatInterval = setInterval(async () => {
            try {
                // Update last accessed timestamp
                await firebase.firestore()
                    .collection('shareLinks')
                    .doc(this.tokenHash)
                    .update({
                        lastAccessedAt: firebase.firestore.FieldValue.serverTimestamp()
                    });
            } catch (error) {
                console.error('Heartbeat error:', error);
            }
        }, 30000); // Every 30 seconds
    }

    /**
     * Setup page unload handler
     */
    setupUnloadHandler() {
        window.addEventListener('beforeunload', async () => {
            await this.cleanup();
        });

        // Also handle visibility change
        document.addEventListener('visibilitychange', async () => {
            if (document.hidden) {
                // Page hidden but don't unregister yet
                console.log('Page hidden');
            }
        });
    }

    /**
     * Cleanup on exit
     */
    async cleanup() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
        }

        if (this.durationInterval) {
            clearInterval(this.durationInterval);
        }

        if (this.unsubscribeLocation) {
            this.unsubscribeLocation();
        }

        if (this.unsubscribeJourney) {
            this.unsubscribeJourney();
        }

        if (this.viewerRegistered && this.tokenHash) {
            await shareManager.unregisterViewer(this.tokenHash);
        }
    }

    /**
     * Play alert sound
     */
    playAlertSound() {
        try {
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();

            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);

            oscillator.frequency.value = 800;
            oscillator.type = 'sine';
            gainNode.gain.setValueAtTime(0.2, audioContext.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);

            oscillator.start(audioContext.currentTime);
            oscillator.stop(audioContext.currentTime + 0.5);
        } catch (error) {
            console.error('Error playing sound:', error);
        }
    }

    /**
     * Show browser notification
     */
    async showNotification(message) {
        if ('Notification' in window && Notification.permission === 'granted') {
            new Notification('Sentinel GPS Alert', {
                body: message,
                icon: '/icon.png',
                vibrate: [200, 100, 200]
            });
        }
    }

    /**
     * Haversine distance between two lat/lng points in km
     */
    haversineDistance(lat1, lng1, lat2, lng2) {
        const R = 6371; // Earth's radius in km
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLng = (lng2 - lng1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLng / 2) * Math.sin(dLng / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    /**
     * Get client fingerprint for rate limiting
     */
    async getClientFingerprint() {
        return await shareManager.generateDeviceFingerprint();
    }

    /**
     * Show error screen
     */
    showError(title, message) {
        document.getElementById('loading-screen').classList.add('hidden');
        document.getElementById('error-title').textContent = title;
        document.getElementById('error-message').textContent = message;
        document.getElementById('error-screen').classList.add('active');
    }
}

// Initialize viewer
let viewer;

window.addEventListener('DOMContentLoaded', async () => {
    viewer = new SimpleJourneyViewer();
    await viewer.init();
});

// Cleanup on unload
window.addEventListener('beforeunload', async () => {
    if (viewer) {
        await viewer.cleanup();
    }
});