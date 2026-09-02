import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { v4 as uuid } from "uuid";

// Create S3 client
const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const BUCKET = process.env.AWS_S3_BUCKET;

// ✅ Upload File
const uploadFile = async (file, folder = "documents/hospitals") => {
  try {
    const cleanFolder = folder.replace(/\/+$/, "");
    const fileKey = `${cleanFolder}/${uuid()}-${file.originalname}`;

    const command = new PutObjectCommand({
      Bucket: BUCKET,
      Key: fileKey,
      Body: file.buffer, // from multer
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

const uploadToS3 = uploadFile;

// ✅ Delete File
const deleteFromS3 = async (key) => {
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

// ✅ Get Presigned URL
const getPresignedS3Url = async (keyOrUrl) => {
  if (!keyOrUrl) return null;

  let key = keyOrUrl;
  const bucketPrefix = `https://${BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/`;

  if (keyOrUrl.startsWith(bucketPrefix)) {
    key = keyOrUrl.replace(bucketPrefix, "");
  } else if (keyOrUrl.startsWith("http://") || keyOrUrl.startsWith("https://")) {
    const match = keyOrUrl.match(/amazonaws\.com\/(.+)$/);
    if (match) {
      key = match[1];
    } else {
      return keyOrUrl;
    }
  }

  try {
    const command = new GetObjectCommand({ Bucket: BUCKET, Key: key });
    return await getSignedUrl(s3, command, { expiresIn: 3600 });
  } catch (error) {
    console.error("S3 Get Presigned URL Error:", error);
    return null;
  }
};

export {
  uploadFile,
  uploadToS3,
  deleteFromS3,
  getPresignedS3Url,
};

export default {
  uploadFile,
  uploadToS3,
  deleteFromS3,
  getPresignedS3Url,
};
