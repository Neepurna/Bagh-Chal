import process from 'node:process';
import { cert, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { createClient } from '@supabase/supabase-js';

const {
  FIREBASE_SERVICE_ACCOUNT_JSON,
  GOOGLE_APPLICATION_CREDENTIALS,
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY
} = process.env;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before running migration.');
}

if (FIREBASE_SERVICE_ACCOUNT_JSON) {
  initializeApp({ credential: cert(JSON.parse(FIREBASE_SERVICE_ACCOUNT_JSON)) });
} else if (GOOGLE_APPLICATION_CREDENTIALS) {
  initializeApp();
} else {
  throw new Error('Set FIREBASE_SERVICE_ACCOUNT_JSON or GOOGLE_APPLICATION_CREDENTIALS.');
}

const firestore = getFirestore();
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

function leaderboardScore(data) {
  const rating = data.rating ?? 500;
  const games = data.gamesPlayed || 0;
  const adventure = data.adventureCompleted || data.adventureLevel || 0;
  return Math.round((rating + Math.min(games, 500) + adventure * 100) / 3);
}

async function upsertProfiles() {
  const snap = await firestore.collection('users').get();
  const rows = snap.docs.map((doc) => {
    const data = doc.data() || {};
    return {
      firebase_uid: doc.id,
      username: data.username || null,
      display_name: data.displayUsername || data.username || data.email || 'Player',
      email: data.email || null,
      photo_url: data.photoURL || null,
      rating: data.rating ?? 500,
      games_played: data.gamesPlayed || 0,
      tiger_wins: data.tigerWins || 0,
      goat_wins: data.goatWins || 0,
      rated_wins: data.ratedWins || 0,
      rated_losses: data.ratedLosses || 0,
      adventure_level: data.adventureLevel || 0,
      adventure_completed: data.adventureCompleted || 0,
      leaderboard_score: data.leaderboardScore || leaderboardScore(data),
      updated_at: new Date().toISOString()
    };
  });

  if (!rows.length) return 0;
  const { error } = await supabase.from('player_profiles').upsert(rows, { onConflict: 'firebase_uid' });
  if (error) throw error;
  return rows.length;
}

async function migrateFriendships() {
  const owners = await firestore.collection('friends').get();
  const rows = [];

  for (const owner of owners.docs) {
    const list = await owner.ref.collection('list').get();
    list.forEach((doc) => {
      const data = doc.data() || {};
      rows.push({
        owner_uid: owner.id,
        friend_uid: doc.id,
        status: data.status || 'pending',
        direction: data.direction || null,
        friend_username: data.username || null,
        updated_at: new Date().toISOString()
      });
    });
  }

  if (!rows.length) return 0;
  const { error } = await supabase.from('friendships').upsert(rows, { onConflict: 'owner_uid,friend_uid' });
  if (error) throw error;
  return rows.length;
}

async function migrateNotifications() {
  const owners = await firestore.collection('notifications').get();
  const rows = [];

  for (const owner of owners.docs) {
    const items = await owner.ref.collection('items').get();
    items.forEach((doc) => {
      const data = doc.data() || {};
      rows.push({
        recipient_uid: owner.id,
        sender_uid: data.from || null,
        type: data.type || 'unknown',
        status: data.status || 'pending',
        payload: { firebase_id: doc.id, ...data }
      });
    });
  }

  if (!rows.length) return 0;
  const { error } = await supabase.from('notifications').insert(rows);
  if (error) throw error;
  return rows.length;
}

async function migrateRooms() {
  const snap = await firestore.collection('rooms').get();
  const rows = snap.docs.map((doc) => {
    const data = doc.data() || {};
    return {
      host_uid: data.hostUid,
      guest_uid: data.guestUid || null,
      host_username: data.hostUsername || null,
      guest_username: data.guestUsername || null,
      host_side: data.hostSide || 'tiger',
      guest_side: data.guestSide || null,
      time_control: data.timeControl || null,
      status: data.status || 'waiting',
      board_state: {
        board: data.board || null,
        currentPlayer: data.currentPlayer || null,
        phase: data.phase || null,
        goatsPlaced: data.goatsPlaced || 0,
        goatsCaptured: data.goatsCaptured || 0,
        goatIdentities: data.goatIdentities || {},
        tigerIdentities: data.tigerIdentities || {}
      },
      winner: data.winner || null,
      winner_message: data.winnerMessage || null,
      updated_at: new Date().toISOString()
    };
  }).filter((row) => row.host_uid);

  if (!rows.length) return 0;
  const { error } = await supabase.from('rooms').insert(rows);
  if (error) throw error;
  return rows.length;
}

const counts = {
  profiles: await upsertProfiles(),
  friendships: await migrateFriendships(),
  notifications: await migrateNotifications(),
  rooms: await migrateRooms()
};

console.log('Firebase -> Supabase migration complete:', counts);
