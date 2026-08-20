const { createClient } = require("redis");

const redisClient = createClient({
    url: process.env.REDIS_URL
});

redisClient.on("error", (err) =>
    console.error("❌ Redis Error", err)
);

const connectRedis = async () => {
    try {
        await redisClient.connect();
        console.log("✅ Redis connected");
    } catch (err) {
        console.warn("⚠️ Redis connection failed (running without Redis cache):", err.message);
    }
};

module.exports = { redisClient, connectRedis };