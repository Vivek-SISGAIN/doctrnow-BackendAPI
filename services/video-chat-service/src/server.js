require("dotenv").config();

const http = require("http");
const app = require("./src/app");
const connectDB = require("./src/config/db");
const { connectRedis } = require("./src/config/redis");
const { initSocket } = require("./src/realtime/socket");

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