require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const { initializeDatabase } = require('./config/database');
const cryptoService = require('./services/cryptoService');
const { seed } = require('./seed');

const authRoutes = require('./routes/auth');
const requisitionRoutes = require('./routes/requisitions');
const userRoutes = require('./routes/users');
const emailRoutes = require('./routes/emails');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req, res, next) => {
  if (process.env.NODE_ENV !== 'test') {
    console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
  }
  next();
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/requisitions', requisitionRoutes);
app.use('/api/users', userRoutes);
app.use('/api/emails', emailRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    version: '2.0.0',
    timestamp: new Date().toISOString()
  });
});

// Serve static frontend in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.resolve(__dirname, '../../')));
  app.get('*', (req, res) => {
    res.sendFile(path.resolve(__dirname, '../../index.html'));
  });
}

// Error handling middleware
app.use((err, req, res, _next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
async function start() {
  try {
    // Load crypto keys
    cryptoService.loadKeys();
    console.log('Crypto keys loaded');

    // Initialize database
    await initializeDatabase();
    console.log('Database initialized');

    // Auto-seed in production
    if (process.env.NODE_ENV === 'production') {
      try {
        await seed();
        console.log('Database seeded with initial data');
      } catch (err) {
        console.warn('Seed skipped (data may already exist):', err.message);
      }
    }

    app.listen(PORT, () => {
      console.log(`CMES Requisitions API running on port ${PORT}`);
      console.log(`Health check: http://localhost:${PORT}/api/health`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

// Only start if not in test mode
if (process.env.NODE_ENV !== 'test') {
  start();
}

module.exports = app;
