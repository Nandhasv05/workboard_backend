import { Router } from 'express';
import { execute } from '../database/pool.js';
export const notificationRouter = Router();
// GET /api/notifications - List notifications for current user
notificationRouter.get('/', async (req, res) => {
    const userId = req.user?.id || '1';
    const notifications = await execute(`
    SELECT n.*
    FROM notifications n
    WHERE n.user_id = ?
    ORDER BY n.created_at DESC
  `, [userId]);
    const unreadCount = notifications.filter(n => !n.read_at).length;
    res.json({ notifications, unreadCount });
});
// PATCH /api/notifications/mark-read - Mark all unread notifications as read
notificationRouter.patch('/mark-read', async (req, res) => {
    const userId = req.user?.id || '1';
    const now = new Date().toISOString();
    await execute(`
    UPDATE notifications
    SET read_at = ?
    WHERE user_id = ? AND read_at IS NULL
  `, [now, userId]);
    res.json({ success: true, message: 'All notifications marked as read' });
});
