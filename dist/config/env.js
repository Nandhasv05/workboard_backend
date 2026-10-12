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
        host: process.env.DATABASE_HOST ?? '127.0.0.1',
        port: Number(process.env.DATABASE_PORT ?? 3306),
        name: process.env.DATABASE_NAME ?? 'orbit_todo',
        user: process.env.DATABASE_USER ?? 'root',
        password: process.env.DATABASE_PASSWORD ?? 'change-me',
        poolSize: Number(process.env.DATABASE_POOL_SIZE ?? 10),
        ssl: process.env.DATABASE_SSL === 'true',
    },
    jwtSecret: process.env.JWT_SECRET ?? 'local-development-secret-change-before-production',
    jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '7d',
    bcryptRounds: Number(process.env.BCRYPT_ROUNDS ?? 12),
    s3: {
        accessKeyId: process.env.S3_ACCESS_KEY_ID ?? '',
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? '',
        region: process.env.S3_REGION ?? 'us-east-1',
        bucket: process.env.S3_BUCKET ?? '',
        publicUrl: process.env.S3_PUBLIC_URL ?? '',
    },
    socketIoEnabled: process.env.SOCKET_IO_ENABLED === 'true',
};
export const isProduction = env.nodeEnv === 'production';
requiredInProduction('JWT_SECRET', env.jwtSecret === 'local-development-secret-change-before-production' ? undefined : env.jwtSecret);
requiredInProduction('DATABASE_PASSWORD', env.database.password !== 'change-me' ? env.database.password : undefined);
requiredInProduction('S3_BUCKET', env.s3.bucket || undefined);
export default env;
