// ─────────────────────────────────────────────────────────
// api.js — place this in your React Native app root folder
// Import and use this in scoring.js and history.js
// ─────────────────────────────────────────────────────────

// ── Production URL (Railway) — works from anywhere, no PC needed ──
const BASE_URL = 'https://cricket-app-production.up.railway.app';

// ─── Save a match to the server ───────────────────────────
export const saveMatchToServer = async (match, batsmenStats, bowlerStats) => {
  try {
    const response = await fetch(`${BASE_URL}/api/matches`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ match, batsmenStats, bowlerStats, savedAt: Date.now() }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Server error');
    return { success: true, matchId: data.matchId };
  } catch (err) {
    console.error('saveMatchToServer:', err.message);
    return { success: false, error: err.message };
  }
};

// ─── Get all matches from server ──────────────────────────
export const fetchMatchesFromServer = async () => {
  try {
    const response = await fetch(`${BASE_URL}/api/matches`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Server error');
    return { success: true, matches: data.matches };
  } catch (err) {
    console.error('fetchMatchesFromServer:', err.message);
    return { success: false, matches: [] };
  }
};

// ─── Get one match by ID ──────────────────────────────────
export const fetchMatchById = async (id) => {
  try {
    const response = await fetch(`${BASE_URL}/api/matches/${id}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Server error');
    return { success: true, match: data.match };
  } catch (err) {
    console.error('fetchMatchById:', err.message);
    return { success: false, match: null };
  }
};

// ─── Delete a match by ID ─────────────────────────────────
export const deleteMatchFromServer = async (id) => {
  try {
    const response = await fetch(`${BASE_URL}/api/matches/${id}`, { method: 'DELETE' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Server error');
    return { success: true };
  } catch (err) {
    console.error('deleteMatchFromServer:', err.message);
    return { success: false, error: err.message };
  }
};

// ─── Get all player career stats ─────────────────────────
export const fetchPlayers = async () => {
  try {
    const response = await fetch(`${BASE_URL}/api/players`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Server error');
    return { success: true, players: data.players };
  } catch (err) {
    console.error('fetchPlayers:', err.message);
    return { success: false, players: [] };
  }
};

// ─── Get one player career stats ─────────────────────────
export const fetchPlayerStats = async (name) => {
  try {
    const response = await fetch(`${BASE_URL}/api/players/${encodeURIComponent(name)}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Server error');
    return { success: true, player: data.player };
  } catch (err) {
    console.error('fetchPlayerStats:', err.message);
    return { success: false, player: null };
  }
};

// ─── AI Coach: batting tips (ML model) ───────────────────
export const getBattingTips = async (payload) => {
  try {
    const response = await fetch(`${BASE_URL}/api/coaching/batting`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'AI service error');
    return { success: true, ...data };
  } catch (err) {
    console.error('getBattingTips:', err.message);
    return { success: false, error: err.message };
  }
};

// ─── AI Coach: bowling tips (ML model) ───────────────────
export const getBowlingTips = async (payload) => {
  try {
    const response = await fetch(`${BASE_URL}/api/coaching/bowling`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'AI service error');
    return { success: true, ...data };
  } catch (err) {
    console.error('getBowlingTips:', err.message);
    return { success: false, error: err.message };
  }
};

// ─── AI Coach: full coaching (batting + bowling in one call) ───
export const getFullCoaching = async (battingPayload, bowlingPayload) => {
  try {
    const response = await fetch(`${BASE_URL}/api/coaching/full`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ batting: battingPayload, bowling: bowlingPayload }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'AI service error');
    return { success: true, ...data };
  } catch (err) {
    console.error('getFullCoaching:', err.message);
    return { success: false, error: err.message };
  }
};