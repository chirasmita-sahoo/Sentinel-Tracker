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

async function loadStats() {
   try {
        const stats = await JourneyDB.getStats();
        
        document.getElementById('total-journeys').textContent = stats.totalJourneys;
        document.getElementById('total-distance').textContent = stats.totalDistance.toFixed(1) + ' km';

        const totalSeconds = Math.floor(stats.totalDuration / 1000);
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        document.getElementById('total-time').textContent = `${hours}h ${minutes}m`;
        
        document.getElementById('total-alerts').textContent = stats.totalAlerts;
        
    } catch (error) {
        console.error('Error loading stats:', error);
        document.getElementById('total-journeys').textContent = '0';
        document.getElementById('total-distance').textContent = '0.0 km';
        document.getElementById('total-time').textContent = '0h 0m';
        document.getElementById('total-alerts').textContent = '0';
    }
}

async function selectMode(mode) {
    const active = await JourneyDB.checkActiveJourney();
    if (active) {
        alert("You have an active journey on another device. Please end it first.");
        window.location.href = 'tracker.html';
        return;
    }
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
function goToContacts(){
    window.location.href = 'contacts.html';
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