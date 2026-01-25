try{firebase.initializeApp(firebaseConfig);
    console.log('Firebase config not found');
}catch(error){
    console.error('Firebase initialisation failed:',error);
}
const auth = firebase.auth();
const db = firebase.firestore();
const storage = firebase.storage();

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

auth.onAuthStateChanged((user) => {
  if (user) {
    console.log(' User logged in:', user.email);
  } else {
    console.log('User not logged in');
    const protectedPages = ['tracker.html', 'history.html', 'dashboard.html'];
    const currentPage = window.location.pathname.split('/').pop();
    if (protectedPages.includes(currentPage)) {
      window.location.href = 'index.html';
    }
  }
});

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