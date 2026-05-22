
const APP_CONFIG = {
    EMAILJS_SERVICE_ID: "service_h4z2pnh", 
    EMAILJS_TEMPLATE_ID: "template_9yp4c0l", 
    EMAILJS_PUBLIC_KEY: "nm-1YMKP0I57VMKRZ",
    MAX_EMAILS_PER_MONTH: 10,
    MAX_CONTACTS_PER_USER: 10,
    VERIFICATION_TOKEN_EXPIRY_HOURS: 24,
    EMAIL_RATE_LIMIT: 5,  
    EMAIL_RATE_WINDOW: 3600000,  

    VERIFY_BASE_URL: window.location.origin + '/verify.html'
};


(function validateConfig() {
    const required = [
        'EMAILJS_SERVICE_ID',
        'EMAILJS_TEMPLATE_ID', 
        'EMAILJS_PUBLIC_KEY'
    ];
    
    const missing = required.filter(key => 
        !APP_CONFIG[key] || 
        APP_CONFIG[key].startsWith('YOUR_') ||
        APP_CONFIG[key] === ''
    );
    
    if (missing.length > 0) {
        console.error('❌ Missing EmailJS configuration:', missing);
        console.error('⚠️ Email functionality will not work until you configure EmailJS');
        console.error('📖 Get your keys from: https://dashboard.emailjs.com/');
    } else {
        console.log('✅ EmailJS configuration loaded');
    }
})();


window.APP_CONFIG = APP_CONFIG;