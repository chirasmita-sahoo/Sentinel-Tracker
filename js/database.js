
const Security = {
  sanitizeString(str, maxLength = 500) {
    if (typeof str !== 'string') return '';
    str = str.replace(/<[^>]*>/g, '');
    str = str.replace(/[<>{}]/g, '');
    str = str.trim().substring(0, maxLength);
    
    return str;
  },

  sanitizeNumber(num, min = 0, max = 100000) {
    const parsed = parseFloat(num);
    if (isNaN(parsed)) return 0;
    return Math.max(min, Math.min(max, parsed));
  },

  validateCoordinates(lat, lng) {
    const latitude = parseFloat(lat);
    const longitude = parseFloat(lng);
    
    if (isNaN(latitude) || isNaN(longitude)) {
      return null;
    }
    
    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      return null;
    }
    
    return { lat: latitude, lng: longitude };
  },

  validateJourneyData(data) {
    const errors = [];
   
    if (!data.mode || !['walking', 'car', 'train', 'bus', 'bike'].includes(data.mode)) {
      errors.push('Invalid mode');
    }
    
    if (!data.startTime) {
      errors.push('Missing start time');
    }
    
    if (!data.status || !['active', 'completed', 'paused'].includes(data.status)) {
      errors.push('Invalid status');
    }
 
    if (data.distance !== undefined) {
      const dist = parseFloat(data.distance);
      if (isNaN(dist) || dist < 0 || dist > 100000) {
        errors.push('Invalid distance (must be 0-100,000 km)');
      }
    }
    
    if (data.duration !== undefined) {
      const dur = parseInt(data.duration);
      if (isNaN(dur) || dur < 0 || dur > 86400000 * 30) {
        errors.push('Invalid duration (max 30 days)');
      }
    }
    
    if (data.avgSpeed !== undefined) {
      const speed = parseFloat(data.avgSpeed);
      if (isNaN(speed) || speed < 0 || speed > 500) {
        errors.push('Invalid speed (max 500 km/h)');
      }
    }
    if (data.pathPoints && (!Array.isArray(data.pathPoints) || data.pathPoints.length > 10000)) {
      errors.push('Too many path points (max 10,000)');
    }
    
    if (data.alerts && (!Array.isArray(data.alerts) || data.alerts.length > 100)) {
      errors.push('Too many alerts (max 100)');
    }
    
    return {
      valid: errors.length === 0,
      errors: errors
    };
  }
};

// RATE LIMITING
const RateLimit = {
  requests: {},
  
  // Check if action is allowed
  check(action, maxRequests = 10, windowMs = 60000) {
    const now = Date.now();
    const key = `${action}_${firebase.auth().currentUser?.uid || 'anon'}`;
    

    if (!this.requests[key]) {
      this.requests[key] = [];
    }
    this.requests[key] = this.requests[key].filter(
      timestamp => now - timestamp < windowMs
    );
    if (this.requests[key].length >= maxRequests) {
      const oldestRequest = this.requests[key][0];
      const waitTime = Math.ceil((windowMs - (now - oldestRequest)) / 1000);
      return {
        allowed: false,
        waitTime: waitTime,
        message: `Please wait ${waitTime} seconds before trying again`
      };
    }
    this.requests[key].push(now);
    
    return { allowed: true };
  },
  
  
  cleanup() {
    const now = Date.now();
    for (const key in this.requests) {
      this.requests[key] = this.requests[key].filter(
        timestamp => now - timestamp < 300000 
      );
      
      if (this.requests[key].length === 0) {
        delete this.requests[key];
      }
    }
  }
};
setInterval(() => RateLimit.cleanup(), 300000);

// SYNC INDICATOR 

