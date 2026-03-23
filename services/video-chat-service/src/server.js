require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });
const http = require("http");
const app = require("./app");
const connectDB = require("./config/db");
const { connectRedis } = require("./config/redis");
const { initSocket } = require("./realtime/socket");

const PORT = process.env.PORT || 3007;

const startServer = async () => {
    await connectDB();
    await connectRedis();

    const server = http.createServer(app);

    await initSocket(server);

    server.listen(PORT, () => {
        console.log(`🚀 Video-Chat Service running on port ${PORT}`);
    });
};

startServer();