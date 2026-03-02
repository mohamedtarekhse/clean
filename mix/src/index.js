/**
 * Asset Management System — Railway API Server
 * ==============================================
 * All routes protected by x-api-key header.
 * Uses Supabase service-role key for full DB access.
 */
require('dotenv').config();

const express     = require('express');
const cors        = require('cors');
const helmet      = require('helmet');
const compression = require('compression');
const morgan      = require('morgan');
const rateLimit   = require('express-rate-limit');

const { requireApiKey }                = require('./middleware/auth');
const { errorHandler, notFound }       = require('./middleware/errorHandler');

const assetsRouter     = require('./routes/assets');
const maintenanceRouter= require('./routes/maintenance');
const transfersRouter  = require('./routes/transfers');
const {
  certRouter, bomRouter, companiesRouter, rigsRouter,
  contractsRouter, usersRouter, notifRouter, auditRouter,
} = require('./routes/other');

// ─────────────────────────────────────────────────────────────────────────────
const app  = express();
const PORT = process.env.PORT || 3000;

// ── Security & perf middleware ────────────────────────────────────────────────
app.set('trust proxy', 1);

app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

app.use(cors({
  origin: (origin, cb) => {
    const allowed = (process.env.ALLOWED_ORIGINS || '')
      .split(',').map(s => s.trim()).filter(Boolean);
    // Allow requests with no origin (curl, Postman, etc.) and listed origins
    if (!origin || allowed.includes(origin) || allowed.includes('*')) {
      return cb(null, true);
    }
    cb(new Error(`CORS: origin ${origin} not allowed`));
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'x-api-key', 'x-user-role', 'x-user-name'],
  credentials: true,
}));

app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// ── Global rate-limiter ───────────────────────────────────────────────────────
app.use(rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max:      500,
  standardHeaders: true,
  legacyHeaders:   false,
  message: { success: false, error: 'Too many requests, please try again later.' },
}));

// ── Public routes ─────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({
    status:  'ok',
    service: 'Asset Management API',
    version: '1.0.0',
    time:    new Date().toISOString(),
  });
});

app.get('/', (req, res) => {
  res.json({
    name:    'Asset Management System API',
    version: '1.0.0',
    docs:    'See README.md for endpoint documentation',
    health:  '/health',
  });
});

// ── Protected API routes (all require x-api-key) ─────────────────────────────
app.use('/api', requireApiKey);

app.use('/api/assets',       assetsRouter);
app.use('/api/maintenance',  maintenanceRouter);
app.use('/api/transfers',    transfersRouter);
app.use('/api/certificates', certRouter);
app.use('/api/bom',          bomRouter);
app.use('/api/companies',    companiesRouter);
app.use('/api/rigs',         rigsRouter);
app.use('/api/contracts',    contractsRouter);
app.use('/api/users',        usersRouter);
app.use('/api/notifications',notifRouter);
app.use('/api/audit',        auditRouter);

// ── 404 & global error handlers ───────────────────────────────────────────────
app.use(notFound);
app.use(errorHandler);

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🚀  Asset Management API running on port ${PORT}`);
  console.log(`    Environment : ${process.env.NODE_ENV || 'development'}`);
  console.log(`    Supabase    : ${process.env.SUPABASE_URL || '(not set)'}\n`);
});

module.exports = app;