const SyncIndicator = {
  element: null,
  timeout: null,
  
  init() {
    if (this.element) return;
    this.element = document.createElement('div');
    this.element.id = 'sync-status';
    this.element.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: white;
      padding: 10px 16px;
      border-radius: 20px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.15);
      font-size: 14px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      z-index: 10000;
      display: none;
      align-items: center;
      gap: 8px;
      transition: all 0.3s ease;
    `;
    
    document.body.appendChild(this.element);
  },
  
  show(icon, text, color, duration = 3000) {
    this.init();
    
    this.element.innerHTML = `
      <span style="font-size: 16px;">${icon}</span>
      <span>${text}</span>
    `;
    this.element.style.background = color;
    this.element.style.display = 'flex';
    
    // Auto-hide
    if (this.timeout) clearTimeout(this.timeout);
    if (duration > 0) {
      this.timeout = setTimeout(() => this.hide(), duration);
    }
  },
  
  hide() {
    if (this.element) {
      this.element.style.display = 'none';
    }
  },
  
  saving() {
    this.show('💾', 'Saving...', '#fff3e0', 0);
  },
  
  syncing() {
    this.show('🔄', 'Syncing...', '#fff3e0', 0);
  },
  
  synced(count) {
    const text = count ? `Synced ${count} journey${count > 1 ? 's' : ''}` : 'All synced';
    this.show('✅', text, '#e8f5e9', 3000);
  },
  
  offline() {
    this.show('📴', 'Offline - Saved locally', '#ffebee', 0);
  },
  
  error(msg) {
    this.show('❌', msg || 'Error occurred', '#ffebee', 5000);
  }
};
// OFFLINE SYNC SYSTEM

const OfflineSync = {
  STORAGE_KEY: 'pendingJourneys',
  saveToLocal(journeyData) {
    try {
      const pending = this.getPending();
      const offlineJourney = {
        ...journeyData,
        _offline: true,
        _savedAt: Date.now(),
        _attempts: 0
      };
      
      pending.push(offlineJourney);
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(pending));
      
      console.log('💾 Saved to localStorage (offline mode)');
      SyncIndicator.offline();
      
      return true;
    } catch (error) {
      console.error('Error saving to localStorage:', error);
      return false;
    }
  },
  
  // Get pending journeys
  getPending() {
    try {
      const data = localStorage.getItem(this.STORAGE_KEY);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.error('Error reading pending journeys:', error);
      return [];
    }
  },
  
  // Sync pending journeys to Firestore
  async syncPending() {
    if (!navigator.onLine) {
      console.log('Offline - skipping sync');
      return 0;
    }
    
    const pending = this.getPending();
    
    if (pending.length === 0) {
      console.log('No pending journeys to sync');
      return 0;
    }
    
    console.log(`🔄 Syncing ${pending.length} pending journeys...`);
    SyncIndicator.syncing();
    
    const synced = [];
    const failed = [];
    
    for (const journey of pending) {
      const rateCheck = RateLimit.check('syncJourney', 20, 60000);
      if (!rateCheck.allowed) {
        console.warn('Rate limit reached - pausing sync');
        break;
      }
      
      try {
        // Remove offline metadata
        const cleanJourney = { ...journey };
        const journeyId = cleanJourney._journeyId || `journey_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        delete cleanJourney._offline;
        delete cleanJourney._savedAt;
        delete cleanJourney._attempts;
         delete cleanJourney._journeyId;
        
        // Save to Firestore
        await JourneyDB.saveJourney(journeyId,cleanJourney);
        synced.push(journey);
        
        console.log('Synced:', journey);
      } catch (error) {
        console.error('Sync failed:', journey, error);

        journey._attempts = (journey._attempts || 0) + 1;
        if (journey._attempts >= 5) {
          console.error('🗑️  Removing after 5 failed attempts:', journey);
        } else {
          failed.push(journey);
        }
      }
    }
    
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(failed));
    
    console.log(`Sync complete: ${synced.length} synced, ${failed.length} failed`);
    
    if (synced.length > 0) {
      SyncIndicator.synced(synced.length);
    }
    
    return synced.length;
  },
  
  async autoSync() {
    if (navigator.onLine && firebase.auth().currentUser) {
      return await this.syncPending();
    }
    return 0;
  }
};

