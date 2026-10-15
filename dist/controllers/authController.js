import { currentUser, portalLogin, listAllPortalUsers } from '../services/authService.js';
import { HttpError } from '../middleware/errors.js';
export const meController = async (req, res) => {
    const rows = await currentUser(req.user.id);
    if (!rows[0])
        throw new HttpError(404, 'User not found');
    res.json({ user: rows[0] });
};
export const portalLoginController = async (req, res) => {
    const username = req.body?.username || req.query?.username || req.headers['x-portal-user'] || 'admin';
    res.json(await portalLogin(String(username)));
};
export const portalUsersController = async (_req, res) => {
    res.json({ users: await listAllPortalUsers() });
};
