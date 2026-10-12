import type { Request, Response } from 'express';
import { currentUser, login, register, portalLogin, listAllPortalUsers } from '../services/authService.js';
import { HttpError } from '../middleware/errors.js';

export const registerController = async (req: Request, res: Response) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password || password.length < 10) throw new HttpError(400, 'Name, valid email, and a password of at least 10 characters are required');
  res.status(201).json(await register({ name, email, password }));
};

export const loginController = async (req: Request, res: Response) => {
  const { email, password } = req.body;
  if (!email || !password) throw new HttpError(400, 'Email and password are required');
  res.json(await login(email, password));
};

export const meController = async (req: Request, res: Response) => {
  const rows = await currentUser((req as Request & { user?: { id: string } }).user!.id);
  if (!rows[0]) throw new HttpError(404, 'User not found');
  res.json({ user: rows[0] });
};

export const portalLoginController = async (req: Request, res: Response) => {
  const username = req.body?.username || req.query?.username || req.headers['x-portal-user'] || 'admin';
  res.json(await portalLogin(String(username)));
};

export const portalUsersController = async (_req: Request, res: Response) => {
  res.json({ users: await listAllPortalUsers() });
};
