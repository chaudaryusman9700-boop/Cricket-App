const express = require('express');
const router = express.Router();

// Python AI service URL — change this when deployed
const AI_URL = process.env.AI_URL || 'http://localhost:5000';

// ── Helper to call Python AI ──────────────────────────────────
const callAI = async (endpoint, body) => {
  const res = await fetch(`${AI_URL}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`AI service error: ${res.status}`);
  return res.json();
};

// ─────────────────────────────────────────────────────────────
// POST /api/coaching/batting — get batting tips
// ─────────────────────────────────────────────────────────────
router.post('/batting', async (req, res) => {
  try {
    const result = await callAI('/coach/batting', req.body);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
// POST /api/coaching/bowling — get bowling tips
// ─────────────────────────────────────────────────────────────
router.post('/bowling', async (req, res) => {
  try {
    const result = await callAI('/coach/bowling', req.body);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
// POST /api/coaching/full — get both batting + bowling tips
// ─────────────────────────────────────────────────────────────
router.post('/full', async (req, res) => {
  try {
    const result = await callAI('/coach/full', req.body);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;