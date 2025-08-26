import { Request, Response, NextFunction } from 'express';

export const requireWebhookAuth = (req: Request, res: Response, next: NextFunction) => {
  const apiKey = req.headers['x-webhook-key'] as string;
  const expectedKey = process.env.WEBHOOK_API_KEY;
  
  if (!apiKey) {
    return res.status(401).json({ 
      error: 'Missing webhook API key',
      message: 'X-Webhook-Key header required' 
    });
  }
  
  if (!expectedKey) {
    console.error('WEBHOOK_API_KEY not configured');
    return res.status(500).json({ error: 'Server configuration error' });
  }
  
  if (apiKey !== expectedKey) {
    console.warn(`Invalid webhook key attempt: ${apiKey.substring(0, 8)}...`);
    return res.status(401).json({ 
      error: 'Invalid webhook API key' 
    });
  }
  
  next();
};
