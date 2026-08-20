
require("dotenv").config(); 
const mongoose = require("mongoose");
const dns = require('node:dns');

try {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch (e) {}
dns.setDefaultResultOrder('ipv4first');

console.log("Env" , process.env.MONGO_URI);
const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("✅ MongoDB connected");
    } catch (err) {
        console.warn("⚠️ MongoDB connection error with SRV URI:", err.message);
        try {
            const directUri = 'mongodb://vinayaksisgain_db_user:iv4jDszFywW0NhhE@ac-p8oxzrl-shard-00-00.4fa9t8z.mongodb.net:27017,ac-p8oxzrl-shard-00-01.4fa9t8z.mongodb.net:27017,ac-p8oxzrl-shard-00-02.4fa9t8z.mongodb.net:27017/doctornow?ssl=true&authSource=admin&retryWrites=true&w=majority';
            await mongoose.connect(directUri);
            console.log("✅ MongoDB connected (direct shards)");
        } catch (e) {
            console.error("❌ MongoDB fallback failed:", e.message);
        }
    }
};

module.exports = connectDB;