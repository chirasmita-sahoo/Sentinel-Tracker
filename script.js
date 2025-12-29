
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

        //simulate: moving the driver marker every  5seconds
        let totalDistance = 0;
        setInterval(() => {
            //Generate small random changes in lat and lng
            let latchange = (Math.random() - 0.5) * 0.01;
            let lngchange = (Math.random() - 0.5) * 0.01;
           let currentpos= driverMarker.getLatLng();
           let newpos= [currentpos.lat + latchange, currentpos.lng + lngchange]; 
           let distance = currentpos.distanceTo(newpos)/1000; //in km
           totalDistance += distance;
            
            //Update marker position
            driverMarker.setLatLng(newpos);
            //Update path coordinates
            pathCoordinates.push(newpos);
            polyline.setLatLngs(pathCoordinates);
            //Center map on new position
            map.panTo(newpos);

            document.getElementById('coords').innerText = newpos[0].toFixed(5) + ', ' + newpos[1].toFixed(5);
            document.getElementById('points').innerText = pathCoordinates.length;
            document.getElementById('distance').innerText = totalDistance.toFixed(2) + ' km';
            
        }, 2000);
