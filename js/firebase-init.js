if(!firebase.apps.length){try{
  const config = window.firebaseConfig || firebaseConfig;
  firebase.initializeApp(config);
    console.log('Firebase initialized successfully');
}catch(error){
    console.error('Firebase initialisation failed:',error);
}}else{
  console.log('Firebase already initialized');
  firebase.app()}
var auth = firebase.auth();
var db = firebase.firestore();
var storage;
try {
    storage = firebase.storage();
    window.storage = storage;
} catch (e) {
    console.warn("Firebase Storage SDK not loaded. Storage features will be unavailable.");
}
window.auth = auth;
window.db = db;
window.storage = storage;

if(!window.authPersistenceSet){
auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL)
.then(()=>{console.log('Auth persistence enabled');
window.authPersistenceSet = true;})
.catch((error)=>console.error('Auth persistence error:',error));
}
// HELPER FUNCTIONS
function isUserLoggedIn() {
  return auth.currentUser !== null;
}
function getCurrentUser() {
  return auth.currentUser;
}

function getCurrentUserId() {
  return auth.currentUser ? auth.currentUser.uid : null;
}
function getCurrentUserEmail() {
  return auth.currentUser ? auth.currentUser.email : null;
}

async function signOut() {
  try {
    await auth.signOut();
    window.location.href = 'index.html';
  } catch (error) {
    console.error('Sign out error:', error);
  }
}
// AUTH STATE LISTENER
if (!window.authStateListenerAdded) {
auth.onAuthStateChanged((user) => {
  if (user) {
   console.log('User logged in:', user.email);
      window.getCurrentUser = user;
  } else {
    console.log('User not logged in');
    window.getCurrentUser=null;
    const protectedPages = ['tracker.html', 'history.html', 'dashboard.html'];
    const currentPage = window.location.pathname.split('/').pop();
    if (protectedPages.includes(currentPage)) {
      console.log('Protected page - redirecting to login');
        window.location.href = 'index.html';
      window.location.href = 'index.html';
    }
  }
});
window.authStateListenerAdded = true;
  console.log('Auth state listener added');
}

// DATABASE HELPERS
function getTimestamp() {
  return firebase.firestore.FieldValue.serverTimestamp();
}

function generateId() {
  return db.collection('_').doc().id;
}

// ERROR HANDLING
function handleFirebaseError(error) {
  console.error('Firebase Error:', error);
  
  const errorMessages = {
    'auth/user-not-found': 'No account found with this email.',
    'auth/wrong-password': 'Incorrect password.',
    'auth/email-already-in-use': 'An account with this email already exists.',
    'auth/weak-password': 'Password should be at least 6 characters.',
    'auth/invalid-email': 'Invalid email address.',
    'permission-denied': 'You don\'t have permission to access this data.',
    'not-found': 'The requested data was not found.'
  };
  
  return errorMessages[error.code] || error.message || 'An unexpected error occurred.';
}

console.log('Firebase configuration loaded');