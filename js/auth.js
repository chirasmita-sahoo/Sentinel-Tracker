auth.onAuthStateChanged((user)=>{ 
    if(user){window.location.href='dashboard.html';}
    else{initializeForm();}
});
function initializeForm(){
    const urlParams=new URLSearchParams(window.location.search);
    const mode=urlParams.get('mode')||'login';
    showForm(mode);
}
function showForm(mode){
    document.getElementById('login-form').classList.add('hidden');
    document.getElementById('signup-form').classList.add('hidden');
    document.getElementById('forgot-form').classList.add('hidden');
    if (mode === 'login' || mode === 'signin') {
        document.getElementById('login-form').classList.remove('hidden');
    } else if (mode === 'signup' || mode === 'register') {
        document.getElementById('signup-form').classList.remove('hidden');
    } else if (mode === 'forgot' || mode === 'reset') {
        document.getElementById('forgot-form').classList.remove('hidden');
    } else {
        document.getElementById('login-form').classList.remove('hidden');
    }
    const newUrl = `${window.location.pathname}?mode=${mode}`;
    window.history.replaceState({ mode: mode }, '', newUrl);
    
    clearErrors();
}
function showLoginForm() {
    showForm('login');
}
function showSignupForm() {
    showForm('signup')
}
function showForgotPassword() {
    showForm('forgot');
}
function clearErrors() {
    document.getElementById('login-error').classList.add('hidden');
    document.getElementById('signup-error').classList.add('hidden');
    document.getElementById('forgot-error').classList.add('hidden');
    document.getElementById('forgot-success').classList.add('hidden');
}
//login
async function handleLogin() {
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    const rememberMe = document.getElementById('remember-me').checked;
    const errorDiv = document.getElementById('login-error');
    const btnText = document.getElementById('login-btn-text');
    const spinner = document.getElementById('login-spinner');

    if (!email || !password) {
        showError('login-error', 'Please fill in all fields');
        return;
    }
    if (!validateEmail(email)) {
        showError('login-error', 'Please enter a valid email address');
        return;
    }

    btnText.textContent = 'Signing in...';
    spinner.classList.remove('hidden');
    errorDiv.classList.add('hidden');

    try {
        const persistence = rememberMe 
            ? firebase.auth.Auth.Persistence.LOCAL 
            : firebase.auth.Auth.Persistence.SESSION;
        
        await auth.setPersistence(persistence);
        const userCredential = await auth.signInWithEmailAndPassword(email, password);
        
        console.log(' Login successful:', userCredential.user.email);
        
    } catch (error) {
        console.error(' Login error:', error);
        btnText.textContent = 'Sign In';
        spinner.classList.add('hidden');
        showError('login-error', handleFirebaseError(error));
    }
}
document.addEventListener('DOMContentLoaded', () => {
    const loginEmail = document.getElementById('login-email');
    const loginPassword = document.getElementById('login-password');
    
    if (loginEmail && loginPassword) {
        loginEmail.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') handleLogin();
        });
        loginPassword.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') handleLogin();
        });
    }
});
//signup
async function handleSignup() {
    const name = document.getElementById('signup-name').value.trim();
    const email = document.getElementById('signup-email').value.trim();
    const password = document.getElementById('signup-password').value;
    const confirmPassword = document.getElementById('signup-confirm').value;
    const acceptTerms = document.getElementById('accept-terms').checked;
    const btnText = document.getElementById('signup-btn-text');
    const spinner = document.getElementById('signup-spinner');

    if (!name || !email || !password || !confirmPassword) {
        showError('signup-error', 'Please fill in all fields');
        return;
    }
    if (!validateEmail(email)) {
        showError('signup-error', 'Please enter a valid email address');
        return;
    }
    if (password.length < 6) {
        showError('signup-error', 'Password must be at least 6 characters');
        return;
    }
    if (password !== confirmPassword) {
        showError('signup-error', 'Passwords do not match');
        return;
    }
    if (!acceptTerms) {
        showError('signup-error', 'Please accept the Terms of Service');
        return;
    }

    btnText.textContent = 'Creating account...';
    spinner.classList.remove('hidden');
    document.getElementById('signup-error').classList.add('hidden');

    try {
        const userCredential = await auth.createUserWithEmailAndPassword(email, password);
        const user = userCredential.user;

        await user.updateProfile({
            displayName: name
        });
        await db.collection('users').doc(user.uid).set({
            email: email,
            name: name,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            lastLogin: firebase.firestore.FieldValue.serverTimestamp()
        });

        console.log('Signup successful:', user.email);     
    } catch (error) {
        console.error('Signup error:', error);
        btnText.textContent = 'Create Account';
        spinner.classList.add('hidden');
        showError('signup-error', handleFirebaseError(error));
    }
}
async function handleForgotPassword() {
    const email = document.getElementById('forgot-email').value.trim();
    const btnText = document.getElementById('forgot-btn-text');
    const spinner = document.getElementById('forgot-spinner');
    const errorDiv = document.getElementById('forgot-error');
    const successDiv = document.getElementById('forgot-success');

    if (!email) {
        showError('forgot-error', 'Please enter your email address');
        return;
    }
    if (!validateEmail(email)) {
        showError('forgot-error', 'Please enter a valid email address');
        return;
    }
    btnText.textContent = 'Sending...';
    spinner.classList.remove('hidden');
    errorDiv.classList.add('hidden');
    successDiv.classList.add('hidden');
    try {
        await auth.sendPasswordResetEmail(email); 
        btnText.textContent = 'Send Reset Link';
        spinner.classList.add('hidden');
        successDiv.textContent = `✅ Password reset link sent to ${email}. Check your inbox!`;
        successDiv.classList.remove('hidden');
        document.getElementById('forgot-email').value = '';     
    } catch (error) {
        console.error('❌ Password reset error:', error);
        btnText.textContent = 'Send Reset Link';
        spinner.classList.add('hidden');
        showError('forgot-error', handleFirebaseError(error));
    }
}
//password
document.addEventListener('DOMContentLoaded', () => {
    const passwordInput = document.getElementById('signup-password');
    const strengthBar = document.getElementById('strength-bar');

    if (passwordInput && strengthBar) {
        passwordInput.addEventListener('input', () => {
            const password = passwordInput.value;
            const strength = calculatePasswordStrength(password);
            strengthBar.className = 'strength-bar';
            if (strength >= 80) {
                strengthBar.classList.add('strong');
                strengthBar.style.width = '100%';
            } else if (strength >= 50) {
                strengthBar.classList.add('medium');
                strengthBar.style.width = '66%';
            } else if (strength > 0) {
                strengthBar.classList.add('weak');
                strengthBar.style.width = '33%';
            } else {
                strengthBar.style.width = '0%';
            }
        });
    }
});

