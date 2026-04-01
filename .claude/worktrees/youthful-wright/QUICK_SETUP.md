# Quick Firebase Setup - Copy-Paste Ready

## What You Need to Do:

### 1. Go to Firebase Console
🔗 https://console.firebase.google.com/

### 2. Create/Select Project
- Use existing or create new project
- Project name suggestion: `baghchal-game`

### 3. Enable Services (click each):

**Authentication:**
- Left sidebar → Authentication
- Sign-in method tab
- Enable **Google** provider
- Set support email: `neepsb@gmail.com`

**Firestore Database:**
- Left sidebar → Firestore Database
- Create database → Production mode
- Choose region: `asia-south1` (India) closest to Nepal

### 4. Get Your Config (MOST IMPORTANT!)

1. Click ⚙️ Settings icon → Project Settings
2. Scroll to "Your apps" → Click `</>` Web icon
3. Register app name: `Bagh Chal Web`
4. **COPY** the firebaseConfig values
5. **PASTE** them in `/main.js` lines 4-10

Replace this:
```javascript
const firebaseConfig = {
  apiKey: "YOUR_API_KEY_HERE",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID"
};
```

With YOUR actual values from Firebase!

### 5. Set Firestore Rules

Go to Firestore Database → Rules tab → Paste this:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      allow read, create, update: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

Click **Publish**

### 6. Add GitHub Pages Domain

Authentication → Settings → Authorized domains → Add domain:
```
neepurna.github.io
```

## Testing Locally

1. Update Firebase config in `main.js`
2. Run dev server: `npm run dev`
3. Click "Sign In" → "Sign in with Google"
4. Choose Google account
5. Enter username
6. See profile in header!

## What's Implemented:

✅ Google Sign-In button  
✅ Username setup for new users  
✅ Profile menu in header with:
  - User avatar
  - Username display
  - Stats (games played, tiger wins, goat wins)
  - Sign out button
✅ Automatic stats tracking after each game  
✅ Data persistence in Firestore  
✅ Anti-repetition AI system to prevent infinite loops

## Need Help?

Check `FIREBASE_SETUP.md` for detailed instructions with troubleshooting!