// JOURNEY DATABASE OPERATIONS
const JourneyDB = {
  getCollection(userId) {
    return db.collection('users').doc(userId).collection('journeys');
  },
  async saveJourney(journeyData) {
    try {
      const user = firebase.auth().currentUser;
      if (!user) {
        throw new Error('No user logged in');
      }

      const rateCheck = RateLimit.check('saveJourney', 10, 60000);
      if (!rateCheck.allowed) {
        throw new Error(rateCheck.message);
      }

      const validation = Security.validateJourneyData(journeyData);
      if (!validation.valid) {
        throw new Error('Invalid journey data: ' + validation.errors.join(', '));
      }

      const sanitizedData = {
        userId: user.uid,
        userEmail: user.email,
        mode: journeyData.mode,
        startTime: journeyData.startTime instanceof Date 
          ? firebase.firestore.Timestamp.fromDate(journeyData.startTime)
          : journeyData.startTime,
        endTime: journeyData.endTime 
          ? (journeyData.endTime instanceof Date 
              ? firebase.firestore.Timestamp.fromDate(journeyData.endTime)
              : journeyData.endTime)
          : firebase.firestore.FieldValue.serverTimestamp(),
        distance: Security.sanitizeNumber(journeyData.distance, 0, 100000),
        duration: parseInt(journeyData.duration) || 0,
        avgSpeed: Security.sanitizeNumber(journeyData.avgSpeed, 0, 500),
        status: journeyData.status || 'completed',
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      };

      if (journeyData.pathPoints && Array.isArray(journeyData.pathPoints)) {
        sanitizedData.pathPoints = journeyData.pathPoints
          .slice(0, 10000)
          .map(point => {
            const coords = Security.validateCoordinates(point.lat, point.lng);
            if (!coords) return null;
            return {
              lat: coords.lat,
              lng: coords.lng,
              timestamp: point.timestamp || Date.now()
            };
          })
          .filter(p => p !== null);
      }

      if (journeyData.alerts && Array.isArray(journeyData.alerts)) {
        sanitizedData.alerts = journeyData.alerts.slice(0, 100);
      }

      if (journeyData.destination) {
        const dest = Security.validateCoordinates(
          journeyData.destination.lat, 
          journeyData.destination.lng
        );
        if (dest) {
          sanitizedData.destination = dest;
        }
      }

      const docRef = await db.getCollection(user.uid).add(sanitizedData);
      
      console.log('Journey saved to Firestore:', docRef.id);
      
      return {
        id: docRef.id,
        ...sanitizedData,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
    } catch (error) {
      console.error('Error saving journey:', error);
      throw error;
    }
  },

  async getUserJourneys() {
    try {
      const user = firebase.auth().currentUser;
      if (!user) {
        throw new Error('No user logged in');
      }

      const rateCheck = RateLimit.check('loadJourneys', 20, 60000); 
      if (!rateCheck.allowed) {
        throw new Error(rateCheck.message);
      }

      console.log('📥 Loading journeys from Firestore...');

      const snapshot = await this.getCollection(user.uid)
        .where('userId', '==', user.uid)
        .orderBy('createdAt', 'desc')
        .limit(100)
        .get();

      const journeys = [];
      snapshot.forEach(doc => {
        const data = doc.data();
        journeys.push({
          id: doc.id,
          ...data,
          startTime: data.startTime?.toDate ? data.startTime.toDate() : data.startTime,
          endTime: data.endTime?.toDate ? data.endTime.toDate() : data.endTime,
          createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : data.createdAt,
          updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : data.updatedAt
        });
      });

      console.log(`Loaded ${journeys.length} journeys from Firestore`);
 
      this._cachedJourneys = journeys;
      this._cacheTime = Date.now();
      
      return journeys;
      
    } catch (error) {
      console.error('Error loading journeys:', error);
      throw error;
    }
  },

  async getStats() {
    try {
      const useCache = this._cachedJourneys && 
                      this._cacheTime && 
                      (Date.now() - this._cacheTime) < 30000;
      
      const journeys = useCache ? this._cachedJourneys : await this.getUserJourneys();
      
      const stats = {
        totalJourneys: journeys.length,
        totalDistance: 0,
        totalDuration: 0,
        totalAlerts: 0,
        averageSpeed: 0,
        modeBreakdown: {
          walking: 0,
          car: 0,
          train: 0,
          bus: 0,
          bike: 0
        }
      };

      journeys.forEach(journey => {
        const distance = parseFloat(journey.distance) || 0;
        stats.totalDistance += distance;
        const duration = parseInt(journey.duration) || 0;
        stats.totalDuration += duration;

        if (journey.alerts && Array.isArray(journey.alerts)) {
          stats.totalAlerts += journey.alerts.length;
        }
        if (journey.mode && stats.modeBreakdown.hasOwnProperty(journey.mode)) {
          stats.modeBreakdown[journey.mode]++;
        }
      });

      if (stats.totalDuration > 0) {
        stats.averageSpeed = (stats.totalDistance / (stats.totalDuration / 3600));
      }

      return stats;
      
    } catch (error) {
      console.error('Error calculating stats:', error);
      return {
        totalJourneys: 0,
        totalDistance: 0,
        totalDuration: 0,
        totalAlerts: 0,
        averageSpeed: 0,
        modeBreakdown: { walking: 0, car: 0, train: 0, bus: 0, bike: 0 }
      };
    }
  },

  // Delete journey
  async deleteJourney(journeyId) {
    try {
      const user = firebase.auth().currentUser;
      if (!user) {
        throw new Error('No user logged in');
      }

      const rateCheck = RateLimit.check('deleteJourney', 10, 60000);
      if (!rateCheck.allowed) {
        throw new Error(rateCheck.message);
      }

      await this.getCollection(user.uid).doc(journeyId).delete();
      console.log('Journey deleted:', journeyId);
      this._cachedJourneys = null;
      this._cacheTime = null;
      
      return true;
    } catch (error) {
      console.error('Error deleting journey:', error);
      throw error;
    }
  },
  _cachedJourneys: null,
  _cacheTime: null,

  async checkActiveJourney(){
  try{
    const user= firebase.auth().currentUser;
    if(!user){return null;}
    const active= await this.getCollection(user.uid)
    .where('userId','==',user.uid)
    .where('status','==','active').limit(1).get();
    if(active.empty){return null;}

    const jourdoc=active.docs[0];
    return{id: jourdoc.id,
        ...jourdoc.data()};
  }catch(error){
    console.error('Error checking active journey:', error);
      return null;
  }
},
 async saveJourneyWithId(journeyId, journeyData) {
    try {
      const user = firebase.auth().currentUser;
      if (!user) {
        throw new Error('No user logged in');
      }

      const rateCheck = RateLimit.check('saveJourney', 10, 60000);
      if (!rateCheck.allowed) {
        throw new Error(rateCheck.message);
      }
      const validation = Security.validateJourneyData(journeyData);
      if (!validation.valid) {
        throw new Error('Invalid journey data: ' + validation.errors.join(', '));
      }

      const sanitizedData = {
        userId: user.uid,
        userEmail: user.email,
        mode: journeyData.mode,
        startTime: journeyData.startTime instanceof Date 
          ? firebase.firestore.Timestamp.fromDate(journeyData.startTime)
          : journeyData.startTime,
        endTime: journeyData.endTime 
          ? (journeyData.endTime instanceof Date 
              ? firebase.firestore.Timestamp.fromDate(journeyData.endTime)
              : journeyData.endTime)
          : firebase.firestore.FieldValue.serverTimestamp(),
        distance: Security.sanitizeNumber(journeyData.distance, 0, 100000),
        duration: parseInt(journeyData.duration) || 0,
        avgSpeed: Security.sanitizeNumber(journeyData.avgSpeed, 0, 500),
        status: journeyData.status || 'completed',
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      };

      if (journeyData.pathPoints && Array.isArray(journeyData.pathPoints)) {
        sanitizedData.pathPoints = journeyData.pathPoints
          .slice(0, 10000)
          .map(point => {
            const coords = Security.validateCoordinates(point.lat, point.lng);
            if (!coords) return null;
            return {
              lat: coords.lat,
              lng: coords.lng,
              timestamp: point.timestamp || Date.now()
            };
          })
          .filter(p => p !== null);
      }

      if (journeyData.alerts && Array.isArray(journeyData.alerts)) {
        sanitizedData.alerts = journeyData.alerts.slice(0, 100);
      }

      if (journeyData.destination) {
        const dest = Security.validateCoordinates(
          journeyData.destination.lat, 
          journeyData.destination.lng
        );
        if (dest) {
          sanitizedData.destination = dest;
        }
      }
      await this.getCollection(user.uid).doc(journeyId).set(sanitizedData);
      
      console.log('Journey saved to Firestore with ID:', journeyId);
      
      return {
        id: journeyId,
        ...sanitizedData,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
    } catch (error) {
      console.error('Error saving journey:', error);
      throw error;
    }
  },

};

// AUTO-SYNC ON NETWORK CHANGE

window.addEventListener('online', async () => {
  console.log('🌐 Back online - auto-syncing...');
  await OfflineSync.autoSync();
});

window.addEventListener('offline', () => {
  console.log('📴 Offline mode - journeys will be saved locally');
  SyncIndicator.offline();
});
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => OfflineSync.autoSync(), 2000);
  });
} else {
  setTimeout(() => OfflineSync.autoSync(), 2000);
}

