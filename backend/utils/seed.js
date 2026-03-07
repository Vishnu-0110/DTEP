const mongoose = require('mongoose');
const User = require('../models/User');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const maskMongoUri = (uri) => {
  try {
    return uri.replace(/(mongodb(?:\+srv)?:\/\/)([^:]+):([^@]+)@/i, '$1$2:***@');
  } catch (_) {
    return '<invalid-uri>';
  }
};

const seedUsers = async () => {
  try {
    const DB_URI = process.env.MONGODB_URI;
    const DB_NAME = process.env.MONGODB_DB_NAME;
    const HARD_RESET = process.env.SEED_RESET_USERS === 'true';
    if (!DB_URI) {
      throw new Error('MONGODB_URI is required. Refusing to use localhost fallback.');
    }
    console.log(`Attempting to connect to: ${maskMongoUri(DB_URI)}`);
    
    const conn = await mongoose.connect(DB_URI, {
      ...(DB_NAME ? { dbName: DB_NAME } : {}),
      serverSelectionTimeoutMS: 10000,
      maxPoolSize: 10,
    });
    console.log(`Connected database: ${conn.connection.name}`);
    
    console.log('✅ Connected to database.');
    if (HARD_RESET) {
      const deleted = await User.deleteMany({
        email: { $in: ['admin@dtep.com', 'evaluator@dtep.com', 'student@dtep.com'] }
      });
      console.log(`HARD RESET enabled: removed ${deleted.deletedCount} existing demo users.`);
    } else {
      console.log('Safe mode: existing users are preserved.');
    }

    const usersToCreate = [
      {
        name: 'System Administrator',
        email: 'admin@dtep.com',
        password: 'admin12345',
        role: 'admin',
        department: 'IT Administration'
      },
      {
        name: 'Professor Jane Smith',
        email: 'evaluator@dtep.com',
        password: 'evaluator12345',
        role: 'evaluator',
        department: 'Computer Science'
      },
      {
        name: 'John Doe',
        email: 'student@dtep.com',
        password: 'student12345',
        role: 'student',
        department: 'Software Engineering'
      }
    ];

    console.log('Seeding demo accounts...');
    for (const userData of usersToCreate) {
      let user = await User.findOne({ email: userData.email });
      if (user) {
        user.name = userData.name;
        user.role = userData.role;
        user.department = userData.department;
        user.password = userData.password; // hashed by pre-save hook
        await user.save();
        console.log(`Updated ${userData.role}: ${userData.email}`);
      } else {
        // The User model has a pre-save hook that hashes the password automatically
        user = new User(userData);
        await user.save();
        console.log(`Created ${userData.role}: ${userData.email}`);
      }
    }

    console.log('-----------------------------------------------');
    console.log('🚀 DATABASE SEEDED SUCCESSFULLY!');
    console.log('Use these credentials to log in (REAL MODE):');
    console.log('Admin:   admin@dtep.com / admin12345');
    console.log('Evaluator: evaluator@dtep.com / evaluator12345');
    console.log('Student: student@dtep.com / student12345');
    console.log('-----------------------------------------------');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error seeding users:', error);
    process.exit(1);
  }
};

seedUsers();
