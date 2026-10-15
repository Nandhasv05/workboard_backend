import jwt from 'jsonwebtoken';
import env from '../config/env.js';
import { execute } from '../database/pool.js';
import { HttpError } from '../middleware/errors.js';
const USER_COLUMNS = 'id, name, username, email, role, department, emp_code, created_at';
export const portalLogin = async (usernameOrId) => {
    const identifier = (usernameOrId || 'nandhakumar').trim();
    let rows = await execute(`SELECT ${USER_COLUMNS} FROM users WHERE LOWER(username) = LOWER(?) OR LOWER(email) = LOWER(?) OR id = ? ORDER BY is_active DESC`, [identifier, identifier, identifier]);
    if (!rows[0]) {
        rows = await execute(`SELECT ${USER_COLUMNS} FROM users WHERE LOWER(username) LIKE LOWER(?) OR LOWER(email) LIKE LOWER(?) ORDER BY is_active DESC`, [`%${identifier}%`, `%${identifier}%`]);
    }
    if (!rows[0]) {
        rows = await execute(`SELECT ${USER_COLUMNS} FROM users ORDER BY is_active DESC, CAST(id AS INT) ASC`);
    }
    const user = rows[0];
    if (!user)
        throw new HttpError(404, 'User not found in portal');
    return {
        token: signToken(user.id, user.role),
        user: { id: user.id, name: user.name, username: user.username, email: user.email, role: user.role, department: user.department, empCode: user.emp_code, createdAt: user.created_at },
    };
};
export const listAllPortalUsers = async () => execute('SELECT id, name, username, email, role, department, emp_code FROM users WHERE is_active = 1 ORDER BY name ASC');
export const currentUser = async (id) => execute(`SELECT ${USER_COLUMNS}, avatar_url FROM users WHERE id = ?`, [id]);
const signToken = (id, role) => jwt.sign({ sub: id, role }, env.jwtSecret, { expiresIn: env.jwtExpiresIn });
