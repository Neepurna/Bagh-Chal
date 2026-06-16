import { getSupabaseClient } from '../services/supabaseClient.js';

function unwrapNotification(row) {
  const payload = row.payload || {};
  return {
    id: row.id,
    type: row.type,
    status: row.status,
    createdAt: row.created_at ? { toDate: () => new Date(row.created_at) } : null,
    ...payload
  };
}

export function createSocialService({ getContext }) {
  let pollId = null;

  function getRequiredContext() {
    const context = getContext();
    const supabase = getSupabaseClient();
    if (!context?.currentUser || !supabase) return null;
    return { ...context, supabase };
  }

  function stopSocialListeners() {
    if (pollId) {
      clearInterval(pollId);
      pollId = null;
    }
  }

  async function fetchFriends(context) {
    const { data, error } = await context.supabase
      .from('friendships')
      .select('friend_id,friend_username,status')
      .eq('owner_id', context.currentUser.id)
      .eq('status', 'accepted')
      .order('updated_at', { ascending: false });
    if (error) throw error;
    return (data || []).map((row) => ({
      uid: row.friend_id,
      username: row.friend_username || 'Friend'
    }));
  }

  async function fetchNotifications(context) {
    const { data, error } = await context.supabase
      .from('notifications')
      .select('*')
      .eq('recipient_id', context.currentUser.id)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data || []).map(unwrapNotification);
  }

  function startSocialListeners({ onFriends, onNotifications, onChallengeAccepted }) {
    const context = getRequiredContext();
    if (!context) return;
    stopSocialListeners();

    const refresh = async () => {
      try {
        const [friends, notifications] = await Promise.all([
          fetchFriends(context),
          fetchNotifications(context)
        ]);
        onFriends?.(friends);
        onNotifications?.(notifications);
        notifications.filter((item) => item.type === 'challenge_accepted').forEach((item) => {
          onChallengeAccepted?.(item);
        });
      } catch (error) {
        console.error('[social] listener refresh failed:', error);
      }
    };

    refresh();
    pollId = setInterval(refresh, 5000);
  }

  async function searchUser(username) {
    const context = getRequiredContext();
    if (!context) return { status: 'error' };

    const clean = username.trim().toLowerCase();
    if (!clean) return { status: 'empty' };

    try {
      const { data, error } = await context.supabase
        .from('player_profiles')
        .select('auth_user_id,username,display_name,photo_url')
        .eq('username', clean)
        .maybeSingle();
      if (error) throw error;
      if (!data) return { status: 'not_found' };
      if (data.auth_user_id === context.currentUser.id) return { status: 'self' };

      const { data: friend } = await context.supabase
        .from('friendships')
        .select('status')
        .eq('owner_id', context.currentUser.id)
        .eq('friend_id', data.auth_user_id)
        .maybeSingle();

      return {
        status: 'found',
        uid: data.auth_user_id,
        data: {
          username: data.username,
          displayUsername: data.display_name,
          photoURL: data.photo_url
        },
        friendStatus: friend?.status || null
      };
    } catch (error) {
      console.error('searchUser error:', error);
      return { status: 'error' };
    }
  }

  async function sendFriendRequest(toUid, toUsername) {
    const context = getRequiredContext();
    if (!context) return;
    const now = new Date().toISOString();

    const { error } = await context.supabase.from('friendships').upsert({
      owner_id: context.currentUser.id,
      friend_id: toUid,
      status: 'pending',
      direction: 'sent',
      friend_username: toUsername,
      updated_at: now
    }, { onConflict: 'owner_id,friend_id' });
    if (error) throw error;

    await context.supabase.from('notifications').insert({
      recipient_id: toUid,
      sender_id: context.currentUser.id,
      type: 'friend_request',
      status: 'pending',
      payload: {
        from: context.currentUser.id,
        fromUsername: context.userStats.username,
        fromDisplay: context.userStats.username,
        fromPhoto: context.currentUser.photoURL || ''
      }
    });
  }

  async function acceptFriendRequest(fromUid, fromUsername, notifId) {
    const context = getRequiredContext();
    if (!context) return;

    const { error } = await context.supabase.rpc('accept_friend_request', {
      request_notification_id: notifId
    });
    if (error) throw error;

    void fromUid;
    void fromUsername;
  }

  async function declineFriendRequest(notifId) {
    await dismissNotif(notifId);
  }

  async function dismissNotif(notifId) {
    const context = getRequiredContext();
    if (!context || !notifId) return;
    await context.supabase.from('notifications').delete().eq('id', notifId);
  }

  async function sendChallenge({ toUid, selectedSide, challengeTime }) {
    const context = getRequiredContext();
    if (!context) return null;

    const { data, error } = await context.supabase.rpc('send_game_challenge', {
      target_user_id: toUid,
      selected_side: selectedSide || 'random',
      selected_time_control: challengeTime || '5m'
    });
    if (error) throw error;

    return {
      challengeId: data?.challenge_id,
      challengerSide: data?.challenger_side,
      opponentSide: data?.opponent_side
    };
  }

  async function cancelPendingChallenge({ toUid, pendingChallengeId }) {
    const context = getRequiredContext();
    if (!context || !toUid || !pendingChallengeId) return;
    await context.supabase.from('notifications').delete()
      .eq('id', pendingChallengeId)
      .eq('recipient_id', toUid);
  }

  async function acceptChallenge({
    notifId,
    challengerUid,
    challengerUsername,
    mySide,
    theirSide,
    challengeTimeSelected,
    buildInitialRoomState
  }) {
    const context = getRequiredContext();
    if (!context) return null;

    const roomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    const { data: room, error } = await context.supabase.from('rooms').insert({
      room_code: roomCode,
      host_id: challengerUid,
      host_username: challengerUsername || 'Player',
      guest_id: context.currentUser.id,
      guest_username: context.userStats?.username || 'Player',
      host_side: theirSide,
      guest_side: mySide,
      time_control: challengeTimeSelected,
      status: 'playing',
      board_state: buildInitialRoomState(),
      updated_at: new Date().toISOString()
    }).select('*').single();
    if (error) throw error;

    await context.supabase.from('notifications').insert({
      recipient_id: challengerUid,
      sender_id: context.currentUser.id,
      type: 'challenge_accepted',
      payload: {
        from: context.currentUser.id,
        fromUsername: context.userStats.username,
        roomId: room.id,
        mySide: theirSide,
        challengeTime: challengeTimeSelected
      }
    });
    await dismissNotif(notifId);
    return { roomId: room.id };
  }

  async function declineChallenge({ notifId, challengerUid }) {
    const context = getRequiredContext();
    if (!context) return;
    await dismissNotif(notifId);
    await context.supabase.from('notifications').insert({
      recipient_id: challengerUid,
      sender_id: context.currentUser.id,
      type: 'challenge_declined',
      payload: {
        from: context.currentUser.id,
        fromUsername: context.userStats.username
      }
    });
  }

  return {
    stopSocialListeners,
    startSocialListeners,
    searchUser,
    sendFriendRequest,
    acceptFriendRequest,
    declineFriendRequest,
    dismissNotif,
    sendChallenge,
    cancelPendingChallenge,
    acceptChallenge,
    declineChallenge
  };
}
