const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const { pool } = require('./database');

const JWT_SECRET = process.env.JWT_SECRET || 'mwirutijnr-secret-key-2025';

// Generate JWT token
function generateToken(userId) {
  return jwt.sign(
    { userId, type: 'admin' },
    JWT_SECRET,
    { expiresIn: '24h' }
  );
}

// Verify JWT token
function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    console.error('Token verification error:', error);
    return null;
  }
}

// Admin login
async function adminLogin(username, password) {
  try {
    const result = await pool.query(
      'SELECT * FROM admin_users WHERE username = $1',
      [username]
    );

    if (result.rows.length === 0) {
      return { success: false, error: 'Invalid credentials' };
    }

    const user = result.rows[0];
    const validPassword = await bcrypt.compare(password, user.password_hash);

    if (!validPassword) {
      return { success: false, error: 'Invalid credentials' };
    }

    const token = generateToken(user.id);
    const expiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    return {
      success: true,
      token,
      expiry: expiry.toISOString()
    };
  } catch (error) {
    console.error('Login error:', error);
    return { success: false, error: 'Server error' };
  }
}

// Verify admin token
async function verifyAdminToken(token) {
  try {
    const decoded = verifyToken(token);
    if (!decoded || decoded.type !== 'admin') {
      return { valid: false };
    }

    // Check if user still exists
    const result = await pool.query(
      'SELECT id FROM admin_users WHERE id = $1',
      [decoded.userId]
    );

    return {
      valid: result.rows.length > 0,
      userId: decoded.userId
    };
  } catch (error) {
    return { valid: false };
  }
}

// Auth middleware
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const token = authHeader.split(' ')[1];
  const decoded = verifyToken(token);

  if (!decoded || decoded.type !== 'admin') {
    return res.status(401).json({ error: 'Invalid token' });
  }

  req.userId = decoded.userId;
  next();
}

module.exports = {
  adminLogin,
  verifyAdminToken,
  authMiddleware,
  generateToken,
  verifyToken
};