if (typeof window.firebaseConfig === 'undefined') {const firebaseConfig = {
  apiKey: "AIzaSyAtSmVVgOqqOYAq6cs9RLyQ7sCWR-I5BRo",
  authDomain: "sentinelgps-tracker.firebaseapp.com",
  projectId: "sentinelgps-tracker",
  storageBucket: "sentinelgps-tracker.firebasestorage.app",
  messagingSenderId: "5867468763",
  appId: "1:5867468763:web:f9d92bd5102aa006b1d9fe",
  measurementId: "G-7CHWD2S714"
};
window.firebaseConfig = firebaseConfig;
console.log('Firebase config loaded');
  
} else {
  console.log('Firebase config already loaded (skipping)');
}
