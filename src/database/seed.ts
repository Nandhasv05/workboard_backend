import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import env from '../config/env.js';
import { execute, poolEnd } from './pool.js';

const now = new Date().toISOString();
const passwordHash = await bcrypt.hash('OrbitDemo@2026', env.bcryptRounds);
const userId = '00000000-0000-0000-0000-000000000001';

const existingUsers = await execute('SELECT id FROM users WHERE email = ?', ['alex@orbit.local']);
if (existingUsers.length === 0) {
  await execute('INSERT INTO users (id, name, email, password_hash, role, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)', [userId, 'Alex Morgan', 'alex@orbit.local', passwordHash, 'owner', now, now]);
}

const workspaceId = '00000000-0000-0000-0000-000000000002';
const existingWorkspaces = await execute('SELECT id FROM workspaces WHERE id = ?', [workspaceId]);
if (existingWorkspaces.length === 0) {
  await execute('INSERT INTO workspaces (id, name, description, owner_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)', [workspaceId, 'Northstar Studio', 'Production-ready project workspace', userId, now, now]);
  await execute('INSERT INTO workspace_members (workspace_id, user_id, role, created_at) VALUES (?, ?, ?, ?)', [workspaceId, userId, 'owner', now]);
}

const projectId = '00000000-0000-0000-0000-000000000003';
const existingProjects = await execute('SELECT id FROM projects WHERE id = ?', [projectId]);
if (existingProjects.length === 0) {
  await execute('INSERT INTO projects (id, workspace_id, name, code, description, client, start_date, end_date, status, priority, manager_id, owner_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [projectId, workspaceId, 'Customer Portal', 'CP-2026', 'Customer-facing portal modernization', 'Northstar Labs', '2026-01-01', '2026-12-31', 'active', 'high', userId, userId, now, now]);
  await execute('INSERT INTO project_members (project_id, user_id, role, created_at) VALUES (?, ?, ?, ?)', [projectId, userId, 'owner', now]);
}

const boardId = '00000000-0000-0000-0000-000000000004';
const existingBoards = await execute('SELECT id FROM boards WHERE id = ?', [boardId]);
if (existingBoards.length === 0) {
  await execute('INSERT INTO boards (id, project_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)', [boardId, projectId, 'Delivery Board', now, now]);
  const columns = [['Backlog', 0], ['To Do', 1], ['In Progress', 2], ['Review', 3], ['Testing', 4], ['Completed', 5]] as const;
  for (const [name, position] of columns) {
    const id = randomUUID();
    await execute('INSERT INTO board_columns (id, board_id, name, position, color, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)', [id, boardId, name, position, '#6c63ff', now, now]);
  }
}

console.log('Seeded demo user, workspace, project, board, and columns.');
await poolEnd();
