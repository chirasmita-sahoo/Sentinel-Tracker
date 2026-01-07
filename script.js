//variables
let totalDistance = 0;//simulate: moving the driver marker every  5seconds
let lastdistanceToGoal = null;
let hasArrived = false; // Variable to ensure the alert only triggers once
let speedArray = [];//speed array for avgspeed calculation
const maxSpeedRecords = 5; // Number of records to keep for averaging
let TREND='stable'; // route trend
 //Initialize the map
        var map = L.map('map',{
            zoomControl: false
        }).setView([12.9716, 77.5946], 13);

        L.control.zoom({
            position: 'bottomright'
        }).addTo(map);
        //Add OpenStreetMap tile layer
        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxzoom: 19,
            attribution: '© OpenStreetMap '
        }).addTo(map);
        //Destination to reach
        const goalcoord=[12.98, 77.60];
  //pulse effect for goal marker
     var pulseIcon = L.divIcon({
    className: 'goal-pulse-container', // Wrapper
    html: '<div class="goal-pulse"></div>', // The pulsing circle
    iconSize: [20, 20],
    iconAnchor: [10, 10]
});

// 2. Add the pulse to the map at the same location as your red marker
L.marker(goalcoord, { icon: pulseIcon }).addTo(map);
        //marker for goal
        var goalMarker = L.marker(goalcoord,{
            icon: L.icon({
        iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png',
        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
        iconSize: [25, 41],
        iconAnchor: [12, 41]})
    
         }).addTo(map)
            .bindPopup('Goal Location');
          
        //Add geofence circle around goal
        var goalCircle = L.circle(goalcoord, {
    color: 'green',
    fillColor: '#2ecc71',
    fillOpacity: 0.2,
    radius: 500 // 500 meters
}).addTo(map);
        //Add a marker for the driver
        var driverMarker = L.marker([12.9716, 77.5946]).addTo(map)
            .bindPopup('Driver 1: Moving')
            .openPopup();
        //Track history:by storing pst coord
        var pathCoordinates = [[12.9716, 77.5946]];

        //creating polyline and adding it to map
        var polyline = L.polyline(pathCoordinates, {
            color: 'red',
            weight: 4,
            opacity: 0.7,
            smoothFactor: 1.5,
        }).addTo(map);

    
function moveMarker(marker, startLatLng, endLatLng, duration) {
    const start = performance.now();

    function animate(currentTime) {
        const elapsed = currentTime - start;
        const progress = Math.min(elapsed / duration, 1); // Range 0 to 1

        // Calculate intermediate Latitude and Longitude
        const lat = startLatLng.lat + (endLatLng.lat - startLatLng.lat) * progress;
        const lng = startLatLng.lng + (endLatLng.lng - startLatLng.lng) * progress;

        marker.setLatLng([lat, lng]);

        if (progress < 1) {
            requestAnimationFrame(animate); // Smoothly call the next frame
        }
    }

    requestAnimationFrame(animate);
}


function getDistanceInKm(lat1, lng1, lat2, lng2) {
    const start = L.latLng(lat1, lng1);
    const destination = L.latLng(lat2, lng2);
    return start.distanceTo(destination) / 1000; // Return the result!
}


function calculateSpeed(distanceKm) {
    const timeInHours = 2 / 3600; // 2 seconds converted to hours
    const speed = distanceKm / timeInHours;
    speedArray.push(speed);

    // Keep only the last 'maxSpeedRecords' speeds
    if (speedArray.length > maxSpeedRecords) {
        speedArray.shift();
    }   
    // Calculate average speed
    const avgSpeed = speedArray.reduce((a, b) => a + b, 0) / speedArray.length;

    
    const speedDisplay = document.getElementById('speed');
    if (speedDisplay) {
        speedDisplay.innerText = avgSpeed.toFixed(2) + ' km/h';
        if (avgSpeed > 60) {
            speedDisplay.style.color = "#e74c3c"; // Red for speeding
        } else {
            speedDisplay.style.color = "white"; // Normal color
        }
    }
    return avgSpeed; // Return the result so updateGoalUI can use it!
}

