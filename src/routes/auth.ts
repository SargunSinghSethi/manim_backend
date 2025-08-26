import { Router } from 'express';
import { requireApiAuth } from '../middleware/auth';
import { syncUser } from '../middleware/auth';
import { getProfile, updateProfile } from '../controllers/authController';

const router = Router();

// Test route without auth middleware first
router.get('/test', (req, res) => {
  res.json({
    message: 'Auth routes are working',
    timestamp: new Date().toISOString()
  });
});

// Apply auth middleware to protected routes only
router.use('/profile', requireApiAuth());
router.use('/profile', syncUser);

// Routes
router.get('/profile', getProfile);
router.put('/profile', updateProfile);

export default router;
