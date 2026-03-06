/**
 * Database configuration for Auth Service
 */
export const databaseConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'auth_db',
  username: process.env.DB_USER || 'doctornow',
  password: process.env.DB_PASSWORD || 'changeme',
  ssl: process.env.DB_SSL === 'true',
  pool: {
    min: 2,
    max: 10,
  },
};

