import { Router } from 'express';
import { requireApiAuth, syncUser } from '../middleware/auth';
import { 
  createJob, 
  getJobStatus,
  getVideoUrl,
  getUserVideos
} from '../controllers/jobController';

const router = Router();

// Apply auth middleware to all routes
router.use(requireApiAuth());
router.use(syncUser);

// Job routes
router.post('/generate', createJob);
router.get('/status/:jobUuid', getJobStatus);

// Video routes
router.get('/video/:videoId/download', getVideoUrl); // ✅ Get presigned URL by video ID
router.get('/videos', getUserVideos); // ✅ Get user's video list

export default router;
