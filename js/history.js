
// Configuration
const CONFIG = {
    MAX_JOURNEYS: 50,
    STORAGE_KEY: 'journeyHistory',
    LOAD_DELAY: 100,
    CALCULATION_THROTTLE: 16
};

// Rate limiter for calculations
let calculationTimeout = null;


firebase.auth().onAuthStateChanged(async (user) => {
    if (user) {
        showLoadingIndicator();
        await loadHistory();
        
        if (navigator.onLine && typeof OfflineSync !== 'undefined') {
            await OfflineSync.autoSync();
            await loadHistory(); 
        }
        hideLoadingIndicator();
    } else {
        window.location.href = 'auth.html';
    }
});

// MAIN FUNCTIONS

async function loadHistory() {
    try {
        const history =await getJourneyHistory();
        const container = document.getElementById('history-list');

        if (!container) {
            console.error('History list container not found');
            return;
        }

        // Handle empty state
        if (history.length === 0) {
            displayEmptyState(container);
            updateStatistics(0, 0, 0);
            return;
        }
        throttledCalculateStatistics(history);
        renderJourneyCards(history, container);

    } catch (error) {
        console.error('Failed to load journey history:', error);
        console.error('Error stack:', error.stack);
        displayErrorState();
    }
}

async function getJourneyHistory() {
    try {
        let history = [];
        
        // Try to load from Firestore (cloud) first
        if (navigator.onLine && typeof JourneyDB !== 'undefined') {
            try {
                history = await JourneyDB.getUserJourneys();
                console.log(`Loaded ${history.length} journeys from cloud`);
            } catch (error) {
                console.error('Error loading from Firestore:', error);
                console.error('Full error:', error.message, error.code);
                const data = localStorage.getItem(CONFIG.STORAGE_KEY);
                if (data) {
                    history = JSON.parse(data);
                    console.log('Loaded from localStorage (fallback)');
                }else{
                    console.log('No localStorage data found');
                }
            }
        } else {
            console.log('Offline or JourneyDB not available');
            const data = localStorage.getItem(CONFIG.STORAGE_KEY);
            if (data) {
                history = JSON.parse(data);
                console.log('Loaded from localStorage (offline)');
            }else {
                console.log('No localStorage data found');
            }
        }

        if (!Array.isArray(history)) {
            console.warn('Journey history is not an array, resetting');
            return [];
        }
        const filtered=history.filter(journey => {
            const valid = journey &&
                typeof journey === 'object' &&
                journey.mode &&
                typeof journey.mode === 'string' &&
                journey.startTime;
                if (!valid) {
                console.warn('Invalid journey filtered out:', journey);
            }
            
            return valid;
        });
        console.log(`Returning ${filtered.length} valid journeys`);
        return filtered;
    
    } catch (error) {
        console.error('Failed to load journey history:', error);
        console.error('Error stack:', error.stack);
        return [];
    }
}

// RENDERING FUNCTIONS

function renderJourneyCards(history, container) {
    container.innerHTML = '';

    const fragment = document.createDocumentFragment();

    history.forEach(journey => {
        try {
            const card = createJourneyCard(journey);
            fragment.appendChild(card);
        } catch (error) {
            console.error('Failed to render journey card:', error, journey);
        }
    });

    container.appendChild(fragment);
}

function createJourneyCard(journey) {
    const card = document.createElement('div');
    card.className = 'journey-card';
    card.setAttribute('data-journey-id', journey.id);

    const date = journey.startTime instanceof Date 
        ? journey.startTime 
        : new Date(journey.startTime);
    const duration = calculateDuration(journey.duration);
    const avgSpeed = calculateAverageSpeed(journey.distance, journey.duration);
    const pathPoints = journey.pathPoints 
        ? journey.pathPoints.length 
        : (journey.path ? journey.path.length : 0);

    card.innerHTML = `
        <div class="journey-header">
            <span class="journey-mode">
                <span class="mode-icon">${getModeIcon(journey.mode)}</span>
                <span>${escapeHtml(journey.mode).toUpperCase()}</span>
            </span>
            <span class="journey-date">${formatDate(date)}</span>
        </div>
        <div class="journey-stats">
            <div class="stat">
                <span class="stat-value-small">${journey.distance || '0.00'}</span>
                <span class="stat-label-small">Distance (km)</span>
            </div>
            <div class="stat">
                <span class="stat-value-small">${duration}</span>
                <span class="stat-label-small">Duration (min)</span>
            </div>
            <div class="stat">
                <span class="stat-value-small">${avgSpeed}</span>
                <span class="stat-label-small">Avg Speed (km/h)</span>
            </div>
            <div class="stat">
                <span class="stat-value-small">${pathPoints}</span>
                <span class="stat-label-small">GPS Points</span>
            </div>
        </div>
    `;

    return card;
}

function displayEmptyState(container) {
    const offlineMessage = !navigator.onLine ? '<p style="color: #f39c12; margin-top: 10px;">📴 You are offline. Journeys will appear when online.</p>' : '';
    container.innerHTML = `
        <div class="no-history">
            <div class="no-history-icon">📭</div>
            <h2>No Journey History Yet</h2>
            <p>Your completed journeys will appear here.<br>
            Start your first journey to build your travel history!</p>
            ${offlineMessage}
        </div>
    `;
}

function displayErrorState() {
    const container = document.getElementById('history-list');
    if (!container) return;

    container.innerHTML = `
        <div class="no-history">
            <div class="no-history-icon">⚠️</div>
            <h2>Unable to Load History</h2>
            <p>There was an error loading your journey history.<br>
            Please try refreshing the page.</p>
        </div>
    `;
}


