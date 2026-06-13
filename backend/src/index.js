require('dotenv').config();

// Validate required environment variables BEFORE loading any modules that depend on them
const REQUIRED_ENV_VARS = ['DATABASE_URL', 'JWT_SECRET', 'SMTP_HOST', 'SMTP_USER', 'SMTP_PASS'];
for (const v of REQUIRED_ENV_VARS) {
  if (!process.env[v]) {
    console.error(`FATAL: ${v} environment variable is required`);
    process.exit(1);
  }
}

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
const path = require('path');
const { initializeDatabase } = require('./config/database');
const cryptoService = require('./services/cryptoService');
const { seed } = require('./seed');

const authRoutes = require('./routes/auth');
const requisitionRoutes = require('./routes/requisitions');
const userRoutes = require('./routes/users');
const emailRoutes = require('./routes/emails');
const adminRoutes = require('./routes/admin');

const app = express();
const PORT = process.env.PORT || 3001;
const isProduction = process.env.NODE_ENV === 'production';

// Trust proxy when behind a reverse proxy (e.g., Nginx, Heroku, Render)
app.set('trust proxy', 1);

// Security headers
app.use(helmet({
  contentSecurityPolicy: isProduction ? {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "https://cdnjs.cloudflare.com"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:"],
      connectSrc: ["'self'", process.env.FRONTEND_URL || 'http://localhost:3000']
    }
  } : false,
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));

// Compression
app.use(compression());

// CORS
app.use(cors({
  origin: isProduction
    ? (process.env.FRONTEND_URL || '').split(',').map(s => s.trim()).filter(Boolean)
    : process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));

// Rate limiting
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' }
});
app.use('/api/', apiLimiter);

// Stricter rate limit for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts, please try again later.' }
});
app.use('/api/auth/login', authLimiter);

// Request logging
app.use(morgan(isProduction ? 'combined' : 'dev'));

// Body parsing
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/requisitions', requisitionRoutes);
app.use('/api/users', userRoutes);
app.use('/api/emails', emailRoutes);
app.use('/api/admin', adminRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    version: '2.0.0',
    timestamp: new Date().toISOString()
  });
});

// Serve static frontend in production
if (isProduction) {
  app.use(express.static(path.resolve(__dirname, '../../')));
  app.get('*', (req, res) => {
    res.sendFile(path.resolve(__dirname, '../../index.html'));
  });
}

// Error handling middleware
app.use((err, req, res, _next) => {
  console.error('Unhandled error:', err);
  res.status(err.status || 500).json({
    error: isProduction ? 'Internal server error' : err.message
  });
});

// Start server
async function start() {
  try {
    cryptoService.loadKeys();
    console.log('Crypto keys loaded');

    await initializeDatabase();
    console.log('Database initialized');

    if (isProduction) {
      try {
        await seed();
        console.log('Database seeded with initial data');
      } catch (err) {
        console.warn('Seed skipped (data may already exist):', err.message);
      }
    }

    app.listen(PORT, () => {
      console.log(`EazyTools Zambia Requisitions API running on port ${PORT}`);
      console.log(`Health check: http://localhost:${PORT}/api/health`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

if (process.env.NODE_ENV !== 'test') {
  start();
}

module.exports = app;