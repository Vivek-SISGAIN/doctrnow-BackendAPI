const { S3Client, PutBucketCorsCommand } = require("@aws-sdk/client-s3");
require("dotenv").config();

const region = process.env.AWS_REGION || "ap-south-1";
const bucketName = process.env.S3_BUCKET_NAME || "doctor-now-bucket";

const s3Client = new S3Client({
  region,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const corsConfig = {
  Bucket: bucketName,
  CORSConfiguration: {
    CORSRules: [
      {
        AllowedHeaders: ["*"],
        AllowedMethods: ["GET", "PUT", "POST", "HEAD"],
        // Add your allowed origins here. For local development:
        AllowedOrigins: [
          "http://localhost:3000", // Doctor Frontend
          "http://localhost:3001", // Patient Frontend
          "http://localhost:5173", // Common Vite port
          "http://localhost:5174",
        ],
        ExposeHeaders: ["ETag"],
        MaxAgeSeconds: 3600,
      },
      {
        AllowedHeaders: ["*"],
        AllowedMethods: ["GET"],
        AllowedOrigins: ["*"], // Public read
        ExposeHeaders: [],
        MaxAgeSeconds: 3600,
      },
    ],
  },
};

async function setCors() {
  try {
    console.log(`[S3-CORS] Setting CORS policy for bucket: ${bucketName}...`);
    const command = new PutBucketCorsCommand(corsConfig);
    await s3Client.send(command);
    console.log(`[S3-CORS] Successfully updated CORS policy.`);
  } catch (err) {
    console.error(`[S3-CORS] Error setting CORS policy:`, err);
    process.exit(1);
  }
}

setCors();
