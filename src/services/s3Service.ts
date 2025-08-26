import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export class S3Service {
  private s3Client: S3Client;
  private bucketName: string;

  constructor() {
    // ✅ Add MinIO endpoint support
    const s3Config: any = {
      region: process.env.AWS_REGION || 'us-east-1',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      },
    };

    // ✅ Add MinIO endpoint configuration if specified
    if (process.env.S3_ENDPOINT_URL) {
      s3Config.endpoint = process.env.S3_ENDPOINT_URL;
      s3Config.forcePathStyle = true; // ✅ Required for MinIO
    }

    this.s3Client = new S3Client(s3Config);
    this.bucketName = process.env.S3_BUCKET_NAME!;
  }

  async generatePresignedVideoUrl(s3Url: string, expiresIn: number = 3600): Promise<string> {
    try {
      // Extract S3 key from full S3 URL
      const s3Key = this.extractS3KeyFromUrl(s3Url);
      
      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: s3Key,
      });

      const presignedUrl = await getSignedUrl(this.s3Client, command, {
        expiresIn, // 1 hour by default
      });

      console.log(presignedUrl)
      return presignedUrl;
    } catch (error) {
      console.error('Error generating presigned URL:', error);
      throw new Error('Failed to generate presigned URL');
    }
  }

  private extractS3KeyFromUrl(s3Url: string): string {
    // ✅ Handle both AWS S3 and MinIO URL formats
    if (process.env.S3_ENDPOINT_URL) {
      // MinIO format: http://localhost:9000/bucket-name/videos/uuid.mp4
      const url = new URL(s3Url);
      const pathParts = url.pathname.split('/').filter(part => part.length > 0);
      // Remove bucket name from path (first part) and return the rest
      return pathParts.slice(1).join('/');
    } else {
      // AWS S3 format: https://bucket.s3.region.amazonaws.com/videos/uuid.mp4
      const url = new URL(s3Url);
      return url.pathname.substring(1); // Remove leading slash
    }
  }
}
