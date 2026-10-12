import { randomUUID } from 'node:crypto';
import { execute } from '../database/pool.js';
import { HttpError } from '../middleware/errors.js';
export const listWorkspaces = async (userId) => execute(`
  SELECT w.*, (SELECT COUNT(*) FROM workspace_members m WHERE m.workspace_id = w.id) AS member_count
  FROM workspaces w
  WHERE w.owner_id = ? OR EXISTS (SELECT 1 FROM workspace_members m WHERE m.workspace_id = w.id AND m.user_id = ?)
  ORDER BY w.updated_at DESC`, [userId, userId]);
export const createWorkspace = async (userId, input) => {
    const id = randomUUID();
    const now = new Date().toISOString();
    await execute('INSERT INTO workspaces (id, name, description, owner_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)', [id, input.name.trim(), input.description?.trim() ?? '', userId, now, now]);
    await execute('INSERT INTO workspace_members (workspace_id, user_id, role, created_at) VALUES (?, ?, ?, ?)', [id, userId, 'owner', now]);
    return (await execute('SELECT * FROM workspaces WHERE id = ?', [id]))[0];
};
export const updateWorkspace = async (id, userId, input) => {
    const current = await execute('SELECT owner_id FROM workspaces WHERE id = ?', [id]);
    if (!current[0])
        throw new HttpError(404, 'Workspace not found');
    if (current[0].owner_id !== userId)
        throw new HttpError(403, 'You cannot edit this workspace');
    await execute('UPDATE workspaces SET name = ?, description = ?, updated_at = ? WHERE id = ?', [input.name?.trim() ?? undefined, input.description?.trim() ?? undefined, new Date().toISOString(), id]);
    return (await execute('SELECT * FROM workspaces WHERE id = ?', [id]))[0];
};
export const deleteWorkspace = async (id, userId) => {
    const current = await execute('SELECT owner_id FROM workspaces WHERE id = ?', [id]);
    if (!current[0])
        throw new HttpError(404, 'Workspace not found');
    if (current[0].owner_id !== userId)
        throw new HttpError(403, 'You cannot delete this workspace');
    await execute('DELETE FROM workspaces WHERE id = ?', [id]);
};
export const addWorkspaceMember = async (workspaceId, userId, role) => {
    const existing = await execute('SELECT 1 FROM workspace_members WHERE workspace_id = ? AND user_id = ?', [workspaceId, userId]);
    if (!existing[0])
        await execute('INSERT INTO workspace_members (workspace_id, user_id, role, created_at) VALUES (?, ?, ?, ?)', [workspaceId, userId, role, new Date().toISOString()]);
};
