import { Request, Response } from 'express';
import { getAuth, clerkClient } from '@clerk/express';
import { AuthenticatedRequest } from '../middleware/auth';
import { prisma } from '../config/database';

export const getProfile = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { userId } = getAuth(req);
    
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    // Get user from Clerk
    const clerkUser = await clerkClient.users.getUser(userId);
    
    // Get user from our database
    const dbUser = req.user;

    res.json({
      success: true,
      clerk: {
        id: clerkUser.id,
        email: clerkUser.emailAddresses[0]?.emailAddress,
        username: clerkUser.username,
        firstName: clerkUser.firstName,
        lastName: clerkUser.lastName
      },
      database: dbUser
    });
  } catch (error) {
    console.error('Error fetching profile:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const updateProfile = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { userId } = getAuth(req);
    
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const { username } = req.body;
    
    if (!username || username.trim().length < 3) {
      return res.status(400).json({ error: 'Username must be at least 3 characters' });
    }

    // Update user in our database
    const updatedUser = await prisma.user.update({
      where: { clerkId: userId },
      data: { username: username.trim() }
    });

    res.json({
      success: true,
      user: {
        id: updatedUser.id,
        username: updatedUser.username,
        email: updatedUser.email,
        clerkId: updatedUser.clerkId
      }
    });
  } catch (error) {
    console.error('Error updating profile:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
