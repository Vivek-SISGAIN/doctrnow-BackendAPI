const { S3Client, GetObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

const s3Client = new S3Client({
    region: process.env.AWS_REGION || "us-east-1",
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
});

const S3_BUCKET = process.env.S3_BUCKET_NAME || process.env.AWS_S3_BUCKET;

const generatePresignedUrl = async (key, expiresIn = 3600) => {
    try {
        const command = new GetObjectCommand({
            Bucket: S3_BUCKET,
            Key: key,
        });
        return await getSignedUrl(s3Client, command, { expiresIn });
    } catch (error) {
        console.error("Error generating presigned URL", error);
        return null;
    }
};

module.exports = { s3Client, S3_BUCKET, generatePresignedUrl };
