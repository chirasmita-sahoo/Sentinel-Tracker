
class ShareManager {
    constructor() {
        this.currentToken = null;
        this.rateLimiter = new Map();
        this.MAX_VIEWERS = 10;
        this.RATE_LIMIT = 60; // requests per minute
    }

    /**
     * Generate shareable link for current journey
     * @param {string} journeyId - Journey ID
     * @param {string} userName - User's name for display
     * @param {Array} selectedContacts - Array of {id, name} objects from your contacts list
     * @returns {Promise<Object>} Share link data
     */
    async generateShareLink(journeyId,selectedContacts) {
        try {
        const batch = firebase.firestore().batch();
        const generatedLinks = [];

        for (const contact of selectedContacts) {
            // Generate unique secure token per contact
            const token = this.generateSecureToken();
            const tokenHash = await this.hashToken(token);
            const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

            const shareRef = firebase.firestore().collection('shareLinks').doc(tokenHash);
            
            batch.set(shareRef, {
                journeyId: journeyId,
                userId: firebase.auth().currentUser.uid, // Owner of the journey
                contactId: contact.id,      // The ID of the emergency contact
                contactName: contact.name,  // Store their name for the viewer to see
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                expiresAt: firebase.firestore.Timestamp.fromDate(expiresAt),
                isActive: true,
                deviceLock: null,           // KEY: Set to null initially
                journeyStatus: 'active'
            });

            generatedLinks.push({
                name: contact.name,
                url: this.buildShareUrl(token)
            });
        }

        await batch.commit();
        return generatedLinks;

    } catch (error) {
        console.error('Error generating links:', error);
        throw new Error('Failed to secure sharing. Please try again.');
    }
}


    /**
     * Check if token already exists for journey
     */
    async getExistingToken(journeyId) {
        try {
            const snapshot = await firebase.firestore()
                .collection('shareLinks')
                .where('journeyId', '==', journeyId)
                .where('isActive', '==', true)
                .limit(1)
                .get();

            if (snapshot.empty) return null;

            const doc = snapshot.docs[0];
            const data = doc.data();
            
            // Check if expired
            if (data.expiresAt.toDate() < new Date()) {
                return null;
            }

            return {
                token: doc.id, // We'll use a placeholder since we can't retrieve original
                tokenHash: doc.id,
                expiresAt: data.expiresAt.toDate()
            };

        } catch (error) {
            console.error('Error checking existing token:', error);
            return null;
        }
    }

    /**
     * Generate cryptographically secure token
     */
    generateSecureToken() {
        const array = new Uint8Array(24);
        crypto.getRandomValues(array);
        const randomPart = this.arrayToBase64Url(array);
        const timestamp = Date.now().toString(36);
        const token = `stk_${timestamp}_${randomPart}`;
        const checksum = this.calculateChecksum(token);
        return `${token}_${checksum}`;
    }

    /**
     * Hash token for storage (SHA-256)
     */
    async hashToken(token) {
        const encoder = new TextEncoder();
        const data = encoder.encode(token);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        return this.arrayToHex(hashBuffer);
    }

    /**
     * Validate share token
     */
    async validateToken(token) {
        try {
            // Validate format
            if (!this.isValidTokenFormat(token)) {
                throw new Error('Invalid token format');
            }

            // Verify checksum
            if (!this.verifyChecksum(token)) {
                throw new Error('Token integrity check failed');
            }

            // Hash token
            const tokenHash = await this.hashToken(token);

            // Get share link document
            const doc = await firebase.firestore()
                .collection('shareLinks')
                .doc(tokenHash)
                .get();

            if (!doc.exists) {
                throw new Error('Share link not found or expired');
            }

            const data = doc.data();

            // Check if active
            if (!data.isActive) {
                throw new Error('Share link has been deactivated');
            }

            // Check expiration
            if (data.expiresAt.toDate() < new Date()) {
                throw new Error('Share link has expired');
            }
          
            // Check viewer limit
            if (data.activeViewers >= data.maxViewers) {
                throw new Error('Maximum viewer limit reached (10 viewers)');
            }
             
            return {
                valid: true,
                tokenHash: tokenHash,
                journeyId: data.journeyId,
                userName: data.userName,
                journeyStatus: data.journeyStatus,
                activeViewers: data.activeViewers,
                maxViewers: data.maxViewers
            };

        } catch (error) {
            // Log failed validation
            await this.logFailedValidation(token, error.message);
            throw error;
        }
    }

