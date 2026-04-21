const {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand
} = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { v4: uuid } = require('uuid');

const s3 = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || ''
  }
});

const BUCKET = process.env.AWS_S3_BUCKET || '';

const uploadToS3 = async (file) => {
  try {
    const fileKey = `documents/hospitals/${uuid()}-${file.originalname}`;

    const command = new PutObjectCommand({
      Bucket: BUCKET,
      Key: fileKey,
      Body: file.buffer,
      ContentType: file.mimetype
    });

    await s3.send(command);

    return {
      key: fileKey,
      url: `https://${BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${fileKey}`
    };
  } catch (error) {
    console.error('S3 Upload Error:', error);
    throw error;
  }
};

const deleteFromS3 = async (key) => {
  try {
    const command = new DeleteObjectCommand({
      Bucket: BUCKET,
      Key: key
    });

    await s3.send(command);
    return true;
  } catch (error) {
    console.error('S3 Delete Error:', error);
    throw error;
  }
};

const getPresignedS3Url = async (key) => {
  if (!key) return null;
  if (key.startsWith('http')) return key;
  try {
    const command = new GetObjectCommand({ Bucket: BUCKET, Key: key });
    return await getSignedUrl(s3, command, { expiresIn: 3600 });
  } catch (error) {
    console.error('S3 Get Presigned URL Error:', error);
    return null;
  }
};

module.exports = {
  uploadToS3,
  deleteFromS3,
  getPresignedS3Url
};
