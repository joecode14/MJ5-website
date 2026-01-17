const crypto = require('crypto');

// Simple in-memory storage for Vercel (for demo purposes)
// In production, use S3, Cloudinary, or Vercel Blob Storage
const uploads = new Map();

function uploadFile(file) {
  try {
    // Generate unique filename
    const fileId = crypto.randomBytes(16).toString('hex');
    
    // Convert buffer to base64 for storage
    const base64Data = file.data.toString('base64');
    const dataUrl = `data:${file.mimetype};base64,${base64Data}`;
    
    // Store file info
    const fileInfo = {
      id: fileId,
      name: file.name,
      size: file.size,
      mimetype: file.mimetype,
      dataUrl: dataUrl,
      createdAt: new Date().toISOString()
    };
    
    uploads.set(fileId, fileInfo);
    
    return {
      id: fileId,
      url: dataUrl,
      name: file.name,
      size: file.size
    };
  } catch (error) {
    console.error('Upload error:', error);
    throw new Error('File upload failed');
  }
}

function getFile(fileId) {
  return uploads.get(fileId);
}

module.exports = {
  uploadFile,
  getFile
};