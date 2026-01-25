auth.onAuthStateChanged((user) => {
    if (!user) {
        console.log('No user logged in - redirecting to auth');
        window.location.href = 'auth.html';
    } else {
        console.log('User logged in:', user.email);
        loadUserData(user);
    }
});

function loadUserData(user) {
    const displayName = user.displayName || user.email.split('@')[0];
    document.getElementById('display-name').textContent = displayName;
    document.getElementById('user-email').textContent = user.email;

    console.log(`👤 Loading data for: ${displayName}`);
    loadStats();
}

function loadStats() {
    const journeys = JSON.parse(localStorage.getItem('journeyHistory')) || [];
    
    let totalDistance = 0;
    let totalDuration = 0;
    let totalAlerts = 0;

    journeys.forEach(journey => {
        if (journey.distance) {
            totalDistance += journey.distance;
        }
        if (journey.duration) {
            totalDuration += journey.duration;
        }
        if (journey.alerts) {
            totalAlerts += journey.alerts.length || 0;
        }
    });
    document.getElementById('total-journeys').textContent = journeys.length;
    document.getElementById('total-distance').textContent = totalDistance.toFixed(1) + ' km';
    
    const hours = Math.floor(totalDuration / 3600);
    const minutes = Math.floor((totalDuration % 3600) / 60);
    document.getElementById('total-time').textContent = `${hours}h ${minutes}m`;
    
    document.getElementById('total-alerts').textContent = totalAlerts;

    console.log(`📊 Stats loaded: ${journeys.length} journeys, ${totalDistance.toFixed(1)} km`);
}

function selectMode(mode) {
    localStorage.setItem('userTransportMode', mode);
    const modeNames = {
        'walking': 'Walking',
        'car': 'Car/Bike',
        'train': 'Train/Bus'
    };
    
    console.log(`🚀 Mode selected: ${modeNames[mode]}`);
    window.location.href = 'tracker.html';
}
function goToHistory() {
    window.location.href = 'history.html';
}

async function handleLogout() {
    if (confirm('Are you sure you want to logout?')) {
        try {
            await auth.signOut();
            console.log('Logged out successfully');
            window.location.href = 'index.html';
        } catch (error) {
            console.error('Logout error:', error);
            alert('Error logging out. Please try again.');
        }
    }
}