import { Request, Response, NextFunction } from 'express';
import { getAuth, clerkClient } from '@clerk/express';
import { prisma } from '../config/database';

// Extended Request interface
export interface AuthenticatedRequest extends Request {
  user?: {
    id: number;
    username: string;
    email: string;
    clerkId: string;
  };
}

// Middleware to sync Clerk user with database
export const syncUser = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { userId } = getAuth(req);
    
    if (!userId) {
      return next();
    }

    // Get user details from Clerk
    const clerkUser = await clerkClient.users.getUser(userId);
    const userEmail = clerkUser.emailAddresses[0]?.emailAddress;
    const username = clerkUser.username || userEmail?.split('@')[0] || `user_${Date.now()}`;

    // Find or create user in database
    let user = await prisma.user.findUnique({
      where: { clerkId: userId }
    });

    if (!user && userEmail) {
      user = await prisma.user.create({
        data: {
          clerkId: userId,
          email: userEmail,
          username
        }
      });
    }

    if (user) {
      req.user = {
        id: user.id,
        username: user.username,
        email: user.email,
        clerkId: user.clerkId
      };
    }

    next();
  } catch (error) {
    console.error('Error syncing user:', error);
    next(error);
  }
};

export const requireApiAuth = () => {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { userId } = getAuth(req);
      
      if (!userId) {
        return res.status(401).json({ 
          error: 'Authentication required',
          message: 'Please provide a valid JWT token' 
        });
      }
      
      // User is authenticated, continue to next middleware
      next();
    } catch (error) {
      console.error('Auth error:', error);
      res.status(401).json({ 
        error: 'Authentication failed',
        message: 'Invalid or expired token' 
      });
    }
  };
};