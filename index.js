const express = require('express');
const cors = require('cors');
const dbconnect = require('./config/dbconnect');


const app = express();


// Rest of your middleware
app.use(express.json());

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ 
    error: 'Something broke!',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Internal Server Error'
  });
});

const PORT = process.env.PORT || 4000;

dbconnect();

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});