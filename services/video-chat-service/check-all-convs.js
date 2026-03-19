const mongoose = require('mongoose');

const mongoUri = 'mongodb+srv://nitinsisgain:Sisgain%40123@cluster0.7fv7oqw.mongodb.net/doctrNow?retryWrites=true&w=majority&appName=Cluster0';

async function check() {
  try {
    await mongoose.connect(mongoUri);
    const db = mongoose.connection.db;
    
    console.log('Conversations in doctrNow:');
    const conversations = await db.collection('conversations').find({}).toArray();
    if (conversations.length === 0) {
      console.log('No conversations found in doctrNow database.');
    }
    for (const conv of conversations) {
      console.log(`- Conv ${conv._id} (Consultation ${conv.consultationId})`);
      console.log(`  Participants: ${JSON.stringify(conv.participants.map(p => ({ role: p.role, userId: p.userId })))}`);
      const msgCount = await db.collection('messages').countDocuments({ conversationId: conv._id });
      console.log(`  Messages: ${msgCount}`);
    }

  } catch (err) {
    console.error('Check failed:', err);
  } finally {
    await mongoose.disconnect();
  }
}

check();
