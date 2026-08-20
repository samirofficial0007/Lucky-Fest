const mongoose = require('mongoose');
const config = require('./config');

async function connectDB() {
  mongoose.set('strictQuery', true);
  await mongoose.connect(config.mongodbUri);
  console.log('[db] MongoDB connected');
}

module.exports = connectDB;
