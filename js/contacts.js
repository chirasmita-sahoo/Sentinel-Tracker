
const CONTACTS_CONFIG = {
    MAX_CONTACTS: 10,
    MIN_NAME_LENGTH: 2,
    MAX_NAME_LENGTH: 100,
    MIN_PHONE_LENGTH: 10,
    MAX_PHONE_LENGTH: 20,
    MAX_EMAIL_LENGTH: 255,
    RATE_LIMIT_WINDOW: 60000, // 1 minute
    MAX_OPERATIONS_PER_MINUTE: 10
};

// State
let currentContacts = [];
let editingContactId = null;
let deleteContactId = null;

function generateSecureToken() {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(36)).join('').slice(0, 64);
}
const Validator = {
    validateEmail(email) {
        if (!email || typeof email !== 'string') {
            return { valid: false, error: 'Email is required' };
        }

        const trimmed = email.trim();
        
        if (trimmed.length < 3) {
            return { valid: false, error: 'Email too short' };
        }

        if (trimmed.length > CONTACTS_CONFIG.MAX_EMAIL_LENGTH) {
            return { valid: false, error: 'Email too long (max 255 characters)' };
        }
        const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
        
        if (!emailRegex.test(trimmed)) {
            return { valid: false, error: 'Invalid email format' };
        }

        return { valid: true, value: trimmed.toLowerCase() };
    },

    validatePhone(phone) {
        if(!phone||phone.trim()===''){
            return {valid: true,value:''};
        }
        if (typeof phone !== 'string') {
            return { valid: false, error: 'Invalid input' };
        }

        const trimmed = phone.trim();
        
        const digitsOnly = trimmed.replace(/\D/g, '');
        
        if (digitsOnly.length < CONTACTS_CONFIG.MIN_PHONE_LENGTH) {
            return { valid: false, error: 'Phone number too short (min 10 digits)' };
        }

        if (digitsOnly.length > CONTACTS_CONFIG.MAX_PHONE_LENGTH) {
            return { valid: false, error: 'Phone number too long (max 20 digits)' };
        }
        
        if (!phoneRegex.test(trimmed)) {
            return { valid: false, error: 'Invalid phone number format' };
        }

        return { valid: true, value: trimmed };
    },

    validateName(name) {
        if (!name || typeof name !== 'string') {
            return { valid: false, error: 'Name is required' };
        }

        const trimmed = name.trim();
        
        if (trimmed.length < CONTACTS_CONFIG.MIN_NAME_LENGTH) {
            return { valid: false, error: 'Name too short (min 2 characters)' };
        }

        if (trimmed.length > CONTACTS_CONFIG.MAX_NAME_LENGTH) {
            return { valid: false, error: 'Name too long (max 100 characters)' };
        }
        const nameRegex = /^[a-zA-Z\s\-'\.]+$/;
        
        if (!nameRegex.test(trimmed)) {
            return { valid: false, error: 'Name contains invalid characters' };
        }

        return { valid: true, value: trimmed };
    },
    sanitize(input) {
        if (typeof input !== 'string') return '';
        
        return input
            .trim()
            .replace(/[<>]/g, '') // Remove angle brackets
            .replace(/javascript:/gi, '') // Remove javascript: protocol
            .replace(/on\w+=/gi, ''); // Remove event handlers
    }
};


window.addEventListener('DOMContentLoaded', async () => {
    // Check authentication
    firebase.auth().onAuthStateChanged(async (user) => {
        if (!user) {
            console.log('Not authenticated - redirecting');
            window.location.href = 'auth.html';
            return;
        }

        console.log('User authenticated:', user.email);
        await loadContacts();
    });
    document.getElementById('contact-form').addEventListener('submit', handleFormSubmit);
});

async function loadContacts() {
    try {
        showLoading(true);
        
        console.log('Loading emergency contacts...');
        
        if (typeof EmergencyContactsDB === 'undefined') {
            throw new Error('EmergencyContactsDB not loaded');
        }

        currentContacts = await EmergencyContactsDB.getContacts();
        
        console.log(`Loaded ${currentContacts.length} contacts`);
        
        displayContacts(currentContacts);
        updateStats(currentContacts.length);
        
        showLoading(false);
        
    } catch (error) {
        console.error('Error loading contacts:', error);
        showLoading(false);
        showError('Failed to load contacts. Please refresh the page.');
    }
}

function displayContacts(contacts) {
    const container = document.getElementById('contacts-list');
    const emptyState = document.getElementById('empty-state');

    if (contacts.length === 0) {
        container.classList.add('hidden');
        emptyState.classList.remove('hidden');
        return;
    }

    container.classList.remove('hidden');
    emptyState.classList.add('hidden');
    container.innerHTML = '';

    contacts.forEach(contact => {
        const card = createContactCard(contact);
        container.appendChild(card);
    });
}

function createContactCard(contact) {
    const card = document.createElement('div');
    card.className = 'contact-card';
    card.setAttribute('data-contact-id', contact.id);

    const isPending = contact.status === 'pending';
    const statusBadge = isPending 
        ? '<span class="status-badge status-pending">⏳ Pending Verification</span>'
        : '<span class="status-badge status-verified">✅ Verified</span>';

    const relationshipBadge = contact.relationship 
        ? `<span class="relationship-badge">${escapeHtml(contact.relationship)}</span>`
        : '';

    card.innerHTML = `
        <div class="contact-header">
            <div class="contact-info">
                <h3>${escapeHtml(contact.name)}</h3>
                ${relationshipBadge}
                ${statusBadge}
            </div>
            <div class="contact-actions">
                <button class="icon-btn edit-btn" onclick="openEditModal('${contact.id}')" title="Edit contact">
                    ✏️
                </button>
                <button class="icon-btn delete-btn" onclick="openDeleteModal('${contact.id}')" title="Delete contact">
                    🗑️
                </button>
            </div>
        </div>
        <div class="contact-details">
            <div class="detail-item">
                <span class="detail-icon">📧</span>
                <a href="mailto:${escapeHtml(contact.email)}">${escapeHtml(contact.email)}</a>
            </div>
            ${contact.phone ? `
                <div class="detail-item">
                    <span class="detail-icon">📞</span>
                    <a href="tel:${escapeHtml(contact.phone)}">${escapeHtml(contact.phone)}</a>
                </div>
            ` : ''}
        </div>
        ${isPending ? `
            <div class="verification-note" style="margin-top: 10px; font-size: 0.8rem; color: #666; font-style: italic;">
                ⏳ Waiting for ${escapeHtml(contact.name)} to click the verification link in their email.
            </div>
        ` : ''}
    `;

    return card;
}

function openAddModal() {
    if (currentContacts.length >= CONTACTS_CONFIG.MAX_CONTACTS) {
        showError(`Maximum ${CONTACTS_CONFIG.MAX_CONTACTS} contacts allowed`);
        return;
    }

    editingContactId = null;
    
    document.getElementById('modal-title').textContent = 'Add Emergency Contact';
    document.getElementById('save-btn-text').textContent = 'Save Contact';
    document.getElementById('contact-form').reset();
    clearErrors();
    
    document.getElementById('contact-modal').classList.remove('hidden');
}

function openEditModal(contactId) {
    const contact = currentContacts.find(c => c.id === contactId);
    
    if (!contact) {
        showError('Contact not found');
        return;
    }

    editingContactId = contactId;
    
    document.getElementById('modal-title').textContent = 'Edit Emergency Contact';
    document.getElementById('save-btn-text').textContent = 'Update Contact';
    document.getElementById('contact-name').value = contact.name;
    document.getElementById('contact-email').value = contact.email;
    document.getElementById('contact-phone').value = contact.phone||'';
    document.getElementById('contact-relationship').value = contact.relationship || '';
    
    clearErrors();
    
    document.getElementById('contact-modal').classList.remove('hidden');
}

function closeModal() {
    document.getElementById('contact-modal').classList.add('hidden');
    document.getElementById('contact-form').reset();
    clearErrors();
    editingContactId = null;
}

function openDeleteModal(contactId) {
    const contact = currentContacts.find(c => c.id === contactId);
    
    if (!contact) {
        showError('Contact not found');
        return;
    }

    deleteContactId = contactId;
    document.getElementById('delete-contact-name').textContent = contact.name;
    document.getElementById('delete-modal').classList.remove('hidden');
}

function closeDeleteModal() {
    document.getElementById('delete-modal').classList.add('hidden');
    deleteContactId = null;
}

async function handleFormSubmit(e) {
    e.preventDefault();
    
    clearErrors();
    const name = document.getElementById('contact-name').value;
    const email = document.getElementById('contact-email').value;
    const phone = document.getElementById('contact-phone').value;
    const relationship = document.getElementById('contact-relationship').value;
    const nameValidation = Validator.validateName(name);
    if (!nameValidation.valid) {
        showFieldError('name', nameValidation.error);
        return;
    }

    const emailValidation = Validator.validateEmail(email);
    if (!emailValidation.valid) {
        showFieldError('email', emailValidation.error);
        return;
    }

    const phoneValidation = Validator.validatePhone(phone);
    if (!phoneValidation.valid) {
        showFieldError('phone', phoneValidation.error);
        return;
    }
    const duplicateEmail = currentContacts.find(c => 
        c.email.toLowerCase() === emailValidation.value && 
        c.id !== editingContactId
    );
    
    if (duplicateEmail) {
        showFieldError('email', 'This email is already in your contacts');
        return;
    }
    const contactData = {
        name: nameValidation.value,
        email: emailValidation.value,
        phone: phoneValidation.value,
        relationship: relationship || null
    };
    try {
        setFormLoading(true);
        
        if (editingContactId) {
            await updateContact(editingContactId, contactData);
        } else {
            await createContact(contactData);
        }
        
        closeModal();
        await loadContacts();
        
        showSuccess(editingContactId ? 'Contact updated successfully' : 'Contact added successfully');
        
    } catch (error) {
        console.error('Error saving contact:', error);
        showError(error.message || 'Failed to save contact');
    } finally {
        setFormLoading(false);
    }
}

//crud
async function createContact(contactData) {
    if (typeof EmergencyContactsDB === 'undefined') {
        throw new Error('Database not available');
    }

    console.log('Creating contact...');
    await EmergencyContactsDB.addContact(contactData);
    console.log('Contact created');
}

async function updateContact(contactId, contactData) {
    if (typeof EmergencyContactsDB === 'undefined') {
        throw new Error('Database not available');
    }

    console.log('Updating contact...');
    await EmergencyContactsDB.updateContact(contactId, contactData);
    console.log('Contact updated');
}

async function confirmDelete() {
    if (!deleteContactId) return;

    try {
        setDeleteLoading(true);
        
        console.log('Deleting contact...');
        await EmergencyContactsDB.deleteContact(deleteContactId);
        console.log('Contact deleted');
        
        closeDeleteModal();
        await loadContacts();
        
        showSuccess('Contact deleted successfully');
        
    } catch (error) {
        console.error('Error deleting contact:', error);
        showError('Failed to delete contact');
    } finally {
        setDeleteLoading(false);
    }
}

function updateStats(count) {
    document.getElementById('total-contacts').textContent = count;
    
    const addBtn = document.getElementById('add-contact-btn');
    if (count >= CONTACTS_CONFIG.MAX_CONTACTS) {
        addBtn.disabled = true;
        addBtn.title = 'Maximum contacts reached';
    } else {
        addBtn.disabled = false;
        addBtn.title = 'Add new contact';
    }
}

function showLoading(show) {
    const loading = document.getElementById('loading-indicator');
    if (show) {
        loading.classList.remove('hidden');
    } else {
        loading.classList.add('hidden');
    }
}

function setFormLoading(loading) {
    const saveBtn = document.getElementById('save-btn');
    const saveBtnText = document.getElementById('save-btn-text');
    const saveBtnSpinner = document.getElementById('save-btn-spinner');
    
    if (loading) {
        saveBtn.disabled = true;
        saveBtnText.classList.add('hidden');
        saveBtnSpinner.classList.remove('hidden');
    } else {
        saveBtn.disabled = false;
        saveBtnText.classList.remove('hidden');
        saveBtnSpinner.classList.add('hidden');
    }
}

function setDeleteLoading(loading) {
    const deleteBtn = document.querySelector('.danger-btn');
    const deleteBtnText = document.getElementById('delete-btn-text');
    const deleteBtnSpinner = document.getElementById('delete-btn-spinner');
    
    if (loading) {
        deleteBtn.disabled = true;
        deleteBtnText.classList.add('hidden');
        deleteBtnSpinner.classList.add('hidden');
        deleteBtnText.textContent = 'Deleting...';
    } else {
        deleteBtn.disabled = false;
        deleteBtnText.classList.remove('hidden');
        deleteBtnSpinner.classList.add('hidden');
        deleteBtnText.textContent = 'Delete';
    }
}

function clearErrors() {
    document.getElementById('name-error').textContent = '';
    document.getElementById('email-error').textContent = '';
    document.getElementById('phone-error').textContent = '';
    
    document.getElementById('contact-name').classList.remove('error');
    document.getElementById('contact-email').classList.remove('error');
    document.getElementById('contact-phone').classList.remove('error');
}

function showFieldError(field, message) {
    const errorEl = document.getElementById(`${field}-error`);
    const inputEl = document.getElementById(`contact-${field}`);
    
    if (errorEl) errorEl.textContent = message;
    if (inputEl) inputEl.classList.add('error');
}

function showError(message) {
    showNotification(message, 'error');
}

function showSuccess(message) {
    showNotification(message, 'success');
}

function showNotification(message, type = 'info') {
    if (typeof SyncIndicator !== 'undefined') {
        if (type === 'error') {
            SyncIndicator.error(message);
        } else if (type === 'success') {
            SyncIndicator.synced();
        }
    }
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: ${type === 'error' ? '#e74c3c' : type === 'success' ? '#2ecc71' : '#3498db'};
        color: white;
        padding: 15px 20px;
        border-radius: 8px;
        box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2);
        z-index: 100000;
        max-width: 300px;
        animation: slideIn 0.3s ease;
    `;
    
    notification.textContent = message;
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => {
            document.body.removeChild(notification);
        }, 300);
    }, 3000);
}

function escapeHtml(text) {
    if (typeof text !== 'string') return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function goBack() {
    if (window.history.length > 1) {
        window.history.back();
    } else {
        window.location.href = 'dashboard.html';
    }
}

const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from {
            transform: translateX(400px);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
    
    @keyframes slideOut {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(400px);
            opacity: 0;
        }
    }
`;
document.head.appendChild(style);

console.log('Emergency Contacts module loaded');
