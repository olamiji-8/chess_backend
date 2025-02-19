const mongoose = require("mongoose");
require('dotenv').config();

const dbconnect = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URL);
    console.log("Database connected successfully");
  } catch (error) {
    console.log("Database error:", error.message);
  }
};

module.exports = dbconnect;