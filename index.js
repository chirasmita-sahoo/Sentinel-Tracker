
auth.onAuthStateChanged((user) => {
    const guestView = document.getElementById('guest-view');
    const userView = document.getElementById('user-view');
    
    if (user) {
        guestView.style.display = 'none';
        userView.style.display = 'block';
        
        const displayName = user.displayName || user.email.split('@')[0];
        document.getElementById('user-name').textContent = displayName;
        
        console.log('User is logged in:', user.email);
    } else {
        guestView.style.display = 'block';
        userView.style.display = 'none';
        
        console.log(' No user logged in');
    }
});

async function handleLogout() {
    if (confirm('Are you sure you want to logout?')) {
        try {
            await auth.signOut();
            console.log('✅ Logged out successfully');
        } catch (error) {
            console.error('❌ Logout error:', error);
            alert('Error logging out. Please try again.');
        }
    }
}

console.log('✅ Landing page initialized');