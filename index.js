let map;
let isMapInitialized = false;
let userMarker = null;
document.addEventListener('DOMContentLoaded', () => {
    initializeMap();
    console.log('✅ Landing page initialized');
});

// --- 1. Map Logic --- //
function initializeMap() {
    map = L.map('map', {
        preferCanvas: true,
        zoomControl: false
    }).setView([40.7128, -74.0060], 13); 

    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; CARTO',
        subdomains: 'abcd',
        maxZoom: 20
    }).addTo(map);

    add3DMarker(40.7128, -73.9960);
    
    isMapInitialized = true;
    map.on('dblclick', function(e) {
        const clickedLat = e.latlng.lat;
        const clickedLng = e.latlng.lng;
        
        // Move the marker to the clicked coordinates
        add3DMarker(clickedLat, clickedLng);
        
        console.log(`Pin moved to: ${clickedLat}, ${clickedLng}`);
    });
}

const pulsingIcon = L.divIcon({
    className: 'custom-pulse-marker', // We will style this in CSS
    // Inject both the pulse ring AND your asset image
    html: `
        <div class="pulse-ring"></div>
        <img src="assets/redicon.png" class="marker-image" alt="User Location">
    `,
    iconSize: [48, 48], // Total size of the container
    iconAnchor: [24, 48], // Point that touches the exact GPS coordinate (bottom center)
    popupAnchor: [0, -48]
});
function add3DMarker(lat, lng) {
    if (userMarker) {
        userMarker.setLatLng([lat, lng]);
    } else {
        userMarker = L.marker([lat, lng], {
            icon: pulsingIcon
        }).addTo(map);
    }
}

// --- 2. Firebase Auth Listener --- //
auth.onAuthStateChanged((user) => {
    const guestView = document.getElementById('guest-view');
    const userView = document.getElementById('user-view');
    
    if (user) {
        // User is Logged In
        guestView.style.display = 'none';
        userView.style.display = 'block';
        
        const displayName = user.displayName || user.email.split('@')[0];
        document.getElementById('user-name').textContent = displayName;
        
        console.log('User is logged in:', user.email);

        // Fly the map to the user's location upon login
        if (isMapInitialized) {
            const userLat = 40.7150;
            const userLng = -73.9900;
            
            add3DMarker(userLat, userLng);
            map.flyTo([userLat, userLng], 14, {
                animate: true,
                duration: 1.5
            });
        }

    } else {
        // No User Logged In
        guestView.style.display = 'block';
        userView.style.display = 'none';
        console.log('No user logged in');
        
        // Reset map to default view if they just logged out
        if (isMapInitialized) {
            map.flyTo([40.7128, -74.0060], 13);
        }
    }
});

// --- 3. Logout Handling --- //
async function handleLogout() {
    if (confirm('Are you sure you want to logout?')) {
        try {
            await auth.signOut();
            console.log('✅ Logged out successfully');
            Toastify({
                text: "Logged out successfully",
                duration: 3000,
                gravity: "top", position: "right",
                style: { background: "#1A1D23", color: "#ffffff", borderRadius: "8px" }
            }).showToast();
        } catch (error) {
            console.error('❌ Logout error:', error);
            alert('Error logging out. Please try again.');
        }
    }
}