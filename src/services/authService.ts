import jwt from 'jsonwebtoken';
import env from '../config/env.js';
import { execute } from '../database/pool.js';
import { HttpError } from '../middleware/errors.js';

interface PortalUserRow { id: string; name: string; username: string; email: string | null; role: string; department: string | null; emp_code: string | null; created_at: string; }
export interface AuthResult { token: string; user: { id: string; name: string; username: string; email: string | null; role: string; department: string | null; empCode: string | null; createdAt: string }; }

const USER_COLUMNS = 'id, name, username, email, role, department, emp_code, created_at';

export const portalLogin = async (usernameOrId?: string): Promise<AuthResult> => {
  const identifier = (usernameOrId || 'nandhakumar').trim();
  let rows = await execute<PortalUserRow>(
    `SELECT ${USER_COLUMNS} FROM users WHERE LOWER(username) = LOWER(?) OR LOWER(email) = LOWER(?) OR id = ? ORDER BY is_active DESC`,
    [identifier, identifier, identifier]
  );
  if (!rows[0]) {
    rows = await execute<PortalUserRow>(
      `SELECT ${USER_COLUMNS} FROM users WHERE LOWER(username) LIKE LOWER(?) OR LOWER(email) LIKE LOWER(?) ORDER BY is_active DESC`,
      [`%${identifier}%`, `%${identifier}%`]
    );
  }
  if (!rows[0]) {
    rows = await execute<PortalUserRow>(`SELECT ${USER_COLUMNS} FROM users ORDER BY is_active DESC, CAST(id AS INT) ASC`);
  }
  const user = rows[0];
  if (!user) throw new HttpError(404, 'User not found in portal');
  return {
    token: signToken(user.id, user.role),
    user: { id: user.id, name: user.name, username: user.username, email: user.email, role: user.role, department: user.department, empCode: user.emp_code, createdAt: user.created_at },
  };
};

export const listAllPortalUsers = async () => execute<Omit<PortalUserRow, 'created_at'>>(
  'SELECT id, name, username, email, role, department, emp_code FROM users WHERE is_active = 1 ORDER BY name ASC'
);

export const currentUser = async (id: string) => execute<PortalUserRow & { avatar_url?: string }>(
  `SELECT ${USER_COLUMNS}, avatar_url FROM users WHERE id = ?`,
  [id]
);

const signToken = (id: string, role: string) => jwt.sign({ sub: id, role }, env.jwtSecret, { expiresIn: env.jwtExpiresIn as jwt.SignOptions['expiresIn'] });
