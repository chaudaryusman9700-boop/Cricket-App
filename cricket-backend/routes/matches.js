const express = require('express');
const router = express.Router();
const db = require('../models/db');

// POST /api/matches — Save match
router.post('/', (req, res) => {
  try {
    const { match, batsmenStats, bowlerStats, savedAt } = req.body;
    if (!match) return res.status(400).json({ error: 'match data is required' });

    const newMatch = {
      id: Date.now().toString(),
      battingTeam: match.battingTeam || 'Unknown',
      bowlingTeam: match.bowlingTeam || '',
      venue: match.venue || '',
      matchDate: match.matchDate || '',
      matchTime: match.matchTime || '',
      totalOvers: match.totalOvers || 10,
      runs: match.runs || 0,
      wickets: match.wickets || 0,
      balls: match.balls || 0,
      players: match.players || [],
      bowlingPlayers: match.bowlingPlayers || [],
      ballHistory: match.ballHistory || [],
      batsmenStats: batsmenStats || {},
      bowlerStats: bowlerStats || {},
      savedAt: savedAt || Date.now(),
      createdAt: new Date().toISOString(),
    };

    db.get('matches').push(newMatch).write();

    res.status(201).json({ success: true, matchId: newMatch.id, message: 'Match saved!' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save match', detail: err.message });
  }
});

// GET /api/matches — Get all matches
router.get('/', (req, res) => {
  try {
    const matches = db.get('matches')
      .orderBy(['savedAt'], ['desc'])
      .take(50)
      .map(m => ({
        _id: m.id,
        battingTeam: m.battingTeam,
        bowlingTeam: m.bowlingTeam,
        venue: m.venue,
        matchDate: m.matchDate,
        matchTime: m.matchTime,
        totalOvers: m.totalOvers,
        runs: m.runs,
        wickets: m.wickets,
        balls: m.balls,
        savedAt: m.savedAt,
        createdAt: m.createdAt,
      }))
      .value();

    res.json({ success: true, count: matches.length, matches });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch matches', detail: err.message });
  }
});

// GET /api/matches/:id — Get one match
router.get('/:id', (req, res) => {
  try {
    const match = db.get('matches').find({ id: req.params.id }).value();
    if (!match) return res.status(404).json({ error: 'Match not found' });
    res.json({ success: true, match: { ...match, _id: match.id } });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch match', detail: err.message });
  }
});

// DELETE /api/matches/:id — Delete match
router.delete('/:id', (req, res) => {
  try {
    const match = db.get('matches').find({ id: req.params.id }).value();
    if (!match) return res.status(404).json({ error: 'Match not found' });
    db.get('matches').remove({ id: req.params.id }).write();
    res.json({ success: true, message: 'Match deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete match', detail: err.message });
  }
});

module.exports = router;