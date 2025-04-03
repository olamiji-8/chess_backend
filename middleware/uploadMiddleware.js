const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Use the tmp uploads directory as configured in server.js
const uploadsDir = path.join('/tmp', 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Double check directory exists before each upload
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }
    cb(null, uploadsDir); // Use the tmp uploads directory
  },
  filename: (req, file, cb) => {
    cb(null, `${file.fieldname}-${Date.now()}${path.extname(file.originalname)}`);
  }
});

// Check file type
const fileFilter = (req, file, cb) => {
  const filetypes = /jpeg|jpg|png|webp|gif/;
  const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = filetypes.test(file.mimetype);

  if (mimetype && extname) {
    return cb(null, true);
  } else {
    cb(new Error('Error: Images Only! (jpeg, jpg, png, gif, webp)'));
  }
};

// Initialize upload
const upload = multer({
  storage,
  limits: { fileSize: 5000000 }, 
  fileFilter
});

module.exports = upload;