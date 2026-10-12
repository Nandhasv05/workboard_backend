import { randomUUID } from 'node:crypto';
import { execute } from '../database/pool.js';

export const createNotification = async (userId: string, type: string, title: string, message: string) => execute('INSERT INTO notifications (id, user_id, type, title, message, created_at) VALUES (?, ?, ?, ?, ?, ?)', [randomUUID(), userId, type, title, message, new Date().toISOString()]);
export const listNotifications = async (userId: string) => execute('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50', [userId]);
export const markNotificationRead = async (id: string, userId: string) => execute('UPDATE notifications SET read_at = ? WHERE id = ? AND user_id = ?', [new Date().toISOString(), id, userId]);
