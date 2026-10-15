import { execute } from '../database/pool.js';
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
