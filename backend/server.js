const express = require('express');
const cors = require('cors');
// Import GoogleGenAI from the updated '@google/genai' package
const { GoogleGenAI } = require('@google/genai'); 
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('./database');
const multer = require('multer');
const pdfParse = require('pdf-parse');
require('dotenv').config();

// Configure Multer for PDF file uploading
const upload = multer({ 
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'flashbrain_super_secret_key_123';

// Initialize using the correct initialization syntax
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Middleware to authenticate JWT tokens
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Access token required.' });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ error: 'Invalid or expired token.' });
        }
        req.user = user;
        next();
    });
};

// ================= AUTH ROUTES =================

// Register Route
app.post('/api/register', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password are required.' });
        }
        if (username.length < 3 || password.length < 6) {
            return res.status(400).json({ error: 'Username must be at least 3 characters and password at least 6.' });
        }

        // Check if username already exists
        const existingUser = await db.get('SELECT * FROM users WHERE username = ?', [username]);
        if (existingUser) {
            return res.status(400).json({ error: 'Username is already taken.' });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Insert new user
        await db.run('INSERT INTO users (username, password_hash) VALUES (?, ?)', [username, hashedPassword]);

        res.status(201).json({ success: true, message: 'User registered successfully!' });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ error: 'Registration failed.' });
    }
});

// Login Route
app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password are required.' });
        }

        const user = await db.get('SELECT * FROM users WHERE username = ?', [username]);
        if (!user) {
            return res.status(400).json({ error: 'Invalid username or password.' });
        }

        const validPassword = await bcrypt.compare(password, user.password_hash);
        if (!validPassword) {
            return res.status(400).json({ error: 'Invalid username or password.' });
        }

        const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
        res.json({ success: true, token, username: user.username });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Login failed.' });
    }
});

// ================= DECK & FLASHCARD ROUTES =================

// Create / Save Deck
app.post('/api/decks', authenticateToken, async (req, res) => {
    try {
        const { title, notes, flashcards } = req.body;
        const userId = req.user.id;

        if (!title || !flashcards || !Array.isArray(flashcards)) {
            return res.status(400).json({ error: 'Title and flashcards array are required.' });
        }

        // Save Deck entry
        const deckResult = await db.run(
            'INSERT INTO decks (user_id, title, notes) VALUES (?, ?, ?)',
            [userId, title, notes || '']
        );
        const deckId = deckResult.id;

        // Save all associated cards
        for (const card of flashcards) {
            const answerText = card.answer || card.correct_answer || '';
            const distractorsText = card.distractors ? JSON.stringify(card.distractors) : null;
            await db.run(
                'INSERT INTO flashcards (deck_id, question, answer, mastered, ease_factor, intervals, repetitions, next_review_at, distractors) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [
                    deckId, 
                    card.question, 
                    answerText, 
                    card.mastered ? 1 : 0,
                    card.ease_factor !== undefined ? card.ease_factor : 2.5,
                    card.intervals !== undefined ? card.intervals : 0,
                    card.repetitions !== undefined ? card.repetitions : 0,
                    card.next_review_at || null,
                    distractorsText
                ]
            );
        }

        res.status(201).json({ success: true, deckId, message: 'Deck saved successfully!' });
    } catch (error) {
        console.error('Save deck error:', error);
        res.status(500).json({ error: 'Failed to save deck.' });
    }
});

// Get User's Deck History
app.get('/api/decks', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const decks = await db.all(`
            SELECT d.id, d.title, d.notes, d.created_at,
                   COUNT(f.id) as total_cards,
                   SUM(CASE WHEN f.mastered = 1 THEN 1 ELSE 0 END) as mastered_cards
            FROM decks d
            LEFT JOIN flashcards f ON d.id = f.deck_id
            WHERE d.user_id = ?
            GROUP BY d.id
            ORDER BY d.created_at DESC
        `, [userId]);

        res.json({ success: true, decks });
    } catch (error) {
        console.error('Fetch decks error:', error);
        res.status(500).json({ error: 'Failed to fetch decks.' });
    }
});

