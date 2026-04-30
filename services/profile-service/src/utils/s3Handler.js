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

const uploadToS3 = async (file, folder = 'doctor-profiles') => {
  try {
    const fileKey = `${folder}/${uuid()}-${file.originalname}`;

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

const getPresignedS3Url = async (keyOrUrl) => {
  if (!keyOrUrl) return null;
  
  let key = keyOrUrl;
  const bucketPrefix = `https://${BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/`;
  
  if (keyOrUrl.startsWith(bucketPrefix)) {
    key = keyOrUrl.replace(bucketPrefix, '');
  } else if (keyOrUrl.startsWith('http')) {
    return keyOrUrl;
  }

  try {
    const command = new GetObjectCommand({ Bucket: BUCKET, Key: key });
    return await getSignedUrl(s3, command, { expiresIn: 3600 });
  } catch (error) {
    console.error('S3 Get Presigned URL Error:', error);
    return null;
  }
};

const getPresignedUploadUrl = async (key, contentType) => {
  if (!key) return null;
  try {
    const command = new PutObjectCommand({ 
      Bucket: BUCKET, 
      Key: key,
      ContentType: contentType
    });
    // URL expires in 15 minutes
    const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 900 });
    return {
      uploadUrl,
      fileUrl: `https://${BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`
    };
  } catch (error) {
    console.error('S3 Get Presigned Upload URL Error:', error);
    throw error;
  }
};

module.exports = {
  uploadToS3,
  deleteFromS3,
  getPresignedS3Url,
  getPresignedUploadUrl
};
