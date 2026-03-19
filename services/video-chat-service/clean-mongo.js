const mongoose = require('mongoose');

const mongoUri = 'mongodb+srv://nitinsisgain:Sisgain%40123@cluster0.7fv7oqw.mongodb.net/doctrNow?retryWrites=true&w=majority&appName=Cluster0';

async function clean() {
  try {
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB');

    const db = mongoose.connection.db;
    
    console.log('Deleting conversations...');
    const res1 = await db.collection('conversations').deleteMany({});
    console.log(`Deleted ${res1.deletedCount} conversations`);

    console.log('Deleting consultationchatsessions...');
    const res2 = await db.collection('consultationchatsessions').deleteMany({});
    console.log(`Deleted ${res2.deletedCount} consultationchatsessions`);

  } catch (err) {
    console.error('Cleanup failed:', err);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

clean();
