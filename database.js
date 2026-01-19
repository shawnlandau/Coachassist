const Database = require('better-sqlite3');
const path = require('path');

// Initialize database
const dbPath = path.join(__dirname, 'askcoach.db');
const db = new Database(dbPath);

// Enable WAL mode for better concurrency
db.pragma('journal_mode = WAL');

// Run migrations immediately
db.exec(`
  CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    start_datetime_local TEXT NOT NULL,
    venue_name TEXT NOT NULL,
    address TEXT NOT NULL,
    field_number TEXT,
    parking_notes TEXT,
    opponent TEXT,
    arrival_minutes_before INTEGER DEFAULT 45,
    is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS pending_choices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    group_id TEXT NOT NULL,
    pending_intent TEXT NOT NULL,
    candidate_event_ids TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, group_id)
  )
`);

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_pending_choices_expires 
  ON pending_choices(expires_at)
`);

console.log('Database tables created');

// Run migrations
function initDatabase() {
  console.log('Database initialized successfully');
}

// Event queries
const eventQueries = {
  getActiveEvents: db.prepare(`
    SELECT * FROM events 
    WHERE is_active = 1 
    ORDER BY start_datetime_local ASC
  `),

  getEventById: db.prepare(`
    SELECT * FROM events WHERE id = ?
  `),

  createEvent: db.prepare(`
    INSERT INTO events (
      start_datetime_local, venue_name, address, field_number,
      parking_notes, opponent, arrival_minutes_before, is_active
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `),

  updateEvent: db.prepare(`
    UPDATE events 
    SET start_datetime_local = ?, venue_name = ?, address = ?,
        field_number = ?, parking_notes = ?, opponent = ?,
        arrival_minutes_before = ?, is_active = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `),

  deleteEvent: db.prepare(`
    UPDATE events SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?
  `),

  hardDeleteEvent: db.prepare(`
    DELETE FROM events WHERE id = ?
  `)
};

// Pending choice queries
const pendingChoiceQueries = {
  getPendingChoice: db.prepare(`
    SELECT * FROM pending_choices 
    WHERE user_id = ? AND group_id = ? AND expires_at > datetime('now')
  `),

  setPendingChoice: db.prepare(`
    INSERT OR REPLACE INTO pending_choices 
    (user_id, group_id, pending_intent, candidate_event_ids, expires_at)
    VALUES (?, ?, ?, ?, ?)
  `),

  clearPendingChoice: db.prepare(`
    DELETE FROM pending_choices WHERE user_id = ? AND group_id = ?
  `),

  cleanupExpired: db.prepare(`
    DELETE FROM pending_choices WHERE expires_at <= datetime('now')
  `)
};

// Helper functions
function getUpcomingEvents() {
  const events = eventQueries.getActiveEvents.all();
  const now = new Date();
  const windowStart = new Date(now.getTime() - 12 * 60 * 60 * 1000); // 12 hours ago
  const windowEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days ahead

  return events.filter(event => {
    const eventDate = new Date(event.start_datetime_local);
    return eventDate >= windowStart && eventDate <= windowEnd;
  });
}

function getEventsByDay(events, dayName) {
  return events.filter(event => {
    const eventDate = new Date(event.start_datetime_local);
    const dayOfWeek = eventDate.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
    return dayOfWeek === dayName.toLowerCase();
  }).sort((a, b) => new Date(a.start_datetime_local) - new Date(b.start_datetime_local));
}

// Cleanup expired pending choices periodically
setInterval(() => {
  try {
    pendingChoiceQueries.cleanupExpired.run();
  } catch (err) {
    console.error('Error cleaning up expired pending choices:', err);
  }
}, 60000); // Every minute

module.exports = {
  db,
  initDatabase,
  eventQueries,
  pendingChoiceQueries,
  getUpcomingEvents,
  getEventsByDay
};
