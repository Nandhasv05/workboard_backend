import { randomUUID } from 'node:crypto';
import { execute } from '../database/pool.js';

export const logActivity = async (userId: string, action: string, entityType: string, entityId: string, details: Record<string, unknown> = {}) => execute('INSERT INTO task_activity_logs (id, user_id, action, entity_type, entity_id, details, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', [randomUUID(), userId, action, entityType, entityId, JSON.stringify(details), new Date().toISOString()]);
export const listActivity = async (workspaceId: string) => execute(`SELECT a.*, u.name, p.name AS project_name FROM task_activity_logs a JOIN users u ON u.id = a.user_id LEFT JOIN projects p ON p.id = a.entity_id WHERE a.entity_type IN ('project','task','board') AND p.workspace_id = ? ORDER BY a.created_at DESC LIMIT 100`, [workspaceId]);
