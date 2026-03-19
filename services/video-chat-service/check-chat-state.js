const mongoose = require('mongoose');

const mongoUri = 'mongodb+srv://nitinsisgain:Sisgain%40123@cluster0.7fv7oqw.mongodb.net/doctrNow?retryWrites=true&w=majority&appName=Cluster0';

async function check() {
  try {
    await mongoose.connect(mongoUri);
    const db = mongoose.connection.db;
    
    const conversation = await db.collection('conversations').findOne({});
    if (!conversation) {
      console.log('No conversations found');
      return;
    }
    
    console.log('Conversation:', JSON.stringify(conversation, null, 2));
    
    const messages = await db.collection('messages').find({ conversationId: conversation._id }).toArray();
    console.log('Messages count:', messages.length);
    if (messages.length > 0) {
      console.log('First message senderId:', messages[0].senderId);
    }

  } catch (err) {
    console.error('Check failed:', err);
  } finally {
    await mongoose.disconnect();
  }
}

check();
