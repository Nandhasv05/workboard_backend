import { randomUUID } from 'node:crypto';
import { execute } from '../database/pool.js';
import { HttpError } from '../middleware/errors.js';
const TEMPLATE_CONFIGS = {
    hr: {
        columns: [
            { name: 'Job Openings', color: '#2563eb' },
            { name: 'Applications Received', color: '#7c3aed' },
            { name: 'Screening & Shortlist', color: '#ea580c' },
            { name: 'Interview Rounds', color: '#0891b2' },
            { name: 'Offer Extended', color: '#16a34a' },
            { name: 'Hired & Onboarded', color: '#059669' },
        ],
        starterTasks: [
            { colIdx: 0, title: 'Senior Full-Stack Engineer [REQ-2026-08]', priority: 'high' },
            { colIdx: 0, title: 'Lead Product Designer Opening', priority: 'medium' },
            { colIdx: 1, title: 'Screen 18 Resumes from LinkedIn Portal', priority: 'urgent' },
            { colIdx: 2, title: 'Phone Screening: Maya Lin (Tech Lead Candidate)', priority: 'high' },
            { colIdx: 3, title: 'Technical Panel Interview - Round 2', priority: 'high' },
            { colIdx: 4, title: 'Prepare Formal Offer Letter & Compensation', priority: 'urgent' },
            { colIdx: 5, title: 'Welcome Kit & Workstation Hardware Setup', priority: 'low' },
        ]
    },
    sprint: {
        columns: [
            { name: 'Sprint Backlog', color: '#64748b' },
            { name: 'Ready for Dev', color: '#2563eb' },
            { name: 'In Progress', color: '#7c3aed' },
            { name: 'Code Review', color: '#ea580c' },
            { name: 'QA & Testing', color: '#0891b2' },
            { name: 'Done', color: '#16a34a' },
        ],
        starterTasks: [
            { colIdx: 0, title: 'Refactor MSSQL Connection Pool & Pooling Metrics', priority: 'high' },
            { colIdx: 1, title: 'Board Access Code Verification Screen', priority: 'urgent' },
            { colIdx: 2, title: 'Implement Fluid Drag & Drop Sensor Handlers', priority: 'high' },
            { colIdx: 3, title: 'PR #142: Task Assignee Sync with Portal Users', priority: 'medium' },
            { colIdx: 4, title: 'Regression Suite for Card Moving Across Lists', priority: 'medium' },
            { colIdx: 5, title: 'Production SSO Handshake via EVOL Session', priority: 'high' },
        ]
    },
    marketing: {
        columns: [
            { name: 'Campaign Ideas', color: '#db2777' },
            { name: 'Content & Copy', color: '#ea580c' },
            { name: 'Design & Visuals', color: '#7c3aed' },
            { name: 'Review & Approval', color: '#2563eb' },
            { name: 'Scheduled', color: '#0891b2' },
            { name: 'Published', color: '#16a34a' },
        ],
        starterTasks: [
            { colIdx: 0, title: 'Q4 Product Launch Announcement Strategy', priority: 'high' },
            { colIdx: 1, title: 'Draft Case Study: Enterprise Workflow Speedup', priority: 'medium' },
            { colIdx: 2, title: 'Prepare Social Infographics & Hero Banners', priority: 'high' },
            { colIdx: 3, title: 'Stakeholder Brand Compliance Review', priority: 'medium' },
            { colIdx: 5, title: 'Product Update Newsletter Release', priority: 'low' },
        ]
    },
    project: {
        columns: [
            { name: 'Planning', color: '#64748b' },
            { name: 'In Progress', color: '#2563eb' },
            { name: 'Pending Review', color: '#ea580c' },
            { name: 'Blocked', color: '#dc2626' },
            { name: 'Completed', color: '#16a34a' },
        ],
        starterTasks: [
            { colIdx: 0, title: 'Project Scope & Milestones Definition', priority: 'high' },
            { colIdx: 1, title: 'Core Architecture & Database Migration', priority: 'urgent' },
            { colIdx: 2, title: 'Client Acceptance Review Meeting', priority: 'high' },
            { colIdx: 4, title: 'Kickoff Alignment Session with Team', priority: 'medium' },
        ]
    }
};
export const createBoard = async (input) => {
    const id = randomUUID();
    const now = new Date().toISOString();
    let projectId = input.projectId;
    if (!projectId) {
        const defaultProj = await execute('SELECT id FROM projects ORDER BY created_at ASC');
        projectId = defaultProj[0]?.id || '00000000-0000-0000-0000-000000000003';
    }
    const visibility = input.visibility === 'private' ? 'private' : 'public';
    let accessCode = input.accessCode?.trim() || null;
    if (visibility === 'private' && !accessCode) {
        accessCode = `EVOL-${Math.floor(1000 + Math.random() * 9000)}`;
    }
    const templateKey = input.template?.toLowerCase();
    await execute('INSERT INTO boards (id, project_id, name, background, visibility, access_code, template, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [id, projectId, input.name, input.background ?? null, visibility, accessCode, templateKey ?? null, now, now]);
    const board = (await execute('SELECT * FROM boards WHERE id = ?', [id]))[0];
    await initializeColumns(id, templateKey, projectId);
    return board;
};
export const listBoards = async (projectId) => {
    if (projectId) {
        return await execute('SELECT b.*, p.name as project_name FROM boards b JOIN projects p ON p.id = b.project_id WHERE b.project_id = ? ORDER BY b.updated_at DESC', [projectId]);
    }
    return await execute('SELECT b.*, p.name as project_name FROM boards b JOIN projects p ON p.id = b.project_id ORDER BY b.updated_at DESC');
};
export const getBoard = async (id) => {
    const board = (await execute('SELECT * FROM boards WHERE id = ?', [id]))[0];
    if (!board)
        throw new HttpError(404, 'Board not found');
    const columns = await execute('SELECT * FROM board_columns WHERE board_id = ? ORDER BY position', [id]);
    const tasks = await execute('SELECT * FROM tasks WHERE board_id = ? ORDER BY position', [id]);
    // Also fetch board members
    const members = await listBoardMembers(id);
    return {
        ...board,
        columns: columns.map(column => ({ ...column, tasks: tasks.filter(task => task.column_id === column.id) })),
        members
    };
};
export const verifyBoardAccess = async (id, accessCode) => {
    const board = (await execute('SELECT id, visibility, access_code FROM boards WHERE id = ?', [id]))[0];
    if (!board)
        throw new HttpError(404, 'Board not found');
    if (board.visibility !== 'private') {
        return { success: true, message: 'Public board' };
    }
    const cleanProvided = (accessCode || '').trim().toUpperCase();
    const cleanStored = (board.access_code || '').trim().toUpperCase();
    if (cleanProvided === cleanStored) {
        return { success: true, message: 'Access granted' };
    }
    throw new HttpError(403, 'Invalid access code or password');
};
export const listBoardMembers = async (boardId) => {
    return await execute(`
    SELECT bm.board_id, bm.user_id, bm.role, bm.created_at, u.name, u.email, u.avatar_url
    FROM board_members bm
    JOIN users u ON u.id = bm.user_id
    WHERE bm.board_id = ?
    ORDER BY bm.created_at ASC
  `, [boardId]);
};
export const addBoardMember = async (boardId, userId, role = 'member') => {
    const existing = await execute('SELECT 1 FROM board_members WHERE board_id = ? AND user_id = ?', [boardId, userId]);
    if (existing.length === 0) {
        const now = new Date().toISOString();
        await execute('INSERT INTO board_members (board_id, user_id, role, created_at) VALUES (?, ?, ?, ?)', [boardId, userId, role, now]);
    }
    return await listBoardMembers(boardId);
};
export const removeBoardMember = async (boardId, userId) => {
    await execute('DELETE FROM board_members WHERE board_id = ? AND user_id = ?', [boardId, userId]);
    return await listBoardMembers(boardId);
};
export const createColumn = async (input) => {
    const id = randomUUID();
    const now = new Date().toISOString();
    await execute('INSERT INTO board_columns (id, board_id, name, position, color, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)', [id, input.boardId, input.name, input.position ?? 0, input.color ?? '#6c63ff', now, now]);
    return (await execute('SELECT * FROM board_columns WHERE id = ?', [id]))[0];
};
export const updateColumn = async (id, name) => {
    const now = new Date().toISOString();
    await execute('UPDATE board_columns SET name = ?, updated_at = ? WHERE id = ?', [name.trim(), now, id]);
    return (await execute('SELECT * FROM board_columns WHERE id = ?', [id]))[0];
};
export const deleteColumn = async (id) => {
    await execute('DELETE FROM tasks WHERE column_id = ?', [id]);
    await execute('DELETE FROM board_columns WHERE id = ?', [id]);
    return { success: true, message: 'Column deleted' };
};
export const reorderColumns = async (boardId, columnIds) => {
    const now = new Date().toISOString();
    for (let idx = 0; idx < columnIds.length; idx++) {
        await execute('UPDATE board_columns SET position = ?, updated_at = ? WHERE id = ? AND board_id = ?', [idx, now, columnIds[idx], boardId]);
    }
    return await execute('SELECT * FROM board_columns WHERE board_id = ? ORDER BY position ASC', [boardId]);
};
export const updateBoard = async (id, name) => {
    await execute('UPDATE boards SET name = ?, updated_at = ? WHERE id = ?', [name, new Date().toISOString(), id]);
    return (await execute('SELECT * FROM boards WHERE id = ?', [id]))[0];
};
export const updateBoardVisibility = async (id, visibility, accessCode) => {
    const now = new Date().toISOString();
    let code = accessCode?.trim() || null;
    if (visibility === 'private' && !code) {
        code = `EVOL-${Math.floor(1000 + Math.random() * 9000)}`;
    }
    await execute('UPDATE boards SET visibility = ?, access_code = ?, updated_at = ? WHERE id = ?', [visibility, code, now, id]);
    return (await execute('SELECT * FROM boards WHERE id = ?', [id]))[0];
};
const initializeColumns = async (boardId, templateKey, projectId) => {
    const templateConfig = templateKey && TEMPLATE_CONFIGS[templateKey] ? TEMPLATE_CONFIGS[templateKey] : null;
    const colDefs = templateConfig ? templateConfig.columns : [
        { name: 'Backlog', color: '#64748b' },
        { name: 'To Do', color: '#2563eb' },
        { name: 'In Progress', color: '#7c3aed' },
        { name: 'Review', color: '#ea580c' },
        { name: 'Testing', color: '#0891b2' },
        { name: 'Completed', color: '#16a34a' }
    ];
    const createdColIds = [];
    const now = new Date().toISOString();
    for (const [index, col] of colDefs.entries()) {
        const colId = randomUUID();
        await execute('INSERT INTO board_columns (id, board_id, name, position, color, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)', [colId, boardId, col.name, index, col.color, now, now]);
        createdColIds.push(colId);
    }
    // If template has starter tasks, insert them
    if (templateConfig && templateConfig.starterTasks && projectId) {
        for (const [tIdx, t] of templateConfig.starterTasks.entries()) {
            const targetColId = createdColIds[t.colIdx] || createdColIds[0];
            const taskId = randomUUID();
            await execute('INSERT INTO tasks (id, board_id, column_id, project_id, title, description, priority, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [taskId, boardId, targetColId, projectId, t.title, `Initial starter task for ${t.title}`, t.priority, tIdx, now, now]);
        }
    }
};
