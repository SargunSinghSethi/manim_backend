import { Router } from 'express';
import authRoutes from './auth';
import jobRoutes from './jobs';

const router = Router();

// Health check for API
router.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'manim-ai-api',
    timestamp: new Date().toISOString()
  });
});

// Mount route modules
router.use('/auth', authRoutes);
router.use('/', jobRoutes); // This makes it /api/generate, /api/status/uuid

// Test route to verify routing works
router.get('/test', (req, res) => {
  res.json({
    message: 'API routes are working',
    timestamp: new Date().toISOString()
  });
});

export default router;
