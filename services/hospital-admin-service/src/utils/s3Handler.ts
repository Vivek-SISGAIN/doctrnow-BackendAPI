import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { v4 as uuid } from "uuid";

const s3 = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  },
});

const BUCKET = process.env.AWS_S3_BUCKET || '';

export const uploadToS3 = async (file: any): Promise<{ key: string; url: string }> => {
  try {
    const fileKey = `profiles/${uuid()}-${file.originalname}`;

    const command = new PutObjectCommand({
      Bucket: BUCKET,
      Key: fileKey,
      Body: file.buffer,
      ContentType: file.mimetype,
    });

    await s3.send(command);

    return {
      key: fileKey,
      url: `https://${BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${fileKey}`,
    };
  } catch (error) {
    console.error("S3 Upload Error:", error);
    throw error;
  }
};

/**
 * Uploads a doctor credential document to S3.
 * Key format: doctors/<doctorId>/<docType>/<uuid>-<originalname>
 */
export const uploadDoctorDocument = async (
  file: any,
  doctorId: string,
  docType: string,
): Promise<{ key: string; fileName: string; mime: string }> => {
  const fileKey = `doctors/${doctorId}/${docType}/${uuid()}-${file.originalname}`;

  const command = new PutObjectCommand({
    Bucket: BUCKET,
    Key: fileKey,
    Body: file.buffer,
    ContentType: file.mimetype,
  });

  await s3.send(command);

  return {
    key: fileKey,
    fileName: file.originalname as string,
    mime: file.mimetype as string,
  };
};

/**
 * Generates a 1-hour presigned GET URL for a given S3 key.
 * Returns null if the key is falsy or already a full URL.
 */
export const getPresignedUrl = async (key: string | null): Promise<string | null> => {
  if (!key) return null;
  if (key.startsWith('http')) return key;
  try {
    const command = new GetObjectCommand({ Bucket: BUCKET, Key: key });
    return await getSignedUrl(s3, command, { expiresIn: 3600 });
  } catch (error) {
    console.error("S3 Presign Error:", error);
    return null;
  }
};

export const deleteFromS3 = async (key: string): Promise<boolean> => {
  try {
    const command = new DeleteObjectCommand({
      Bucket: BUCKET,
      Key: key,
    });

    await s3.send(command);
    return true;
  } catch (error) {
    console.error("S3 Delete Error:", error);
    throw error;
  }
};