let currentstate = 'ENROUTE'; // Initial state
function updateGoalUI(distToGoal, currentSpeed, timerId, TREND) {
    const goalDisplay = document.getElementById('goaldist');
    const statusDisplay = document.getElementById('status'); // Make sure to add this ID in HTML

    if (!goalDisplay) return;

    // 1. Update the Distance Text
    goalDisplay.innerText = distToGoal.toFixed(2) + " km";

   let trendIcon = "";
    if (TREND === "closer") {
        trendIcon = " 🟢"; // Green dot for moving closer
        statusDisplay.classList.remove('status-warning');
        statusDisplay.classList.add('status-normal');
    } else if (TREND === "diverting") {
        trendIcon = " ⚠️ (Away)";
        statusDisplay.classList.add('status-warning');
    } else {
        statusDisplay.classList.remove('status-warning');
    }
    
    // 2. Logic for Color and Status Updates
    if (distToGoal < 0.1) {
        // ARRIVED
        currentstate = 'ARRIVED';
        goalDisplay.style.color = "#2ecc71"; // Bright Green
        if (statusDisplay) statusDisplay.innerText = "Arrived at Destination " + trendIcon;
        clearInterval(timerId); // Stop further updates
        // Trigger Alert once
        if (!hasArrived) {
            hasArrived = true;
            alert("🏁 Goal Reached! The driver has arrived.");

        }
    } 
    else if (distToGoal <=goalCircle.getRadius()/1000) {
        // NEARBY
        currentstate = 'NEARBY';
        goalDisplay.style.color = "#f1c40f"; // Yellow
        goalDisplay.style.fontWeight = "bold";
        if (statusDisplay) statusDisplay.innerText = "Arriving Soon..."+ trendIcon;
    } 
    else {
        // ON THE WAY
        currentstate = 'ENROUTE';
        goalDisplay.style.color = "white";
        goalDisplay.style.fontWeight = "normal";
        if (statusDisplay) statusDisplay.innerText = "On the way..." + trendIcon;
    }

    // 3. Optional: Visual indicator for Speeding
    const speedDisplay = document.getElementById('speed');
    if (speedDisplay) {
        speedDisplay.style.color = currentSpeed > 60 ? "#e74c3c" : "white"; // Red if over 60km/h
    }
}



  const interval = setInterval(() => {
            //Generate small random changes in lat and lng
            let latchange = (Math.random() - 0.5) * 0.01;
            let lngchange = (Math.random() - 0.5) * 0.01;
           let currentpos= driverMarker.getLatLng();
           let newpos= [currentpos.lat + latchange, currentpos.lng + lngchange]; 
           let distance = currentpos.distanceTo(newpos)/1000; //in km
           let speed = 0; // Initialize speed variable
           let dist =getDistanceInKm(newpos[0], newpos[1], goalcoord[0], goalcoord[1]); 

           if(lastdistanceToGoal !== null){
            if(dist < lastdistanceToGoal-0.001){
                TREND='closer';
            }else if(dist > lastdistanceToGoal+0.001){
                TREND='diverting';
            }
            else{ TREND='stable'; }
            }
           lastdistanceToGoal = dist;
           if(distance > 0.005){
           totalDistance += distance;
           speed = calculateSpeed(distance);
           
           }

           //Update distance to goal
           updateGoalUI(dist, speed, interval, TREND);
            //Update marker position
            moveMarker(driverMarker, currentpos, L.latLng(newpos[0], newpos[1]), 2000);
            //Update path coordinates
            pathCoordinates.push(newpos);
            polyline.setLatLngs(pathCoordinates);
            // Only center map if marker gets close to the edges
            map.setView(newpos, map.getZoom(), {
    animate: true,
    pan: {
        duration: 2.0, // Match your interval exactly
        easeLinearity: 1.0 // This is the secret! It removes the "stutter"
    }
});
            //Update info panel
            document.getElementById('coords').innerText = newpos[0].toFixed(5) + ', ' + newpos[1].toFixed(5);
            document.getElementById('points').innerText = pathCoordinates.length;
            document.getElementById('distance').innerText = totalDistance.toFixed(2) + ' km';
             
        }, 2000);

       
