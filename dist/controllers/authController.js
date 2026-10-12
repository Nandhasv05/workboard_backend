import { currentUser, login, register, portalLogin, listAllPortalUsers } from '../services/authService.js';
import { HttpError } from '../middleware/errors.js';
export const registerController = async (req, res) => {
    const { name, email, password } = req.body;
    if (!name || !email || !password || password.length < 10)
        throw new HttpError(400, 'Name, valid email, and a password of at least 10 characters are required');
    res.status(201).json(await register({ name, email, password }));
};
export const loginController = async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password)
        throw new HttpError(400, 'Email and password are required');
    res.json(await login(email, password));
};
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
