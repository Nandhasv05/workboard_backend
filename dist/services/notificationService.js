import { randomUUID } from 'node:crypto';
import { execute } from '../database/pool.js';
export const createNotification = async (userId, type, title, message) => execute('INSERT INTO notifications (id, user_id, type, title, message, created_at) VALUES (?, ?, ?, ?, ?, ?)', [randomUUID(), userId, type, title, message, new Date().toISOString()]);
export const listNotifications = async (userId) => execute('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50', [userId]);
export const markNotificationRead = async (id, userId) => execute('UPDATE notifications SET read_at = ? WHERE id = ? AND user_id = ?', [new Date().toISOString(), id, userId]);
