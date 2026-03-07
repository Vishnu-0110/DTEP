const mongoose = require('mongoose');

const connectDB = async () => {
  const dbUri = process.env.MONGODB_URI;
  const dbName = process.env.MONGODB_DB_NAME;
  
  if (!dbUri) {
    console.error('❌ ERROR: MONGODB_URI is not defined in the .env file.');
    process.exit(1);
  }
  
  try {
    console.log('⏳ Attempting to connect to MongoDB...');
    if (!dbUri.startsWith('mongodb+srv://')) {
      console.warn('⚠️ Non-Atlas URI detected. Atlas URIs usually start with "mongodb+srv://".');
    }
    
    const conn = await mongoose.connect(dbUri, {
      serverSelectionTimeoutMS: 10000,
      maxPoolSize: 10,
      ...(dbName ? { dbName } : {}),
    });
    
    console.log('-----------------------------------------------');
    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
    console.log(`📂 Database Name: ${conn.connection.name}`);
    console.log('-----------------------------------------------');
    
    // Monitor connection health
    mongoose.connection.on('error', err => {
      console.error(`❌ MongoDB Runtime Error: ${err.message}`);
    });

    mongoose.connection.on('disconnected', () => {
      console.warn('⚠️ MongoDB Connection Disconnected. System may be unstable.');
    });

    mongoose.connection.on('reconnected', () => {
      console.log('♻️ MongoDB Connection Restored.');
    });

  } catch (error) {
    console.error('-----------------------------------------------');
    console.error(`❌ MongoDB Connection Failed!`);
    console.error(`Error: ${error.message}`);
    console.log('\nTroubleshooting:');
    console.log('1. Add your current IP in Atlas: Network Access.');
    console.log('2. Verify Atlas DB username/password in MONGODB_URI.');
    console.log('3. URL-encode special password characters (@, :, /, ?, #, etc).');
    console.log('4. Confirm the Atlas cluster is active and not paused.');
    console.log('-----------------------------------------------');
    
    throw error;
  }
};

module.exports = connectDB;
