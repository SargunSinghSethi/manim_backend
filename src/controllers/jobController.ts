import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { AuthenticatedRequest } from '../middleware/auth';
import { prisma } from '../config/database';
import { MultiLLMService, CodeGenerationRequest } from '../services/multiLLMService';

import { S3Service } from '../services/s3Service';

const llmService = new MultiLLMService();

const s3Service = new S3Service();

export const createJob = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const { prompt, config, llm } = req.body as CodeGenerationRequest;
    if (!prompt || prompt.trim().length === 0) {
      return res.status(400).json({
        error: 'Prompt is required',
        message: 'Please provide a valid animation prompt'
      });
    }

    // Generate unique job UUID
    const jobUuid = uuidv4();

    // Create job record in database
    const job = await prisma.job.create({
      data: {
        jobUuid,
        userId: req.user.id,
        prompt: prompt.trim(),
        status: 'PENDING'
      }
    });

    console.log(`Created job ${jobUuid} for user ${req.user.id}`);

    // Return immediately with only jobUuid
    res.json({
      jobUuid
    });

    // Process job asynchronously
    processJobAsync(job.id, job.jobUuid, prompt, config, req.user.id, llm);

  } catch (error) {
    console.error('Create job error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to create animation job'
    });
  }
};

// ✅ Updated async processing function
async function processJobAsync(jobId: number, jobUuid: string, prompt: string, config: any, userId: number, llm?: any) {
  try {
    // Step 1: Update status to running
    await prisma.job.update({
      where: { id: jobId },
      data: { status: 'PROCESSING' }
    });

    console.log(`Starting code generation for job ${jobUuid}`);

    // Step 2: Generate code using OpenAI
    const codeResult = await llmService.generateManimCode({ prompt, config, llm: llm || 'gemini' });

    console.log(`Code generated using ${codeResult.llmUsed.toUpperCase()}`);


    // Step 3: Update job with generated code
    await prisma.job.update({
      where: { id: jobId },
      data: {
        generatedCode: codeResult.generatedCode,
      }
    });

    console.log(`Generated code for job ${jobUuid}, sending to Python service`);


    // Step 4: Send to Python microservice for Docker execution + S3 upload
    const pythonServiceUrl = process.env.PYTHON_SERVICE_URL || 'http://localhost:8000';
    const pythonResponse = await fetch(`${pythonServiceUrl}/render`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        job_uuid: jobUuid,
        code: codeResult.generatedCode,
        config: config
      })
    });

    if (!pythonResponse.ok) {
      throw new Error(`Python service error: ${pythonResponse.statusText}`);
    }

    const pythonResult = await pythonResponse.json();
    console.log(`Python service result:`, pythonResult);

    // Step 5: Handle Python service response
    if (pythonResult.status === 'queued') {
      console.log(`✅ Job ${jobUuid} successfully queued in Python microservice`);
      console.log(`📋 Queue position: ${pythonResult.queue_position}, estimated wait: ${pythonResult.estimated_wait_seconds}s`);
    } else {
      // Python service failed
      await prisma.job.update({
        where: { id: jobId },
        data: {
          status: 'FAILED',
          errorMessage: pythonResult.error_message || 'Video generation failed'
        }
      });

      console.error(`Job ${jobUuid} failed: ${pythonResult.error_message}`);
    }

  } catch (error) {
    // Handle any errors
    await prisma.job.update({
      where: { id: jobId },
      data: {
        status: 'FAILED',
        errorMessage: error instanceof Error ? error.message : 'Unknown error'
      }
    });

    console.error(`Job ${jobUuid} failed with error:`, error);
  }
}

export const getJobStatus = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const { jobUuid } = req.params;

    if (!jobUuid) {
      return res.status(400).json({ error: 'Job UUID is required' });
    }

    // Find job with video information
    const job = await prisma.job.findFirst({
      where: {
        jobUuid,
        userId: req.user.id
      },
      include: {
        video: true // ✅ Include video information
      }
    });

    if (!job) {
      return res.status(404).json({
        error: 'Job not found',
        message: 'Job does not exist or does not belong to this user'
      });
    }

    // Calculate progress based on status
    const progressMap = {
      PENDING: 10,
      PROCESSING: 50,
      COMPLETED: 100,
      FAILED: 0
    };


    res.json({
      status: job.status,
      job_uuid: job.jobUuid,
      created_at: job.createdAt.toISOString(),
      completed_at: job.completedAt?.toISOString(),
      error_message: job.errorMessage,
      progress: progressMap[job.status as keyof typeof progressMap],

      // ✅ Include video information when completed
      ...(job.videoId && {
        videoId: job.video?.id,
        codeText: job.video?.associatedCode
      })
    });

  } catch (error) {
    console.error('Get job status error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to retrieve job status'
    });
  }
};

