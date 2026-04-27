
require("dotenv").config(); 
const mongoose = require("mongoose");

let isConnecting = false;
const dns = require('node:dns');

dns.setServers(['8.8.8.8', '1.1.1.1']);

dns.setDefaultResultOrder('ipv4first');

console.log("Env" , process.env.MONGO_URI)
const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("✅ MongoDB connected");
    } catch (err) {
        console.error("❌ MongoDB connection failed", err);
        process.exit(1);
    }
};

module.exports = connectDB;