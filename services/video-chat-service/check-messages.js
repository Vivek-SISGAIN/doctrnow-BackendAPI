const mongoose = require('mongoose');

const mongoUri = 'mongodb+srv://nitinsisgain:Sisgain%40123@cluster0.7fv7oqw.mongodb.net/doctrNow?retryWrites=true&w=majority&appName=Cluster0';

async function check() {
  try {
    await mongoose.connect(mongoUri);
    const db = mongoose.connection.db;
    
    const messages = await db.collection('messages').find({}).toArray();
    console.log('Messages in doctrNow:');
    for (const msg of messages) {
      console.log(`- Msg ${msg._id} | Sender: ${msg.senderId} | Content: ${msg.content || ' (binary)'}`);
    }

  } catch (err) {
    console.error('Check failed:', err);
  } finally {
    await mongoose.disconnect();
  }
}

check();