    /**
     * Register viewer (increment active count)
     */
    async registerViewer(tokenHash) {
        try {
            const docRef = firebase.firestore()
                .collection('shareLinks')
                .doc(tokenHash);

            await firebase.firestore().runTransaction(async (transaction) => {
                const doc = await transaction.get(docRef);
                
                if (!doc.exists) {
                    throw new Error('Share link not found');
                }

                const data = doc.data();
                const newActiveViewers = data.activeViewers + 1;

                if (newActiveViewers > data.maxViewers) {
                    throw new Error('Maximum viewer limit reached');
                }

                transaction.update(docRef, {
                    activeViewers: newActiveViewers,
                    totalAccessCount: firebase.firestore.FieldValue.increment(1),
                    lastAccessedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
            });

            return true;

        } catch (error) {
            console.error('Error registering viewer:', error);
            throw error;
        }
    }

    /**
     * Unregister viewer (decrement active count)
     */
    async unregisterViewer(tokenHash) {
        try {
            await firebase.firestore()
                .collection('shareLinks')
                .doc(tokenHash)
                .update({
                    activeViewers: firebase.firestore.FieldValue.increment(-1)
                });
        } catch (error) {
            console.error('Error unregistering viewer:', error);
        }
    }

    /**
     * Update journey status
     */
    async updateJourneyStatus(tokenHash, status) {
        try {
            const updates = {
                journeyStatus: status
            };

            // If journey completed, set new expiration (1 hour from now)
            if (status === 'completed') {
                const newExpiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
                const doc = await firebase.firestore()
                    .collection('shareLinks')
                    .doc(tokenHash)
                    .get();

                if (doc.exists) {
                    const currentExpiry = doc.data().expiresAt.toDate();
                    // Keep whichever expiration is LATER
                    if (newExpiry > currentExpiry) {
                        updates.expiresAt = firebase.firestore.Timestamp.fromDate(newExpiry);
                    }
                }
            }

            await firebase.firestore()
                .collection('shareLinks')
                .doc(tokenHash)
                .update(updates);

        } catch (error) {
            console.error('Error updating journey status:', error);
        }
    }

    /**
     * Deactivate share link
     */
    async deactivateLink(tokenHash) {
        try {
            await firebase.firestore()
                .collection('shareLinks')
                .doc(tokenHash)
                .update({
                    isActive: false,
                    deactivatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });

            return { success: true };

        } catch (error) {
            console.error('Error deactivating link:', error);
            throw error;
        }
    }

    /**
     * Build shareable URL
     */
    buildShareUrl(token) {
        const baseUrl = window.location.origin;
        return `${baseUrl}/view.html?t=${token}`;
    }

    /**
     * Rate limiting check
     */
    checkRateLimit(identifier) {
        const now = Date.now();
        const windowMs = 60000; // 1 minute
        
        if (!this.rateLimiter.has(identifier)) {
            this.rateLimiter.set(identifier, []);
        }

        const requests = this.rateLimiter.get(identifier);
        
        // Remove old requests outside window
        const recent = requests.filter(time => now - time < windowMs);
        
        if (recent.length >= this.RATE_LIMIT) {
            return false; // Rate limit exceeded
        }

        recent.push(now);
        this.rateLimiter.set(identifier, recent);
        
        return true;
    }

    /**
     * XSS Prevention - Sanitize input
     */
    sanitizeInput(input) {
        if (typeof input !== 'string') return input;
        
        const div = document.createElement('div');
        div.textContent = input;
        return div.innerHTML;
    }

    /**
     * Validate token format
     */
    isValidTokenFormat(token) {
        // Expected: stk_{timestamp}_{random}_{checksum}
        const pattern = /^stk_[a-z0-9]+_[A-Za-z0-9_-]+_[a-f0-9]{8}$/;
        return pattern.test(token);
    }

    /**
     * Calculate checksum
     */
    calculateChecksum(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return Math.abs(hash).toString(16).padStart(8, '0').substring(0, 8);
    }

    /**
     * Verify checksum
     */
    verifyChecksum(token) {
        const parts = token.split('_');
        if (parts.length !== 4) return false;
        
        const providedChecksum = parts[3];
        const tokenWithoutChecksum = parts.slice(0, 3).join('_');
        const calculatedChecksum = this.calculateChecksum(tokenWithoutChecksum);
        
        return calculatedChecksum === providedChecksum;
    }

    /**
     * Log failed validation attempt
     */
    async logFailedValidation(token, reason) {
        try {
            // Don't store actual token, just partial hash for tracking
            const partialHash = token.substring(0, 10);
            
            await firebase.firestore()
                .collection('securityLogs')
                .add({
                    type: 'failed_validation',
                    partialToken: partialHash,
                    reason: reason,
                    timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                    userAgent: navigator.userAgent
                });
        } catch (error) {
            console.error('Error logging failed validation:', error);
        }
    }

    /**
     * Utility: Convert array to hex
     */
    arrayToHex(buffer) {
        return Array.from(new Uint8Array(buffer))
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');
    }

    /**
     * Utility: Convert array to Base64URL
     */
    arrayToBase64Url(buffer) {
        const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
        return base64
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=/g, '');
    }
}

// Initialize global instance
window.shareManager = new ShareManager();