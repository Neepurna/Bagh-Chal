# Firebase Setup

Use this only if you want authentication, stats, friends, notifications, or multiplayer-related Firestore data.

## 1. Create a Firebase project

1. Open the Firebase Console.
2. Create or select a project.
3. Add a Web app.

## 2. Enable products

- Authentication
  - Enable Google sign-in
- Firestore Database
  - Create a database
  - Choose a region near your users

## 3. Add your web config

Copy your Firebase web config and place it in the app’s auth/config setup where this project expects it.

Typical values include:

```js
{
  apiKey: "...",
  authDomain: "...",
  projectId: "...",
  storageBucket: "...",
  messagingSenderId: "...",
  appId: "..."
}
```

## 4. Firestore rules

Deploy Firestore rules that match the app’s friend, stats, and notification flows.

## 5. Verify

After configuration:

```bash
npm run dev
```

Then verify:

- Google sign-in works
- user profile/stats load
- Firestore reads and writes succeed

## Notes

- Gameplay AI does not depend on Firebase.
- Firebase is optional for the single-player MVP.
