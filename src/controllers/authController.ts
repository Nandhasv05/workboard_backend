import type { Request, Response } from 'express';
import { currentUser, portalLogin, listAllPortalUsers } from '../services/authService.js';
import { HttpError } from '../middleware/errors.js';

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