function throttledCalculateStatistics(history) {
    if (calculationTimeout) {
        clearTimeout(calculationTimeout);
    }

    calculationTimeout = setTimeout(() => {
        calculateStatistics(history);
    }, CONFIG.CALCULATION_THROTTLE);
}

function calculateStatistics(history) {
    try {
        let totalDistance = 0;
        let totalDuration = 0;

        history.forEach(journey => {
            const distance = parseFloat(journey.distance) || 0;
            const duration = parseInt(journey.duration) || 0;

            totalDistance += distance;
            totalDuration += duration;
        });
        const totalHours = totalDuration / 3600000;

        updateStatistics(history.length, totalDistance, totalHours);

    } catch (error) {
        console.error('Failed to calculate statistics:', error);
        updateStatistics(0, 0, 0);
    }
}

function updateStatistics(journeys, distance, hours) {
    const journeysEl = document.getElementById('total-journeys');
    const distanceEl = document.getElementById('total-distance');
    const timeEl = document.getElementById('total-time');

    if (journeysEl) {
        journeysEl.innerText = journeys;
    }

    if (distanceEl) {
        distanceEl.innerText = distance.toFixed(1);
    }

    if (timeEl) {
        timeEl.innerText = hours.toFixed(1);
    }
}

function getModeIcon(mode) {
    if (typeof mode !== 'string') return '🚶';

    const icons = {
        'walking': '🚶',
        'car': '🚗',
        'train': '🚆',
        'bus': '🚌',
        'bike': '🚴',
        'motorcycle': '🏍️'
    };

    return icons[mode.toLowerCase()] || '🚶';
}

function escapeHtml(text) {
    if (typeof text !== 'string') return '';
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function formatDate(date) {
    try {
        const options = {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        };

        return date.toLocaleDateString('en-US', options);
    } catch (error) {
        console.error('Date formatting error:', error);
        return 'Invalid Date';
    }
}

function calculateDuration(durationMs) {
    if (!durationMs || isNaN(durationMs)) {
        return '0';
    }

    const minutes = Math.round(durationMs / 60000);

    if (minutes < 60) {
        return minutes.toString();
    }

    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}m`;
}

function calculateAverageSpeed(distance, durationMs) {
    if (!distance || !durationMs || durationMs === 0) {
        return '0.0';
    }

    const hours = durationMs / 3600000; // ms to hours
    const speed = parseFloat(distance) / hours;

    return speed.toFixed(1);
}



async function clearAllHistory() {
    const confirmed = window.confirm(
        'Are you sure you want to clear all journey history?\n\n' +
        'This action cannot be undone and will permanently delete all your journey records from all devices.'
    );

    if (!confirmed) {
        return;
    }
try{showTemporaryMessage('🔄 Clearing history...');
    
        if (navigator.onLine && typeof JourneyDB !== 'undefined') {
            try {
                const journeys = await JourneyDB.getUserJourneys();
                for (const journey of journeys) {
                    if (journey.id) {
                        await JourneyDB.deleteJourney(journey.id);
                    }
                }
                console.log('✅ Cleared cloud history');
            } catch (error) {
                console.error('Error clearing cloud history:', error);
            }
        }
        localStorage.removeItem(CONFIG.STORAGE_KEY);
        if (typeof OfflineSync !== 'undefined') {
            localStorage.removeItem('pendingJourneys');
        }
        
        await loadHistory();
        showTemporaryMessage('✅ History cleared successfully');

    } catch (error) {
        console.error('Failed to clear history:', error);
        showTemporaryMessage('❌ Failed to clear history');
    }
}

function goBack() {
    if (window.history.length > 1) {
        window.history.back();
    } else {
        window.location.href = 'index.html';
    }
}

// UI FEEDBACK
function showLoadingIndicator() {
    const loading = document.getElementById('loading-indicator');
    if (loading) {
        loading.classList.remove('hidden');
    }
}

function hideLoadingIndicator() {
    const loading = document.getElementById('loading-indicator');
    if (loading) {
        loading.classList.add('hidden');
    }
}

function showTemporaryMessage(message, duration = 3000) {
    const messageEl = document.createElement('div');
    messageEl.style.cssText = `
        position: fixed;
        top: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(0, 0, 0, 0.9);
        color: white;
        padding: 15px 30px;
        border-radius: 10px;
        z-index: 10000;
        font-size: 1rem;
        box-shadow: 0 5px 20px rgba(0, 0, 0, 0.5);
        animation: slideDown 0.3s ease;
    `;
    messageEl.innerText = message;

    document.body.appendChild(messageEl);

    setTimeout(() => {
        messageEl.style.animation = 'slideUp 0.3s ease';
        setTimeout(() => {
            document.body.removeChild(messageEl);
        }, 300);
    }, duration);
}

//animations
const style = document.createElement('style');
style.textContent = `
    @keyframes slideDown {
        from {
            transform: translateX(-50%) translateY(-100%);
            opacity: 0;
        }
        to {
            transform: translateX(-50%) translateY(0);
            opacity: 1;
        }
    }
    
    @keyframes slideUp {
        from {
            transform: translateX(-50%) translateY(0);
            opacity: 1;
        }
        to {
            transform: translateX(-50%) translateY(-100%);
            opacity: 0;
        }
    }
`;
document.head.appendChild(style);


// ERROR RECOVERY

window.addEventListener('error', (event) => {
    console.error('Global error:', event.error);

});

window.addEventListener('unhandledrejection', (event) => {
    console.error('Unhandled promise rejection:', event.reason);
});