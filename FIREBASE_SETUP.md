# Firebase Authentication Setup Guide

## Step 1: Create Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click "Add project" or select existing project
3. Enter project name: `baghchal-game` (or your preferred name)
4. Follow the setup wizard

## Step 2: Enable Google Authentication

1. In Firebase Console, go to **Authentication** → **Sign-in method**
2. Click on **Google** provider
3. Toggle **Enable**
4. Set support email (the one shown in your screenshot: `neepsb@gmail.com`)
5. Save

## Step 3: Enable Firestore Database

1. Go to **Firestore Database** in sidebar
2. Click **Create database**
3. Start in **production mode** (you can change rules later)
4. Choose your region (closest to Nepal: `asia-south1` or `asia-southeast1`)
5. Click **Enable**

## Step 4: Get Firebase Configuration

1. Go to **Project Settings** (gear icon) → **General**
2. Scroll to **Your apps** section
3. Click **Web** icon (`</>`)
4. Register your app with name: `Bagh Chal Web`
5. Copy the `firebaseConfig` object
6. Replace values in `main.js` (lines 4-10)

Example:
```javascript
const firebaseConfig = {
  apiKey: "AIzaSyC_your_actual_api_key_here",
  authDomain: "baghchal-game-12345.firebaseapp.com",
  projectId: "baghchal-game-12345",
  storageBucket: "baghchal-game-12345.appspot.com",
  messagingSenderId: "123456789012",
  appId: "1:123456789012:web:abcdef123456789"
};
```

## Step 5: Add Authorized Domains

1. In **Authentication** → **Settings** → **Authorized domains**
2. Add your domains:
   - `localhost` (already added)
   - Your GitHub Pages domain: `neepurna.github.io`
   - Any custom domain you use

## Step 6: Configure Firestore Security Rules

1. Go to **Firestore Database** → **Rules**
2. Replace with these rules:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      // Users can read their own data
      allow read: if request.auth != null && request.auth.uid == userId;
      // Users can create their own document on first login
      allow create: if request.auth != null && request.auth.uid == userId;
      // Users can update their own stats
      allow update: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

## Step 7: Test Authentication

1. Save all files
2. Open your app in browser
3. Click "Sign In" button
4. Click "Sign in with Google"
5. Choose your Google account
6. Enter username when prompted
7. You should see your profile in the header!

## Troubleshooting

### "Firebase not initialized" error
- Make sure Firebase config is correct
- Check browser console for specific errors
- Verify all Firebase services are enabled

### "Unauthorized domain" error
- Add your domain in Firebase Console → Authentication → Settings → Authorized domains

### Username not saving
- Check Firestore security rules
- Verify Firestore is enabled in Firebase Console

### Stats not updating
- Check browser console for errors
- Verify Firestore rules allow updates

## Project Structure

```
users (collection)
  └── {userId} (document)
      ├── username: string
      ├── email: string
      ├── gamesPlayed: number
      ├── tigerWins: number
      ├── goatWins: number
      └── createdAt: timestamp
```

## Notes

- The Google sign-in popup might be blocked by browser - allow popups for your domain
- Make sure you're using HTTPS in production (GitHub Pages uses HTTPS by default)
- Firebase free tier allows 50,000 reads/day and 20,000 writes/day - more than enough for personal use!
