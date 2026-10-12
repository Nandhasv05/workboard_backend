import { randomUUID } from 'node:crypto';
import { execute } from '../database/pool.js';
import { HttpError } from '../middleware/errors.js';
export const listProjects = async (workspaceId, userId) => {
    if (workspaceId) {
        return execute(`
      SELECT p.*, (SELECT COUNT(*) FROM project_members pm WHERE pm.project_id = p.id) AS member_count FROM projects p
      WHERE p.workspace_id = ? AND (p.manager_id = ? OR p.owner_id = ? OR EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = p.id AND pm.user_id = ?))
      ORDER BY p.updated_at DESC`, [workspaceId, userId ?? null, userId ?? null, userId ?? null]);
    }
    return execute(`
    SELECT p.*, (SELECT COUNT(*) FROM project_members pm WHERE pm.project_id = p.id) AS member_count FROM projects p
    WHERE (p.manager_id = ? OR p.owner_id = ? OR ? IS NULL OR EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = p.id AND pm.user_id = ?))
    ORDER BY p.updated_at DESC`, [userId ?? null, userId ?? null, userId ?? null, userId ?? null]);
};
export const createProject = async (input) => {
    const id = randomUUID();
    const now = new Date().toISOString();
    await execute(`INSERT INTO projects (id, workspace_id, name, code, description, client, start_date, end_date, status, priority, manager_id, owner_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [id, input.workspaceId, input.name, input.code, input.description ?? '', input.client ?? '', input.startDate ?? '', input.endDate ?? '', input.status ?? 'planning', input.priority ?? 'medium', input.managerId ?? null, input.managerId ?? null, now, now]);
    return (await execute('SELECT * FROM projects WHERE id = ?', [id]))[0];
};
export const updateProject = async (id, userId, input) => {
    const current = await execute('SELECT owner_id, manager_id FROM projects WHERE id = ?', [id]);
    if (!current[0])
        throw new HttpError(404, 'Project not found');
    if (current[0].owner_id !== userId && current[0].manager_id !== userId)
        throw new HttpError(403, 'You cannot edit this project');
    await execute('UPDATE projects SET name = ?, code = ?, description = ?, client = ?, start_date = ?, end_date = ?, status = ?, priority = ?, manager_id = ?, updated_at = ? WHERE id = ?', [input.name?.trim() ?? undefined, input.code?.trim() ?? undefined, input.description?.trim() ?? undefined, input.client?.trim() ?? undefined, input.startDate ?? undefined, input.endDate ?? undefined, input.status ?? undefined, input.priority ?? undefined, input.managerId ?? undefined, new Date().toISOString(), id]);
    return (await execute('SELECT * FROM projects WHERE id = ?', [id]))[0];
};
export const archiveProject = async (id, userId) => {
    const current = await execute('SELECT owner_id FROM projects WHERE id = ?', [id]);
    if (!current[0])
        throw new HttpError(404, 'Project not found');
    if (current[0].owner_id !== userId)
        throw new HttpError(403, 'You cannot archive this project');
    await execute('UPDATE projects SET status = ?, updated_at = ? WHERE id = ?', ['archived', new Date().toISOString(), id]);
};
