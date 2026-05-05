const low = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');
const path = require('path');

const adapter = new FileSync(path.join(__dirname, '..', 'cricket.json'));
const db = low(adapter);

// Set default structure
db.defaults({ matches: [] }).write();

console.log('Database ready ✅ (cricket.json)');

module.exports = db;