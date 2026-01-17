const { Pool } = require('pg');
require('dotenv').config();

// Configure PostgreSQL connection
const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// Test database connection
pool.on('connect', () => {
  console.log('✅ PostgreSQL connected successfully');
});

pool.on('error', (err) => {
  console.error('❌ PostgreSQL connection error:', err);
});

// Initialize database tables
async function initializeDatabase() {
  try {
    const client = await pool.connect();
    
    console.log('📦 Initializing database tables...');
    
    // Create motorcycles table
    await client.query(`
      CREATE TABLE IF NOT EXISTS motorcycles (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) NOT NULL,
        price VARCHAR(100) NOT NULL,
        description TEXT,
        year VARCHAR(10),
        mileage VARCHAR(50),
        location VARCHAR(100),
        featured BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create motorcycle_images table
    await client.query(`
      CREATE TABLE IF NOT EXISTS motorcycle_images (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        motorcycle_id UUID REFERENCES motorcycles(id) ON DELETE CASCADE,
        image_url TEXT NOT NULL,
        image_name VARCHAR(255),
        size INTEGER,
        is_primary BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create testimonials table
    await client.query(`
      CREATE TABLE IF NOT EXISTS testimonials (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) NOT NULL,
        location VARCHAR(100),
        text TEXT NOT NULL,
        color VARCHAR(50) DEFAULT 'blue',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create inquiries table
    await client.query(`
      CREATE TABLE IF NOT EXISTS inquiries (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) NOT NULL,
        phone VARCHAR(20) NOT NULL,
        model VARCHAR(255),
        year VARCHAR(10),
        details TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create admin users table
    await client.query(`
      CREATE TABLE IF NOT EXISTS admin_users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        username VARCHAR(100) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Insert default admin user if not exists
    const adminCheck = await client.query('SELECT * FROM admin_users WHERE username = $1', ['admin']);
    if (adminCheck.rows.length === 0) {
      const bcrypt = require('bcrypt');
      const passwordHash = await bcrypt.hash(process.env.ADMIN_PASSWORD || 'mwirutijnr2025', 10);
      await client.query(
        'INSERT INTO admin_users (username, password_hash) VALUES ($1, $2)',
        ['admin', passwordHash]
      );
      console.log('👑 Default admin user created');
    }

    // Insert sample testimonials if empty
    const testimonialCheck = await client.query('SELECT COUNT(*) FROM testimonials');
    if (parseInt(testimonialCheck.rows[0].count) === 0) {
      const sampleTestimonials = [
        ['John Kamau', 'Nairobi', 'Bought my Boxer bike from MWIRUTI JNR. Excellent condition and great service!', 'orange'],
        ['Sarah Mwangi', 'Embu', 'Sold my motorcycle here. Got the best price in town. Highly recommended!', 'blue'],
        ['Peter Omondi', 'Meru', 'Trustworthy dealers. The Suzuki bike I bought is running perfectly after 6 months.', 'green']
      ];
      
      for (const testimonial of sampleTestimonials) {
        await client.query(
          'INSERT INTO testimonials (name, location, text, color) VALUES ($1, $2, $3, $4)',
          testimonial
        );
      }
      console.log('🌟 Sample testimonials added');
    }

    // Insert sample motorcycles if empty
    const motorcycleCheck = await client.query('SELECT COUNT(*) FROM motorcycles');
    if (parseInt(motorcycleCheck.rows[0].count) === 0) {
      const sampleMotorcycles = [
        ['SkyGo 150CC', 'KSh 85,000', 'Excellent condition, low mileage, new tires. Perfect for boda boda business.', '2021', '15,000 km', 'Embu'],
        ['Boxer BM150', 'KSh 75,000', 'Well maintained, regularly serviced. Comes with new battery and spare parts.', '2020', '20,000 km', 'Nairobi'],
        ['Suzuki 125', 'KSh 95,000', 'Fuel efficient, smooth engine. Great for long distances and daily commute.', '2022', '8,000 km', 'Meru']
      ];
      
      for (const bike of sampleMotorcycles) {
        const result = await client.query(
          'INSERT INTO motorcycles (name, price, description, year, mileage, location) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
          bike
        );
        
        // Add sample images
        const sampleImageUrl = 'https://images.unsplash.com/photo-1558981806-ec527fa84c39?ixlib=rb-1.2.1&auto=format&fit=crop&w=500&h=300&q=80';
        await client.query(
          'INSERT INTO motorcycle_images (motorcycle_id, image_url, image_name, size, is_primary) VALUES ($1, $2, $3, $4, $5)',
          [result.rows[0].id, sampleImageUrl, 'sample-motorcycle.jpg', 102400, true]
        );
      }
      console.log('🏍️ Sample motorcycles added');
    }

    client.release();
    console.log('✅ Database initialization completed successfully');
  } catch (error) {
    console.error('❌ Database initialization error:', error);
  }
}

module.exports = { pool, initializeDatabase };