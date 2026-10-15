import jwt from 'jsonwebtoken';
import env from '../config/env.js';
export const authenticate = (req, res, next) => {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
        res.status(401).json({ error: 'Authentication required' });
        return;
    }
    try {
        const token = header.slice(7);
        const decoded = jwt.verify(token, env.jwtSecret);
        req.user = { id: decoded.sub, role: decoded.role };
        next();
    }
    catch {
        res.status(401).json({ error: 'Invalid or expired token' });
    }
};
