# 🛡️ Sentinel: Real-Time Security GPS Tracker

Sentinel is a geo-spatial safety application designed for solo travelers. It provides high-tech monitoring through real-time GPS tracking, path visualization, and anomaly detection to ensure users stay on their intended route.

## 🚀 Live Demo
**[https://chirasmita-sahoo.github.io/Sentinel-Tracker/]

## ✨ Current Features
* **Dynamic UI State Management:** Seamless transition from a setup mode to an active monitoring dashboard using CSS3 transitions.
* **Live Path Visualization:** Renders a real-time "breadcrumb trail" of the user's journey using the Leaflet.js library.
* **Integrated Safety Geofencing:** Establishes a 100-meter "Safe Zone" to confirm signal accuracy before departure.
* **Anomaly Detection Logic:** * **Route Deviation:** Alerts the user if the distance to the destination increases.
    * **Speed Monitoring:** Detects if a walking user moves at vehicular speeds (>12 km/h).

## 🛠️ Tech Stack
* **Frontend:** HTML5, CSS3, JavaScript (ES6+)
* **Maps:** Leaflet.js / Web Geolocation API
* **Storage:** LocalStorage API

---

## 🧠 Future Roadmap
I am currently researching and developing the following modules to transition this prototype into a comprehensive safety ecosystem:

### 📍 Phase 1: Advanced Monitoring (Short-term)
* **Stationary Alert System:** Implementing logic to detect if a user remains stationary for >5 minutes in an unauthorized zone, triggering a safety check-in.
* **Smart Proximity Alerts:** Automatic "Arrival" notifications and automated check-ins when within 50 meters of the destination.
* **Battery-Adaptive GPS:** Optimizing location polling rates to preserve device battery during long-duration tracking.

### 🛡️ Phase 2: Emergency Response (Mid-term)
* **One-Tap SOS:** A panic button to instantly share encrypted coordinates with emergency contacts via SMS/Email.
* **Safe-Route Engine:** Integrating data to suggest routes with better lighting and higher foot traffic.
* **Voice Triggers:** Hands-free alert activation using the Web Speech API.

### 🌐 Phase 3: Reliability & Scale (Long-term)
* **Offline Functionality:** Utilizing Service Workers and Cache API for "dead zone" tracking.
* **PWA Integration:** Converting Sentinel into a Progressive Web App for home-screen access.

---

## 📂 Project Structure
```text
/Sentinel-Tracker
│── index.html          # Landing & Mode Selection
│── tracker.html        # Main Security Dashboard
│── tracker.js          # GPS & Security Logic
└── README.md           # Documentation
