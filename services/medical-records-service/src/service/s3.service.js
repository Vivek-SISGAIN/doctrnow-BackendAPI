const {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  CopyObjectCommand,
} = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { randomUUID: uuidv4 } = require('crypto');

class S3Service {
  constructor() {
    this.region = process.env.AWS_REGION;
    this.bucketName = process.env.S3_BUCKET_NAME;
    this.maxFileSizeMb = parseInt(process.env.DOC_MAX_SIZE_MB || '10', 10);

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
   * Upload PDF Buffer to S3 (used for prescriptions)
   * @param {string} rxId
   * @param {Buffer} buffer
   * @returns {Promise<string|null>}
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
   * Generate a pre-signed URL for viewing or downloading a file (prescriptions).
   * @param {string} s3Key
   * @param {string} action 'view' | 'download'
   * @param {number} expiresIn seconds (default 300)
   * @returns {Promise<string>}
   */
  async getPresignedUrl(s3Key, action = 'view', expiresIn = 300) {
    if (!this.s3Client) {
      console.warn(`[S3Service] Presigned URL skipped because S3 is not configured. Mocking URL.`);
      return `https://mock-s3-bucket.s3.amazonaws.com/${s3Key}?action=${action}`;
    }
    try {
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

  // ─── Patient Document Methods ─────────────────────────────────────────────────

  /**
   * Generate a presigned PUT URL so the frontend uploads directly to S3 temp prefix.
   * Key format: temp/{patientId}/{uuid}-{safeFileName}
   * @param {string} patientId
   * @param {string} fileName Original file name
   * @param {string} mimeType
   * @returns {Promise<{uploadUrl: string, s3Key: string}>}
   */
  async getUploadPresignedUrl(patientId, fileName, mimeType) {
    const safeFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const s3Key = `temp/${patientId}/${uuidv4()}-${safeFileName}`;

    if (!this.s3Client) {
      console.warn(`[S3Service] Mocking upload presigned URL for key: ${s3Key}`);
      return {
        uploadUrl: `https://mock-s3-bucket.s3.amazonaws.com/${s3Key}?mock=true`,
        s3Key,
      };
    }

    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: s3Key,
      ContentType: mimeType,
    });
    // Valid for 15 minutes
    const uploadUrl = await getSignedUrl(this.s3Client, command, { expiresIn: 900 });
    console.log(`[S3Service] Generated upload presigned URL for key: ${s3Key}`);
    return { uploadUrl, s3Key };
  }

  /**
   * Generate a presigned GET URL to allow a document to be viewed by a patient/doctor.
   * @param {string} s3Key
   * @param {number} expiresIn seconds (default 3600 = 1 hour)
   * @returns {Promise<string>}
   */
  async getDocumentPresignedUrl(s3Key, expiresIn = 3600) {
    if (!this.s3Client) {
      return `https://mock-s3-bucket.s3.amazonaws.com/${s3Key}?mock=true`;
    }
    const command = new GetObjectCommand({ Bucket: this.bucketName, Key: s3Key });
    return getSignedUrl(this.s3Client, command, { expiresIn });
  }

  /**
   * Delete an object from S3 (used to clean up temp files on discard).
   * @param {string} s3Key
   */
  async deleteObject(s3Key) {
    if (!this.s3Client) {
      console.warn(`[S3Service] Mocking deleteObject for key: ${s3Key}`);
      return;
    }
    try {
      const command = new DeleteObjectCommand({ Bucket: this.bucketName, Key: s3Key });
      await this.s3Client.send(command);
      console.log(`[S3Service] Deleted object: ${s3Key}`);
    } catch (error) {
      console.error(`[S3Service] Error deleting object ${s3Key}:`, error);
      throw error;
    }
  }

  /**
   * Copy an object within the bucket, then delete the source.
   * Moves a file from temp/{patientId}/... to documents/{patientId}/...
   * @param {string} sourceKey
   * @param {string} destKey
   * @returns {Promise<string>} destKey
   */
  async moveObject(sourceKey, destKey) {
    if (!this.s3Client) {
      console.warn(`[S3Service] Mocking moveObject from ${sourceKey} to ${destKey}`);
      return destKey;
    }
    try {
      const copyCommand = new CopyObjectCommand({
        Bucket: this.bucketName,
        CopySource: `${this.bucketName}/${sourceKey}`,
        Key: destKey,
      });
      await this.s3Client.send(copyCommand);
      console.log(`[S3Service] Copied ${sourceKey} -> ${destKey}`);
      await this.deleteObject(sourceKey);
      return destKey;
    } catch (error) {
      console.error(`[S3Service] Error moving object from ${sourceKey} to ${destKey}:`, error);
      throw error;
    }
  }

  /** Max file size in bytes (from DOC_MAX_SIZE_MB env). */
  get maxFileSizeBytes() {
    return this.maxFileSizeMb * 1024 * 1024;
  }
}

module.exports = new S3Service();
