export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    clerkId: string;
    email: string;
    name?: string;
  };
}

export interface CreateJobRequest {
  prompt: string;
  config?: {
    quality?: 'low' | 'medium' | 'high';
    duration?: number;
    resolution?: '720p' | '1080p' | '4k';
  };
}

export interface JobResponse {
  jobUuid: string;
  status: string;
  estimatedTime?: string;
  progress?: number;
}
