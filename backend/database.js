const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'flashbrain.db');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error opening SQLite database:', err);
    } else {
        console.log('Connected to SQLite database at:', dbPath);
        db.run('PRAGMA foreign_keys = ON;');
    }
});

// Helper for running queries that don't return rows (INSERT, UPDATE, DELETE)
function run(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function(err) {
            if (err) {
                reject(err);
            } else {
                resolve({ id: this.lastID, changes: this.changes });
            }
        });
    });
}

// Helper for fetching a single row
function get(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => {
            if (err) {
                reject(err);
            } else {
                resolve(row);
            }
        });
    });
}

// Helper for fetching multiple rows
function all(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) {
                reject(err);
            } else {
                resolve(rows);
            }
        });
    });
}

// Initialize tables
db.serialize(() => {
    db.run(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS decks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            title TEXT NOT NULL,
            notes TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS flashcards (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            deck_id INTEGER NOT NULL,
            question TEXT NOT NULL,
            answer TEXT NOT NULL,
            mastered INTEGER DEFAULT 0,
            ease_factor REAL DEFAULT 2.5,
            intervals INTEGER DEFAULT 0,
            repetitions INTEGER DEFAULT 0,
            next_review_at DATETIME,
            distractors TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (deck_id) REFERENCES decks (id) ON DELETE CASCADE
        )
    `);

    // Migration logic for existing databases
    const columns = [
        { name: 'ease_factor', type: 'REAL DEFAULT 2.5' },
        { name: 'intervals', type: 'INTEGER DEFAULT 0' },
        { name: 'repetitions', type: 'INTEGER DEFAULT 0' },
        { name: 'next_review_at', type: 'DATETIME' },
        { name: 'distractors', type: 'TEXT' }
    ];

    columns.forEach(col => {
        db.run(`ALTER TABLE flashcards ADD COLUMN ${col.name} ${col.type}`, (err) => {
            if (err) {
                // Ignore errors related to duplicate column names (column already exists)
                if (!err.message.includes('duplicate column name') && !err.message.includes('already exists')) {
                    console.error(`Migration error: Failed to add column ${col.name}:`, err.message);
                }
            } else {
                console.log(`Migration: Successfully added column ${col.name} to flashcards table.`);
            }
        });
    });
});

module.exports = {
    run,
    get,
    all,
    db
};
