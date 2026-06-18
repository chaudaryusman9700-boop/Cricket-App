const express = require('express');
const cors = require('cors');
const matchRoutes = require('./routes/matches');
const playerRoutes = require('./routes/players');
const coachingRoutes = require('./routes/coaching');

require('./models/db');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

app.use('/api/matches', matchRoutes);
app.use('/api/players', playerRoutes);
app.use('/api/coaching', coachingRoutes);

app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Cricket Scoring API is running ✅',
    database: 'lowdb (cricket.json)',
    endpoints: {
      matches: '/api/matches',
      players: '/api/players',
    }
  });
});

app.listen(PORT, () => {
  console.log('Server running on port ' + PORT + ' ✅');
  console.log('Test it: http://localhost:' + PORT);
});