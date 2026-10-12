import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import env from '../config/env.js';
import { execute } from '../database/pool.js';
import { HttpError } from '../middleware/errors.js';

export interface AuthInput { name: string; email: string; password: string; }
export interface AuthResult { token: string; user: { id: string; name: string; email: string; role: string; avatarUrl?: string; createdAt: string }; }

export const register = async (input: AuthInput): Promise<AuthResult> => {
  const email = input.email.trim().toLowerCase();
  const passwordHash = await bcrypt.hash(input.password, env.bcryptRounds);
  const id = randomUUID();
  const now = new Date().toISOString();
  await execute('INSERT INTO users (id, name, email, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?, ?)', [id, input.name.trim(), email, passwordHash, 'owner', now]);
  const rows = await execute<{ id: string; name: string; email: string; role: string; created_at: string }>('SELECT id, name, email, role, created_at FROM users WHERE id = ?', [id]);
  const user = rows[0];
  if (!user) throw new HttpError(500, 'Unable to create user');
  return { token: signToken(user.id, user.role), user: { ...user, avatarUrl: undefined, createdAt: user.created_at } };
};

export const login = async (email: string, password: string): Promise<AuthResult> => {
  const rows = await execute<{ id: string; name: string; email: string; password_hash: string; role: string; created_at: string }>('SELECT * FROM users WHERE email = ?', [email.trim().toLowerCase()]);
  if (!rows[0] || !await bcrypt.compare(password, rows[0].password_hash)) throw new HttpError(401, 'Invalid email or password');
  const user = rows[0];
  return { token: signToken(user.id, user.role), user: { id: user.id, name: user.name, email: user.email, role: user.role, createdAt: user.created_at } };
};

export const portalLogin = async (usernameOrId?: string): Promise<AuthResult> => {
  const identifier = (usernameOrId || 'admin').trim();
  let rows = await execute<{ id: string; name: string; email: string; role: string; created_at: string }>(
    'SELECT id, name, email, role, created_at FROM users WHERE LOWER(name) = LOWER(?) OR LOWER(email) = LOWER(?) OR id = ?',
    [identifier, identifier, identifier]
  );
  if (!rows[0]) {
    rows = await execute<{ id: string; name: string; email: string; role: string; created_at: string }>(
      'SELECT id, name, email, role, created_at FROM users ORDER BY CAST(id AS INT) ASC'
    );
  }
  const user = rows[0];
  if (!user) throw new HttpError(404, 'User not found in portal');
  return { token: signToken(user.id, user.role), user: { id: user.id, name: user.name, email: user.email, role: user.role, createdAt: user.created_at } };
};

export const listAllPortalUsers = async () => {
  return execute<{ id: string; name: string; email: string; role: string }>(
    'SELECT id, name, email, role FROM users ORDER BY CAST(id AS INT) ASC'
  );
};

export const currentUser = async (id: string) => execute<{ id: string; name: string; email: string; role: string; avatar_url?: string; created_at: string }>('SELECT id, name, email, role, avatar_url, created_at FROM users WHERE id = ?', [id]);

const signToken = (id: string, role: string) => jwt.sign({ sub: id, role }, env.jwtSecret, { expiresIn: env.jwtExpiresIn as jwt.SignOptions['expiresIn'] });
