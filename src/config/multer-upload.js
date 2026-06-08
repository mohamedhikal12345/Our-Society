// const multer = require("multer");
// const fs = require("fs");
// const path = require("path"); // Storage configuration
// // Storage configuration
// const storage = multer.diskStorage({
//   destination: function (req, file, cb) {
//     cb(null, "uploads/posts");
//   },

//   filename: (req, file, cb) => {
//     const timestamp = Date.now();

//     const originalName = file.originalname.replace(/\s+/g, "-").replace(/[^a-zA-Z0-9]/g, "");

//     cb(null, `${timestamp}-${originalName}`);
//   },
// });

// // File filter
// const fileFilter = (req, file, cb) => {
//   const allowedTypes = ["image/jpeg", "image/png", "image/jpg", "video/mp4", "video/mov"];

//   if (allowedTypes.includes(file.mimetype)) {
//     cb(null, true);
//   } else {
//     cb(new Error("Only image/jpeg, image/png, image/jpg, video/mp4, video/mov and mp4 videos allowed"), false);
//   }
// };

// // Multer upload instance
// const postUpload = multer({
//   storage,
//   fileFilter,

//   limits: {
//     fileSize: 1024 * 1024 * 20, // 20MB
//   },
// });

// module.exports = postUpload;
const multer = require("multer");
const fs = require("fs");
const path = require("path");

const uploadDir = path.join(process.cwd(), "uploads", "posts");

console.log("Upload directory:", uploadDir); // ← This will help us debug

// Auto create folder
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
  console.log("✅ Created folder:", uploadDir);
} else {
  console.log("📁 Folder already exists:", uploadDir);
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir); // Use absolute path
  },
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    const cleanName = file.originalname.replace(/\s+/g, "-").replace(/[^a-zA-Z0-9.-]/g, "");

    cb(null, `${timestamp}-${cleanName}`);
  },
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = ["image/jpeg", "image/png", "image/jpg", "video/mp4", "video/mov"];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Only images and videos allowed"), false);
  }
};

const postUpload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 1024 * 1024 * 20 },
});

module.exports = postUpload;
