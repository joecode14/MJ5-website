require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const fileUpload = require('express-fileupload');
const { pool, initializeDatabase } = require('./database');
const { adminLogin, verifyAdminToken, authMiddleware } = require('./auth');
const { uploadFile } = require('./upload');

const app = express();

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : '*',
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(fileUpload({
  limits: { fileSize: parseInt(process.env.MAX_FILE_SIZE) || 5 * 1024 * 1024 },
  abortOnLimit: true,
  createParentPath: true
}));

// Request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

// Health check endpoint
app.get('/api/health', async (req, res) => {
  try {
    // Test database connection
    await pool.query('SELECT 1');
    res.json({ 
      status: 'healthy',
      timestamp: new Date().toISOString(),
      service: 'MWIRUTI JNR API',
      database: 'connected',
      environment: process.env.NODE_ENV
    });
  } catch (error) {
    res.status(500).json({ 
      status: 'unhealthy',
      error: 'Database connection failed',
      timestamp: new Date().toISOString()
    });
  }
});

// Admin endpoints
app.post('/api/admin/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }
    
    const result = await adminLogin(username, password);
    
    if (result.success) {
      res.json(result);
    } else {
      res.status(401).json({ error: result.error });
    }
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/admin/verify', async (req, res) => {
  try {
    const { token } = req.body;
    
    if (!token) {
      return res.status(400).json({ error: 'Token is required' });
    }
    
    const result = await verifyAdminToken(token);
    res.json(result);
  } catch (error) {
    console.error('Verify error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Motorcycle endpoints
app.get('/api/motorcycles', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT m.*, 
             COALESCE(
               json_agg(
                 json_build_object(
                   'id', mi.id,
                   'image_url', mi.image_url,
                   'image_name', mi.image_name,
                   'size', mi.size,
                   'is_primary', mi.is_primary
                 )
               ) FILTER (WHERE mi.id IS NOT NULL), 
               '[]'
             ) as images
      FROM motorcycles m
      LEFT JOIN motorcycle_images mi ON m.id = mi.motorcycle_id
      WHERE m.featured = true
      GROUP BY m.id
      ORDER BY m.created_at DESC
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Get motorcycles error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/motorcycles/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(`
      SELECT m.*, 
             COALESCE(
               json_agg(
                 json_build_object(
                   'id', mi.id,
                   'image_url', mi.image_url,
                   'image_name', mi.image_name,
                   'size', mi.size,
                   'is_primary', mi.is_primary
                 )
               ) FILTER (WHERE mi.id IS NOT NULL), 
               '[]'
             ) as images
      FROM motorcycles m
      LEFT JOIN motorcycle_images mi ON m.id = mi.motorcycle_id
      WHERE m.id = $1
      GROUP BY m.id
    `, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Motorcycle not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Get motorcycle error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/motorcycles', authMiddleware, async (req, res) => {
  try {
    const { name, price, description, year, mileage, location, featured } = req.body;
    
    const result = await pool.query(
      `INSERT INTO motorcycles (name, price, description, year, mileage, location, featured) 
       VALUES ($1, $2, $3, $4, $5, $6, $7) 
       RETURNING *`,
      [name || 'New Motorcycle', price || 'KSh 0', description || '', year || '2024', mileage || '0 km', location || 'Embu', featured !== undefined ? featured : true]
    );
    
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Create motorcycle error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.put('/api/motorcycles/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, price, description, year, mileage, location, featured } = req.body;
    
    const result = await pool.query(
      `UPDATE motorcycles 
       SET name = COALESCE($1, name),
           price = COALESCE($2, price),
           description = COALESCE($3, description),
           year = COALESCE($4, year),
           mileage = COALESCE($5, mileage),
           location = COALESCE($6, location),
           featured = COALESCE($7, featured),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $8
       RETURNING *`,
      [name, price, description, year, mileage, location, featured, id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Motorcycle not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update motorcycle error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.delete('/api/motorcycles/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(
      'DELETE FROM motorcycles WHERE id = $1 RETURNING *',
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Motorcycle not found' });
    }
    
    res.json({ success: true, message: 'Motorcycle deleted' });
  } catch (error) {
    console.error('Delete motorcycle error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Motorcycle images endpoints
app.post('/api/motorcycles/:id/images', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!req.files || Object.keys(req.files).length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }
    
    const files = Array.isArray(req.files.images) ? req.files.images : [req.files.images];
    const uploadedImages = [];
    
    for (const file of files) {
      // Validate file
      if (!file.mimetype.startsWith('image/')) {
        continue;
      }
      
      if (file.size > (parseInt(process.env.MAX_FILE_SIZE) || 5 * 1024 * 1024)) {
        continue;
      }
      
      // Upload file
      const uploadResult = uploadFile(file);
      
      // Check if this is the first image for this motorcycle
      const existingImages = await pool.query(
        'SELECT COUNT(*) FROM motorcycle_images WHERE motorcycle_id = $1',
        [id]
      );
      
      const isPrimary = parseInt(existingImages.rows[0].count) === 0;
      
      // Save to database
      const imageResult = await pool.query(
        `INSERT INTO motorcycle_images (motorcycle_id, image_url, image_name, size, is_primary)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, image_url, image_name, size, is_primary`,
        [id, uploadResult.url, uploadResult.name, uploadResult.size, isPrimary]
      );
      
      uploadedImages.push(imageResult.rows[0]);
    }
    
    res.json({ images: uploadedImages });
  } catch (error) {
    console.error('Upload images error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Testimonials endpoints
app.get('/api/testimonials', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM testimonials ORDER BY created_at DESC'
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Get testimonials error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/testimonials', authMiddleware, async (req, res) => {
  try {
    const { name, location, text, color } = req.body;
    
    const result = await pool.query(
      `INSERT INTO testimonials (name, location, text, color) 
       VALUES ($1, $2, $3, $4) 
       RETURNING *`,
      [name || 'New Customer', location || 'Location', text || '', color || 'blue']
    );
    
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Create testimonial error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.put('/api/testimonials/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, location, text, color } = req.body;
    
    const result = await pool.query(
      `UPDATE testimonials 
       SET name = COALESCE($1, name),
           location = COALESCE($2, location),
           text = COALESCE($3, text),
           color = COALESCE($4, color),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $5
       RETURNING *`,
      [name, location, text, color, id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Testimonial not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update testimonial error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.delete('/api/testimonials/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(
      'DELETE FROM testimonials WHERE id = $1 RETURNING *',
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Testimonial not found' });
    }
    
    res.json({ success: true, message: 'Testimonial deleted' });
  } catch (error) {
    console.error('Delete testimonial error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Inquiry endpoints
app.post('/api/inquiries', async (req, res) => {
  try {
    const { name, phone, model, year, details } = req.body;
    
    // Basic validation
    if (!name || !phone) {
      return res.status(400).json({ error: 'Name and phone are required' });
    }
    
    // Save inquiry to database
    const result = await pool.query(
      `INSERT INTO inquiries (name, phone, model, year, details) 
       VALUES ($1, $2, $3, $4, $5) 
       RETURNING *`,
      [name, phone, model, year, details]
    );
    
    // Handle file uploads if any
    if (req.files && req.files.photos) {
      const files = Array.isArray(req.files.photos) ? req.files.photos : [req.files.photos];
      
      for (const file of files) {
        if (file.mimetype.startsWith('image/') && file.size <= (parseInt(process.env.MAX_FILE_SIZE) || 5 * 1024 * 1024)) {
          uploadFile(file);
        }
      }
    }
    
    res.status(201).json({ 
      success: true, 
      message: 'Inquiry submitted successfully',
      inquiry: result.rows[0]
    });
  } catch (error) {
    console.error('Submit inquiry error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Backup endpoint
app.get('/api/backup', authMiddleware, async (req, res) => {
  try {
    // Get all data
    const [motorcyclesResult, testimonialsResult, inquiriesResult] = await Promise.all([
      pool.query('SELECT * FROM motorcycles ORDER BY created_at'),
      pool.query('SELECT * FROM testimonials ORDER BY created_at'),
      pool.query('SELECT * FROM inquiries ORDER BY created_at')
    ]);
    
    const backupData = {
      timestamp: new Date().toISOString(),
      motorcycles: motorcyclesResult.rows,
      testimonials: testimonialsResult.rows,
      inquiries: inquiriesResult.rows
    };
    
    res.json(backupData);
  } catch (error) {
    console.error('Backup error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ 
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Initialize database and start server
async function startServer() {
  try {
    console.log('🚀 Starting MWIRUTI JNR API Server...');
    console.log(`📁 Environment: ${process.env.NODE_ENV || 'development'}`);
    
    // Initialize database
    await initializeDatabase();
    
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
      console.log(`✅ Server running on port ${PORT}`);
      console.log(`🔗 Health check: http://localhost:${PORT}/api/health`);
      console.log(`📊 API Base URL: http://localhost:${PORT}/api`);
      console.log('🏍️ MWIRUTI JNR Marketplace API Ready!');
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Start the server if this file is run directly
if (require.main === module) {
  startServer();
}

module.exports = app;