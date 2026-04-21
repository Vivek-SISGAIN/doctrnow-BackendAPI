const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

class S3Service {
  constructor() {
    this.region = process.env.AWS_REGION;
    this.bucketName = process.env.S3_BUCKET_NAME;

    if (this.region && this.bucketName && process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
      this.s3Client = new S3Client({
        region: this.region,
        credentials: {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        },
      });
      console.log(`[S3Service] Initialized successfully for bucket: ${this.bucketName} in region: ${this.region}`);
    } else {
      console.warn('[S3Service] Missing AWS S3 environment variables. S3 operations will be mocked/skipped.');
      this.s3Client = null;
    }
  }

  /**
   * Upload PDF Buffer to S3
   * @param {string} rxId The prescription ID to use as the file name
   * @param {Buffer} buffer The PDF buffer
   * @returns {Promise<string|null>} The generated S3 Key or null if skipped
   */
  async uploadPdf(rxId, buffer) {
    if (!this.s3Client) {
      console.warn(`[S3Service] Upload skipped for ${rxId} because S3 is not configured.`);
      return null;
    }

    try {
      const s3Key = `prescriptions/${rxId}-${Date.now()}.pdf`;
      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: s3Key,
        Body: buffer,
        ContentType: 'application/pdf',
      });

      console.log(`[S3Service] Uploading PDF to S3 key: ${s3Key}...`);
      await this.s3Client.send(command);
      console.log(`[S3Service] Successfully uploaded PDF to ${s3Key}`);
      
      return s3Key;
    } catch (error) {
      console.error(`[S3Service] Error uploading PDF to S3 for ${rxId}:`, error);
      throw error;
    }
  }

  /**
   * Generate a pre-signed URL for viewing or downloading the PDF
   * @param {string} s3Key The S3 Key of the PDF
   * @param {string} action 'view' (inline) or 'download' (attachment)
   * @param {number} expiresIn URL expiration in seconds (default 300 = 5 mins)
   * @returns {Promise<string>} The pre-signed URL
   */
  async getPresignedUrl(s3Key, action = 'view', expiresIn = 300) {
    if (!this.s3Client) {
      console.warn(`[S3Service] Presigned URL skipped because S3 is not configured. Mocking URL.`);
      return `https://mock-s3-bucket.s3.amazonaws.com/${s3Key}?action=${action}`;
    }

    try {
      // Determine content disposition based on action
      // For 'view', use 'inline'
      // For 'download', use 'attachment; filename="prescription.pdf"'
      const contentDisposition = action === 'download' 
        ? `attachment; filename="${s3Key.split('/').pop() || 'prescription.pdf'}"`
        : 'inline';

      console.log(`[S3Service] Generating presigned URL for key: ${s3Key}, action: ${action}`);
      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: s3Key,
        ResponseContentDisposition: contentDisposition,
        ResponseContentType: 'application/pdf',
      });

      const url = await getSignedUrl(this.s3Client, command, { expiresIn });
      console.log(`[S3Service] Successfully generated presigned URL (expires in ${expiresIn}s)`);
      return url;
    } catch (error) {
      console.error(`[S3Service] Error generating presigned URL for ${s3Key}:`, error);
      throw error;
    }
  }
}

module.exports = new S3Service();