// Get Cards in a Specific Deck
app.get('/api/decks/:id/cards', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const deckId = req.params.id;

        // Verify deck ownership
        const deck = await db.get('SELECT * FROM decks WHERE id = ? AND user_id = ?', [deckId, userId]);
        if (!deck) {
            return res.status(404).json({ error: 'Deck not found.' });
        }

        const flashcards = await db.all('SELECT id, question, answer, mastered, ease_factor, intervals, repetitions, next_review_at, distractors FROM flashcards WHERE deck_id = ?', [deckId]);
        
        const formattedCards = flashcards.map(c => ({
            id: c.id.toString(), // String IDs for frontend client state compatibility
            question: c.question,
            answer: c.answer,
            correct_answer: c.answer,
            mastered: c.mastered === 1,
            ease_factor: c.ease_factor !== null && c.ease_factor !== undefined ? c.ease_factor : 2.5,
            intervals: c.intervals !== null && c.intervals !== undefined ? c.intervals : 0,
            repetitions: c.repetitions !== null && c.repetitions !== undefined ? c.repetitions : 0,
            next_review_at: c.next_review_at || null,
            distractors: c.distractors ? JSON.parse(c.distractors) : []
        }));

        res.json({ success: true, title: deck.title, notes: deck.notes, flashcards: formattedCards });
    } catch (error) {
        console.error('Fetch cards error:', error);
        res.status(500).json({ error: 'Failed to fetch flashcards.' });
    }
});

// Toggle / Update Card Mastery / Review
app.put('/api/cards/:id/mastered', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const cardId = req.params.id;
        const { mastered, rating } = req.body;

        // Fetch card details along with user ownership verification
        const card = await db.get(`
            SELECT f.*, d.user_id FROM flashcards f
            JOIN decks d ON f.deck_id = d.id
            WHERE f.id = ?
        `, [cardId]);

        if (!card) {
            return res.status(404).json({ error: 'Card not found.' });
        }

        if (card.user_id !== userId) {
            return res.status(403).json({ error: 'Unauthorized to modify this card.' });
        }

        if (rating !== undefined) {
            // Spaced Repetition (SM-2) Logic
            const q = Math.min(5, Math.max(0, parseInt(rating, 10)));
            let ef = card.ease_factor !== null && card.ease_factor !== undefined ? card.ease_factor : 2.5;
            let rep = card.repetitions !== null && card.repetitions !== undefined ? card.repetitions : 0;
            let interval = card.intervals !== null && card.intervals !== undefined ? card.intervals : 0;

            if (q < 3) {
                rep = 0;
                interval = 1;
            } else {
                if (rep === 0) {
                    interval = 1;
                } else if (rep === 1) {
                    interval = 6;
                } else {
                    interval = Math.round(interval * ef);
                }
                rep += 1;
            }

            // Calculate new ease factor
            ef = ef + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
            if (ef < 1.3) ef = 1.3;

            // Calculate next review datetime
            const nextReviewDate = new Date();
            nextReviewDate.setDate(nextReviewDate.getDate() + interval);
            const next_review_at = nextReviewDate.toISOString();

            // Set mastered status dynamically (rating Easy (5) or Hard (3-4) maps to mastered, Again (1) to learning)
            const newMastered = q >= 4 ? 1 : 0;

            await db.run(`
                UPDATE flashcards 
                SET ease_factor = ?, intervals = ?, repetitions = ?, next_review_at = ?, mastered = ?
                WHERE id = ?
            `, [ef, interval, rep, next_review_at, newMastered, cardId]);

            return res.json({ 
                success: true, 
                message: 'Card reviewed successfully using SM-2 algorithm.',
                card: {
                    id: cardId,
                    ease_factor: ef,
                    intervals: interval,
                    repetitions: rep,
                    next_review_at,
                    mastered: newMastered === 1
                }
            });
        } else if (mastered !== undefined) {
            // Standard Mastery Toggle
            await db.run('UPDATE flashcards SET mastered = ? WHERE id = ?', [mastered ? 1 : 0, cardId]);
            return res.json({ success: true, message: 'Card mastery updated.' });
        } else {
            return res.status(400).json({ error: 'Either mastered state or rating score is required.' });
        }
    } catch (error) {
        console.error('Update card error:', error);
        res.status(500).json({ error: 'Failed to update card.' });
    }
});

