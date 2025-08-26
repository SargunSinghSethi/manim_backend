import { Router } from "express";
import { requireWebhookAuth } from "../middleware/webhookAuth";
import { handleJobCompletion } from "../controllers/jobController";

const router = Router();

router.post('/job-completion', requireWebhookAuth, handleJobCompletion);

export default router;