export const handleJobCompletion = async (req: Request, res: Response) => {
  try {
    const { job_uuid, status, video_url, file_size, error_message } = req.body;

    console.log(`📡 Webhook received for job ${job_uuid}: ${status}`);


    const job = await prisma.job.findUnique({ where: { jobUuid: job_uuid } });

    if (!job) {
      return res.status(404).json({ error: `Job ${job_uuid} not found` });
    }

    if (status === 'completed' && video_url) {
      // Update job as completed
      const [updatedJob, video] = await prisma.$transaction([
        prisma.job.update({
          where: { jobUuid: job_uuid },
          data: {
            status: 'COMPLETED',
            completedAt: new Date()
          }
        }),
        prisma.video.create({
          data: {
            userId: job.userId,
            jobId: job.jobUuid,
            title: `Video for ${job.prompt.substring(0, 30)}...`,
            associatedCode: job.generatedCode || '',
            videoUrl: video_url
          }
        })
      ]);
      // Link video to job
      await prisma.job.update({
        where: { jobUuid: job_uuid },
        data: { videoId: video.id }
      });

      console.log(`✅ Job ${job_uuid} completed with video ID ${video.id}`);
    } else {
      // Handle failure
      const retriesLeft = (job.retryLeft || 0) - 1;
      await prisma.job.update({
        where: { jobUuid: job_uuid },
        data: { retryLeft: retriesLeft }
      });

      if (retriesLeft > 0) {
        const newPrompt = `There is a problem with the generated code: 
        CODE: ${job.generatedCode},
        ERROR_MESSAGE: ${error_message}`;

        console.log(`🔄 Retrying job ${job_uuid}, retries left: ${retriesLeft}`);
        processJobAsync(job.id, job_uuid, newPrompt, {}, job.userId, 'openai');
      }
      else {
        await prisma.job.update({
          where: { jobUuid: job_uuid },
          data: {
            status: 'FAILED',
            errorMessage: error_message || 'Unknown error'
          }
        });
        console.log(`⛔ Job ${job_uuid} permanently failed`);
      }
    }
    res.json({ success: true });

  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
};


// ✅ New endpoint to get presigned URL for video download
export const getVideoUrl = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const { videoId } = req.params;

    if (!videoId) {
      return res.status(400).json({ error: 'Video ID is required' });
    }

    // Find video belonging to authenticated user
    const video = await prisma.video.findFirst({
      where: {
        id: parseInt(videoId),
        userId: req.user.id
      }
    });


    if (!video) {
      return res.status(404).json({
        error: 'Video not found',
        message: 'Video does not exist or does not belong to this user'
      });
    }

    // Generate presigned URL
    const presignedUrl = await s3Service.generatePresignedVideoUrl(video.videoUrl);

    res.json({
      presigned_url: presignedUrl,
      expires_in: 3600,
      video_id: video.id,
      title: video.title,
    });

  } catch (error) {
    console.error('Get video download URL error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to generate download URL'
    });
  }
};

// ✅ Get user's videos
export const getUserVideos = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const { limit = 10, offset = 0 } = req.query;

    const videos = await prisma.video.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'desc' },
      take: Number(limit),
      skip: Number(offset),
      select: {
        id: true,
        jobId: true,
        title: true,
        associatedCode: true,
        createdAt: true
      }
    });

    const totalVideos = await prisma.video.count({
      where: { userId: req.user.id }
    });


    console.log(`Videos Fetched ${videos.length} for user ${req.user.id}`);
    res.json({
      videos,
      pagination: {
        total: totalVideos,
        limit: Number(limit),
        offset: Number(offset),
        hasMore: Number(offset) + Number(limit) < totalVideos
      }
    });

  } catch (error) {
    console.error('Get user videos error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to retrieve user videos'
    });
  }
};