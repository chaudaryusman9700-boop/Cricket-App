const express = require('express');
const router = express.Router();
const db = require('../models/db');

// GET /api/players — All players career stats
router.get('/', (req, res) => {
  try {
    const matches = db.get('matches').value();
    const playerMap = {};

    matches.forEach(m => {
      Object.entries(m.batsmenStats || {}).forEach(([name, s]) => {
        if (!playerMap[name]) playerMap[name] = { name, matches: 0, totalRuns: 0, totalBalls: 0, totalWickets: 0, highestScore: 0 };
        playerMap[name].matches += 1;
        playerMap[name].totalRuns += s.runs || 0;
        playerMap[name].totalBalls += s.balls || 0;
        if ((s.runs || 0) > playerMap[name].highestScore) playerMap[name].highestScore = s.runs;
      });
      Object.entries(m.bowlerStats || {}).forEach(([name, s]) => {
        if (!playerMap[name]) playerMap[name] = { name, matches: 0, totalRuns: 0, totalBalls: 0, totalWickets: 0, highestScore: 0 };
        playerMap[name].totalWickets += s.wickets || 0;
      });
    });

    const players = Object.values(playerMap).map(p => ({
      ...p,
      battingAvg: p.matches > 0 ? (p.totalRuns / p.matches).toFixed(1) : '0.0',
      strikeRate: p.totalBalls > 0 ? ((p.totalRuns / p.totalBalls) * 100).toFixed(1) : '0.0',
    })).sort((a, b) => b.totalRuns - a.totalRuns);

    res.json({ success: true, count: players.length, players });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch players', detail: err.message });
  }
});

// GET /api/players/:name — Single player
router.get('/:name', (req, res) => {
  try {
    const name = decodeURIComponent(req.params.name);
    const matches = db.get('matches').value();
    let totalRuns = 0, totalBalls = 0, totalWickets = 0, highestScore = 0, matchCount = 0;
    const matchHistory = [];

    matches.forEach(m => {
      const bat = (m.batsmenStats || {})[name];
      const bowl = (m.bowlerStats || {})[name];
      if (bat || bowl) {
        matchCount++;
        if (bat) {
          totalRuns += bat.runs || 0;
          totalBalls += bat.balls || 0;
          if ((bat.runs || 0) > highestScore) highestScore = bat.runs;
        }
        if (bowl) totalWickets += bowl.wickets || 0;
        matchHistory.push({
          matchId: m.id, battingTeam: m.battingTeam,
          venue: m.venue, matchDate: m.matchDate,
          runs: bat?.runs || 0, balls: bat?.balls || 0,
          wickets: bowl?.wickets || 0, savedAt: m.savedAt,
        });
      }
    });

    if (matchCount === 0) return res.status(404).json({ error: 'Player not found' });

    res.json({
      success: true,
      player: {
        name, matches: matchCount, totalRuns, totalBalls,
        totalWickets, highestScore,
        battingAvg: matchCount > 0 ? (totalRuns / matchCount).toFixed(1) : '0.0',
        strikeRate: totalBalls > 0 ? ((totalRuns / totalBalls) * 100).toFixed(1) : '0.0',
        matchHistory: matchHistory.sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0)),
      }
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch player', detail: err.message });
  }
});

module.exports = router;