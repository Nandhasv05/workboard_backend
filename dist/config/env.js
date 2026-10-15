import 'dotenv/config';
const requiredInProduction = (name, value) => {
    if (process.env.NODE_ENV === 'production' && !value)
        throw new Error(`${name} is required in production`);
};
const env = {
    nodeEnv: process.env.NODE_ENV ?? 'development',
    port: Number(process.env.PORT ?? 4000),
    frontendUrl: process.env.FRONTEND_URL ?? 'http://localhost:5173',
    database: {
        host: process.env.DATABASE_HOST,
        port: Number(process.env.DATABASE_PORT),
        name: process.env.DATABASE_NAME,
        user: process.env.DATABASE_USER,
        password: process.env.DATABASE_PASSWORD,
        poolSize: Number(process.env.DATABASE_POOL_SIZE),
        ssl: process.env.DATABASE_SSL === 'true',
    },
    // Portal user directory (EVOL's CLIENT_API_LIVE.dbo.users), copied into todo.portal_users when set.
    portalDb: process.env.PORTAL_DB_HOST ? {
        host: process.env.PORTAL_DB_HOST,
        port: Number(process.env.PORTAL_DB_PORT),
        name: process.env.PORTAL_DB_NAME,
        user: process.env.PORTAL_DB_USER,
        password: process.env.PORTAL_DB_PASSWORD,
        syncMinutes: Number(process.env.PORTAL_DB_SYNC_MINUTES),
    } : null,
    jwtSecret: process.env.JWT_SECRET,
    jwtExpiresIn: process.env.JWT_EXPIRES_IN,
    smtp: {
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT),
        secure: process.env.SMTP_SECURE === 'true',
        user: process.env.SMTP_USER || 'meeting@evolvclothing.com',
        password: process.env.SMTP_PASSWORD || process.env.SMTP_PASS || '',
        from: process.env.SMTP_FROM || 'WorkBoard <meeting@evolvclothing.com>',
    },
};
export const isProduction = env.nodeEnv === 'production';
requiredInProduction('JWT_SECRET', env.jwtSecret);
requiredInProduction('DATABASE_PASSWORD', env.database.password);
export default env;
