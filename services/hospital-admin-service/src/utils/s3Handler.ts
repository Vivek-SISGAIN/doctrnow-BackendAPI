import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { v4 as uuid } from "uuid";

const s3 = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  },
});

const BUCKET = process.env.AWS_S3_BUCKET || '';

export const uploadToS3 = async (file:any): Promise<{ key: string; url: string }> => {
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