const EmergencyContactsDB = {
  getCollection(userId) {
    return db.collection('users').doc(userId).collection('emergencyContacts');
  },
  generateSecureToken() {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return Array.from(array, byte => byte.toString(36)).join('').slice(0, 64);
  },

  async getContacts() {
    try{
    const user = firebase.auth().currentUser;
    if (!user) throw new Error('Not authenticated');
   
     const snapshot = await this.getCollection(user.uid)
        .orderBy('name', 'asc')
        .get();

      const contacts = [];
      snapshot.forEach(doc => {
         contacts.push({
          id: doc.id,
          ...doc.data()
        });
      });
      return contacts;
    }catch(error){
      console.error('Error loading emergency contacts:', error);
      throw error;
    }
  },

  async addContact(contactData) {
    const user = firebase.auth().currentUser;
    if (!user) throw new Error('Not authenticated');
    
    const userRef = db.collection('users').doc(user.uid);
    const contactRef = this.getCollection(user.uid).doc(); 
    const verificationToken = this.generateSecureToken();

    try {
await db.runTransaction(async (transaction) => {
    const userDoc = await transaction.get(userRef);
    let userData = userDoc.exists ? userDoc.data() : { 
        monthlyEmailCount: 0, 
        lastEmailMonth: "",
        email: user.email 
    };
    
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    let periodDate = new Date(year, month, 28);
    if (now < periodDate) {
        periodDate = new Date(year, month - 1, 28);
    }
    const periodKey = `period_${periodDate.toISOString().slice(0, 10)}`;
    
    let count = (userData.lastEmailMonth === periodKey) ? (userData.monthlyEmailCount || 0) : 0;
    
    if (count >= 10) {
        throw new Error(`Monthly email limit reached (10/10). Resets on the 28th.`);
    }

    const sanitizedData = {
        userId: user.uid,
        name: Security.sanitizeString(contactData.name, 100),
        email: Security.sanitizeString(contactData.email, 255).toLowerCase(),
        status: 'pending',
        verificationToken: verificationToken,
        tokenCreatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    transaction.set(contactRef, sanitizedData);

    const userUpdate = {
    monthlyEmailCount: count + 1,
    lastEmailMonth: periodKey,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
};

if (!userDoc.exists) {
    userUpdate.email = user.email;
    userUpdate.name = user.displayName || "User";
    userUpdate.createdAt = firebase.firestore.FieldValue.serverTimestamp();
    
    transaction.set(userRef, userUpdate); 
} else {
    transaction.update(userRef, userUpdate);
}
});
      

        //  Send Email Outside Transaction
        try {
            emailjs.init(APP_CONFIG.EMAILJS_PUBLIC_KEY); 
            const verifyLink = `${window.location.origin}/verify.html?uid=${user.uid}&id=${contactRef.id}&token=${verificationToken}`;
            
            await emailjs.send(
                APP_CONFIG.EMAILJS_SERVICE_ID,
                APP_CONFIG.EMAILJS_TEMPLATE_ID,
                {
                    to_name: contactData.name,
                    to_email: contactData.email,
                    from_name: user.displayName || user.email,
                    verification_link: verifyLink,
                    app_name: 'Sentinel GPS'
                }
            );
            return { id: contactRef.id };
        } catch (emailError) {
            console.error('Email failed, rolling back count...');
            await userRef.update({
                monthlyEmailCount: firebase.firestore.FieldValue.increment(-1)
            });
            await contactRef.delete();
            throw new Error('Verification email failed to send. Please try again.');
        }
        } catch (error) {
        console.error("Add contact failed: ", error);
        throw error;
      }
  },
  // Update emergency contact
  async updateContact(contactId, contactData) {
    try {
      const user = firebase.auth().currentUser;
      if (!user) {
        throw new Error('No user logged in');
      }
      const rateCheck = RateLimit.check('updateContact', 10, 60000);
      if (!rateCheck.allowed) {
        throw new Error(rateCheck.message);
      }
      const contactDoc = await this.getCollection(user.uid).doc(contactId).get();
      if (!contactDoc.exists) {
        throw new Error('Contact not found');
      }

      if (contactDoc.data().userId !== user.uid) {
        throw new Error('Permission denied');
      }

      const updates = {
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      };

      if (contactData.name) {
        updates.name = Security.sanitizeString(contactData.name, 100);
        if (updates.name.length < 2 || updates.name.length > 100) {
          throw new Error('Name must be 2-100 characters');
        }
      }

      if (contactData.email) {
        updates.email = Security.sanitizeString(contactData.email, 255).toLowerCase();
        const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
        if (!emailRegex.test(updates.email)) {
          throw new Error('Invalid email format');
        }
      }

      if (contactData.phone !== undefined) {
        updates.phone = contactData.phone 
          ? Security.sanitizeString(contactData.phone, 20)
          : "";
      }

      if (contactData.relationship !== undefined) {
        updates.relationship = contactData.relationship 
          ? Security.sanitizeString(contactData.relationship, 50)
          : "";
      }
 
      await this.getCollection(user.uid).doc(contactId).update(updates);
      
      console.log('Emergency contact updated:', contactId);
      return true;
    } catch (error) {
      console.error('Error updating emergency contact:', error);
      throw error;
    }
  },

  // Delete emergency contact
  async deleteContact(contactId) {
    try {
      const user = firebase.auth().currentUser;
      if (!user) {
        throw new Error('No user logged in');
      }
      const rateCheck = RateLimit.check('deleteContact', 10, 60000);
      if (!rateCheck.allowed) {
        throw new Error(rateCheck.message);
      }
      const contactDoc = await this.getCollection(user.uid).doc(contactId).get();
      if (!contactDoc.exists) {
        throw new Error('Contact not found');
      }

      if (contactDoc.data().userId !== user.uid) {
        throw new Error('Permission denied');
      }

      await this.getCollection(user.uid).doc(contactId).delete();
      
      console.log('✅ Emergency contact deleted:', contactId);
      
      return true;
      
    } catch (error) {
      console.error('Error deleting emergency contact:', error);
      throw error;
    }
  },
  async resendVerification(contactId) {
    try {
      const user = firebase.auth().currentUser;
      if (!user) {
        throw new Error('No user logged in');
      }

      // Get contact
      const contactDoc = await this.getCollection(user.uid).doc(contactId).get();
      if (!contactDoc.exists) {
        throw new Error('Contact not found');
      }

      const contact = contactDoc.data();

      // Verify ownership
      if (contact.userId !== user.uid) {
        throw new Error('Permission denied');
      }

      // Check if already verified
      if (contact.status === 'verified') {
        throw new Error('Contact already verified');
      }

      // Check quota
      const userRef = db.collection('users').doc(user.uid);
      const userDoc = await userRef.get();
      const userData = userDoc.data() || { monthlyEmailCount: 0 };

      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth();
      let periodDate = new Date(year, month, 28);
      if (now < periodDate) {
        periodDate = new Date(year, month - 1, 28);
      }
      const periodKey = `period_${periodDate.toISOString().slice(0, 10)}`;

      let count = (userData.lastEmailMonth === periodKey) ? (userData.monthlyEmailCount || 0) : 0;

      if (count >= 10) {
        throw new Error('Monthly email limit reached (10/10). Resets on the 28th.');
      }

      // Generate new token
      const newToken = this.generateSecureToken();

      // Update contact
      await this.getCollection(user.uid).doc(contactId).update({
        status: 'pending',
        verificationToken: newToken,
        tokenCreatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });

      // Update email count
      await userRef.update({
        monthlyEmailCount: count + 1,
        lastEmailMonth: periodKey,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });

      // Send email
      emailjs.init(APP_CONFIG.EMAILJS_PUBLIC_KEY);
      
      const verifyLink = `${window.location.origin}/verify.html?uid=${user.uid}&id=${contactId}&token=${newToken}`;
      
      await emailjs.send(
        APP_CONFIG.EMAILJS_SERVICE_ID,
        APP_CONFIG.EMAILJS_TEMPLATE_ID,
        {
          to_name: contact.name,
          to_email: contact.email,
          from_name: user.displayName || user.email,
          verification_link: verifyLink,
          app_name: 'Sentinel GPS'
        }
      );

      console.log('✅ Verification email resent');
      return true;

    } catch (error) {
      console.error('❌ Resend error:', error);
      throw error;
    }
  }
};
  
window.JourneyDB = JourneyDB;
window.OfflineSync = OfflineSync;
window.SyncIndicator = SyncIndicator;
window.EmergencyContactsDB = EmergencyContactsDB;
console.log('Database module loaded with security & rate limiting');

emergencyContacts