// Delete Deck
app.delete('/api/decks/:id', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const deckId = req.params.id;

        // Verify ownership
        const deck = await db.get('SELECT * FROM decks WHERE id = ? AND user_id = ?', [deckId, userId]);
        if (!deck) {
            return res.status(404).json({ error: 'Deck not found or unauthorized.' });
        }

        await db.run('DELETE FROM decks WHERE id = ?', [deckId]);
        res.json({ success: true, message: 'Deck deleted successfully.' });
    } catch (error) {
        console.error('Delete deck error:', error);
        res.status(500).json({ error: 'Failed to delete deck.' });
    }
});

// ================= AI GENERATION ROUTE =================

// POST route: Accepts student notes, sends them to Gemini
app.post('/api/generate-cards', async (req, res) => {
    try {
        const { notes } = req.body;

        if (!notes) {
            return res.status(400).json({ error: 'Please provide some study notes!' });
        }

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: `You are an expert tutor. Take the following study notes and turn them into a list of 5 high-quality flashcards for active recall learning. Each card must have a specific "question" on the front, a crisp, direct "correct_answer" on the back, and exactly three plausible but incorrect choices ("distractors") for multiple choice testing. Notes: ${notes}`,
            config: {
                responseMimeType: 'application/json',
                responseSchema: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            question: { type: 'string' },
                            correct_answer: { type: 'string' },
                            distractors: {
                                type: 'array',
                                items: { type: 'string' }
                            }
                        },
                        required: ['question', 'correct_answer', 'distractors']
                    }
                }
            }
        });

        const responseText = response.text;
        const rawFlashcards = JSON.parse(responseText);

        const flashcards = rawFlashcards.map(card => ({
            question: card.question,
            correct_answer: card.correct_answer,
            answer: card.correct_answer, // compatibility
            distractors: card.distractors
        }));

        res.json({ success: true, flashcards });

    } catch (error) {
        console.error('Error generating cards:', error);
        res.status(500).json({ error: 'Failed to generate flashcards.' });
    }
});

// POST route: Ingests PDF file, extracts text, sends to Gemini
app.post('/api/upload-pdf', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Please upload a PDF file!' });
        }

        // Parse text from file buffer
        const parsedPdf = await pdfParse(req.file.buffer);
        const extractedText = parsedPdf.text;

        if (!extractedText || extractedText.trim().length === 0) {
            return res.status(400).json({ error: 'Could not extract text content from the uploaded PDF.' });
        }

        // Limit raw text segment size to avoid exceeding prompt constraints
        const textSegment = extractedText.substring(0, 15000);

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: `You are an expert tutor. Take the following text segment from an uploaded document, parse the material, and extract the key concepts into a list of 5 high-quality flashcards for active recall learning. Each card must have a specific "question" on the front, a crisp, direct "correct_answer" on the back, and exactly three plausible but incorrect choices ("distractors") for multiple choice testing. Text Segment: ${textSegment}`,
            config: {
                responseMimeType: 'application/json',
                responseSchema: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            question: { type: 'string' },
                            correct_answer: { type: 'string' },
                            distractors: {
                                type: 'array',
                                items: { type: 'string' }
                            }
                        },
                        required: ['question', 'correct_answer', 'distractors']
                    }
                }
            }
        });

        const responseText = response.text;
        const rawFlashcards = JSON.parse(responseText);

        const flashcards = rawFlashcards.map(card => ({
            question: card.question,
            correct_answer: card.correct_answer,
            answer: card.correct_answer, // compatibility
            distractors: card.distractors
        }));

        res.json({ success: true, flashcards });

    } catch (error) {
        console.error('Error processing PDF upload:', error);
        res.status(500).json({ error: 'Failed to process PDF upload and generate flashcards.' });
    }
});

app.get('/', (req, res) => {
    res.send('FlashBrain Backend API is running perfectly! 🧠');
});

app.listen(PORT, () => {
    console.log(`AI Server is successfully operating on port ${PORT} 🚀`);
});