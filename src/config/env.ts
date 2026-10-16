import 'dotenv/config';

const required = (name: string) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required in the .env file`);
  return value;
};

const optional = (name: string) => process.env[name]?.trim() ?? '';

const portalHost = optional('PORTAL_DB_HOST');

const env = {
  nodeEnv: optional('NODE_ENV') || 'development',
  port: Number(required('PORT')),
  frontendUrl: required('FRONTEND_URL'),
  database: {
    host: required('DATABASE_HOST'),
    port: Number(required('DATABASE_PORT')),
    name: required('DATABASE_NAME'),
    user: required('DATABASE_USER'),
    password: required('DATABASE_PASSWORD'),
    poolSize: Number(required('DATABASE_POOL_SIZE')),
    ssl: process.env.DATABASE_SSL === 'true',
  },
  // Set only on production. dbo.users is read from this server; every other table uses DATABASE_*.
  portalDb: portalHost ? {
    host: portalHost,
    port: Number(required('PORTAL_DB_PORT')),
    name: required('PORTAL_DB_NAME'),
    user: required('PORTAL_DB_USER'),
    password: required('PORTAL_DB_PASSWORD'),
    syncMinutes: Number(required('PORTAL_DB_SYNC_MINUTES')),
  } : null,
  jwtSecret: required('JWT_SECRET'),
  jwtExpiresIn: required('JWT_EXPIRES_IN'),
  smtp: {
    host: optional('SMTP_HOST'),
    port: Number(optional('SMTP_PORT') || '0'),
    secure: process.env.SMTP_SECURE === 'true',
    user: optional('SMTP_USER'),
    password: optional('SMTP_PASSWORD') || optional('SMTP_PASS'),
    from: optional('SMTP_FROM'),
  },
};

export const isProduction = env.nodeEnv === 'production';

export default env;
