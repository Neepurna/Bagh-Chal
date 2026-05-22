import { getSupabaseClient } from '../services/supabaseClient.js';
import { PHASE, PIECE_TYPES } from '../config/gameConfig.js';

export function buildInitialRoomState() {
  const board = Array(25).fill(PIECE_TYPES.EMPTY);
  board[0] = PIECE_TYPES.TIGER;
  board[4] = PIECE_TYPES.TIGER;
  board[20] = PIECE_TYPES.TIGER;
  board[24] = PIECE_TYPES.TIGER;

  return {
    board,
    currentPlayer: PIECE_TYPES.GOAT,
    phase: PHASE.PLACEMENT,
    goatsPlaced: 0,
    goatsCaptured: 0,
    goatIdentities: {},
    tigerIdentities: { '0': 0, '4': 1, '20': 2, '24': 3 }
  };
}

export function createMultiplayerService({ getContext }) {
  let currentRoomChannel = null;
  let lobbyChannel = null;
  let applyingRoomSnapshot = false;

  function getClient() {
    return getSupabaseClient();
  }

  function stopRoomSyncListeners() {
    const supabase = getClient();
    if (currentRoomChannel) {
      supabase?.removeChannel(currentRoomChannel);
      currentRoomChannel = null;
    }
    stopLobbyListener();
  }

  function stopLobbyListener() {
    const supabase = getClient();
    if (lobbyChannel) {
      supabase?.removeChannel(lobbyChannel);
      lobbyChannel = null;
    }
  }

  function isApplyingRoomSnapshot() {
    return applyingRoomSnapshot;
  }

  function withAppliedRoomSnapshot(callback) {
    applyingRoomSnapshot = true;
    try {
      callback();
    } finally {
      applyingRoomSnapshot = false;
    }
  }

  async function createRoom({ roomCode, hostSide, guestSide, timeControl, initial }) {
    const supabase = getClient();
    const { currentUser, userStats } = getContext();
    if (!supabase || !currentUser) throw new Error('Sign in required.');

    const { data, error } = await supabase
      .from('rooms')
      .insert({
        room_code: roomCode,
        host_id: currentUser.id,
        host_username: userStats?.username || currentUser.displayName || 'Player',
        host_side: hostSide,
        guest_side: guestSide,
        time_control: timeControl,
        status: 'waiting',
        board_state: initial,
        updated_at: new Date().toISOString()
      })
      .select('*')
      .single();

    if (error) throw error;
    return data;
  }

  async function joinRoomByCode({ roomCode, wantedSide }) {
    const supabase = getClient();
    const { currentUser, userStats } = getContext();
    if (!supabase || !currentUser) throw new Error('Sign in required.');

    const { data: room, error: fetchError } = await supabase
      .from('rooms')
      .select('*')
      .eq('room_code', roomCode)
      .eq('status', 'waiting')
      .maybeSingle();

    if (fetchError) throw fetchError;
    if (!room) return { status: 'not_found' };
    if (room.host_id === currentUser.id) return { status: 'self' };
    if (room.guest_side !== wantedSide) return { status: 'wrong_side', room };

    const { data, error } = await supabase
      .from('rooms')
      .update({
        guest_id: currentUser.id,
        guest_username: userStats?.username || currentUser.displayName || 'Player',
        status: 'playing',
        updated_at: new Date().toISOString()
      })
      .eq('id', room.id)
      .eq('status', 'waiting')
      .select('*')
      .single();

    if (error) throw error;
    return { status: 'joined', room: data };
  }

  async function syncRoomState({ roomId, gameMode, payload }) {
    const supabase = getClient();
    if (!supabase || !roomId || gameMode !== 'multiplayer' || applyingRoomSnapshot) return;
    await supabase
      .from('rooms')
      .update({
        board_state: payload,
        updated_at: new Date().toISOString()
      })
      .eq('id', roomId);
  }

  async function fetchRoom(roomId) {
    const supabase = getClient();
    if (!supabase || !roomId) return null;
    const { data, error } = await supabase.from('rooms').select('*').eq('id', roomId).maybeSingle();
    if (error) {
      console.error('[MP] Room fetch error:', error);
      return null;
    }
    return data;
  }

  function subscribeToRoom(roomId, { onRoomState, onRoomFinished }) {
    const supabase = getClient();
    if (!supabase || !roomId) return;
    if (currentRoomChannel) supabase.removeChannel(currentRoomChannel);

    fetchRoom(roomId).then((room) => {
      if (room) {
        onRoomState?.(room);
        if (room.status === 'finished' && room.winner) onRoomFinished?.(room);
      }
    });

    currentRoomChannel = supabase
      .channel(`room:${roomId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'rooms',
        filter: `id=eq.${roomId}`
      }, (payload) => {
        const room = payload.new;
        if (!room) return;
        onRoomState?.(room);
        if (room.status === 'finished' && room.winner) onRoomFinished?.(room);
      })
      .subscribe();
  }

  async function finalizeRoom({ roomId, winner, winnerMessage }) {
    const supabase = getClient();
    if (!supabase || !roomId || applyingRoomSnapshot) return;
    await supabase.from('rooms').update({
      status: 'finished',
      winner,
      winner_message: winnerMessage,
      updated_at: new Date().toISOString()
    }).eq('id', roomId);
  }

  function startLobbyListener(roomId, { onRoomReady }) {
    const supabase = getClient();
    if (!supabase || !roomId) return;
    stopLobbyListener();

    lobbyChannel = supabase
      .channel(`room-lobby:${roomId}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'rooms',
        filter: `id=eq.${roomId}`
      }, (payload) => {
        const room = payload.new;
        if (room?.status === 'playing' && room.guest_id) {
          stopLobbyListener();
          onRoomReady?.(room);
        }
      })
      .subscribe();
  }

  async function cancelWaitingRoom(roomId) {
    const supabase = getClient();
    const { currentUser } = getContext();
    if (!supabase || !roomId || !currentUser) return;
    await supabase.from('rooms').delete()
      .eq('id', roomId)
      .eq('host_id', currentUser.id)
      .eq('status', 'waiting');
  }

  return {
    stopRoomSyncListeners,
    stopLobbyListener,
    isApplyingRoomSnapshot,
    withAppliedRoomSnapshot,
    createRoom,
    joinRoomByCode,
    syncRoomState,
    subscribeToRoom,
    finalizeRoom,
    startLobbyListener,
    cancelWaitingRoom
  };
}