function calculatePasswordStrength(password) {
    let strength = 0;
    if (password.length >= 6) strength += 20;
    if (password.length >= 8) strength += 20;
    if (password.length >= 12) strength += 10;
    if (/[a-z]/.test(password)) strength += 10;
    if (/[A-Z]/.test(password)) strength += 15;
    if (/[0-9]/.test(password)) strength += 15;
    if (/[^a-zA-Z0-9]/.test(password)) strength += 10;   
    return strength;
}
function validateEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
}
function showError(elementId, message) {
    const errorDiv = document.getElementById(elementId);
    errorDiv.textContent = '⚠️ ' + message;
    errorDiv.classList.remove('hidden');
}
function handleFirebaseError(error) {
    switch (error.code) {
        case 'auth/invalid-email':
            return 'Invalid email address';
        case 'auth/user-disabled':
            return 'This account has been disabled';
        case 'auth/user-not-found':
            return 'No account found with this email';
        case 'auth/wrong-password':
            return 'Incorrect password';
        case 'auth/email-already-in-use':
            return 'An account with this email already exists';
        case 'auth/weak-password':
            return 'Password is too weak';
        case 'auth/network-request-failed':
            return 'Network error. Please check your connection';
        case 'auth/too-many-requests':
            return 'Too many attempts. Please try again later';
        default:
            return error.message || 'An error occurred. Please try again';
    }
}
window.addEventListener('popstate', (event) => {
    if (event.state && event.state.mode) {
        showForm(event.state.mode);
    }
});

console.log('%c🛡️ Sentinel GPS Authentication', 'color: #00ff41; font-size: 20px; font-weight: bold;');
console.log('%cSecure login system initialized', 'color: #00ff41; font-size: 12px;');