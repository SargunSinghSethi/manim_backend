import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import dotenv from 'dotenv';
import { clerkMiddleware, requireAuth, getAuth } from '@clerk/express';
import { requireApiAuth } from './middleware/auth';


// Import routes
import apiRoutes from './routes';
import webhookRoutes from './routes/webhooks'

// Load environment variables
dotenv.config();

const app = express();

// Security middleware
app.use(helmet());

const allowedOrigins = process.env.NODE_ENV === 'production'
  ? [
      process.env.PYTHON_SERVICE_URL,
      process.env.FRONTEND_URL
    ]
  : [
      'http://localhost:3000',
      'http://localhost:8000'
    ];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));


// General middleware
app.use(compression());
app.use(morgan('combined'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Clerk middleware - Add this to ALL routes
app.use(clerkMiddleware());

// Root health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    service: 'manim-ai-express'
  });
});


// Public route - no auth required
app.get('/api/public', (req, res) => {
  res.json({ 
    message: 'This is a public endpoint',
    timestamp: new Date().toISOString()
  });
});

// Protected test route - MOVE THIS BEFORE /api routes
app.get('/api/protected', requireApiAuth(), async (req, res) => {
  const { userId } = getAuth(req);
  
  res.json({
    message: 'This is a protected endpoint',
    userId,
    timestamp: new Date().toISOString()
  });
});

// Mount API routes - THIS SHOULD COME AFTER specific routes
app.use('/api', apiRoutes);

app.use('/webhooks', webhookRoutes);

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Error:', err);
  
  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'development' ? err.message : 'Internal Server Error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

export default app;
