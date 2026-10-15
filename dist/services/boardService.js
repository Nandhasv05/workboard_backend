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
export const createBoard = async (input, creatorId) => {
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
    if (creatorId) {
        await execute('INSERT INTO board_members (board_id, user_id, role, created_at) VALUES (?, ?, ?, ?)', [id, creatorId, 'owner', now]);
    }
    const board = (await execute('SELECT * FROM boards WHERE id = ?', [id]))[0];
    await initializeColumns(id, templateKey, projectId);
    return board;
};
export const listBoards = async (projectId) => {
    if (projectId) {
        return withoutAccessCode(await execute('SELECT b.*, p.name as project_name FROM boards b JOIN projects p ON p.id = b.project_id WHERE b.project_id = ? ORDER BY b.updated_at DESC', [projectId]));
    }
    return withoutAccessCode(await execute('SELECT b.*, p.name as project_name FROM boards b JOIN projects p ON p.id = b.project_id ORDER BY b.updated_at DESC'));
};
const withoutAccessCode = (boards) => boards.map(({ access_code: _code, ...board }) => board);
const BOARD_ADMIN_ROLES = ['admin', 'it_admin', 'superadmin'];
/** Private boards open only for their members and portal admins; everyone else must enter the access code. */
export const canOpenBoard = async (boardId, userId) => {
    const board = (await execute('SELECT visibility FROM boards WHERE id = ?', [boardId]))[0];
    if (!board || board.visibility !== 'private')
        return true;
    if (!userId)
        return false;
    const me = (await execute('SELECT u.role, CASE WHEN EXISTS (SELECT 1 FROM board_members bm WHERE bm.board_id = ? AND bm.user_id = u.id) THEN 1 ELSE 0 END AS is_member FROM users u WHERE u.id = ?', [boardId, userId]))[0];
    return !!me && (me.is_member === 1 || BOARD_ADMIN_ROLES.includes((me.role || '').toLowerCase()));
};
export const getBoard = async (id, userId) => {
    const board = (await execute('SELECT * FROM boards WHERE id = ?', [id]))[0];
    if (!board)
        throw new HttpError(404, 'Board not found');
    if (!(await canOpenBoard(id, userId))) {
        const { access_code: _code, ...summary } = board;
        return { ...summary, locked: true, columns: [], members: [] };
    }
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
export const verifyBoardAccess = async (id, accessCode, userId) => {
    const board = (await execute('SELECT id, visibility, access_code FROM boards WHERE id = ?', [id]))[0];
    if (!board)
        throw new HttpError(404, 'Board not found');
    if (board.visibility !== 'private') {
        return { success: true, message: 'Public board' };
    }
    const cleanProvided = (accessCode || '').trim().toUpperCase();
    const cleanStored = (board.access_code || '').trim().toUpperCase();
    if (cleanStored && cleanProvided === cleanStored) {
        if (userId) {
            const existing = await execute('SELECT 1 FROM board_members WHERE board_id = ? AND user_id = ?', [id, userId]);
            if (existing.length === 0) {
                await execute('INSERT INTO board_members (board_id, user_id, role, created_at) VALUES (?, ?, ?, ?)', [id, userId, 'member', new Date().toISOString()]);
            }
        }
        return { success: true, message: 'Access granted' };
    }
    throw new HttpError(403, 'Invalid access code or password');
};
export const listBoardMembers = async (boardId) => {
    return await execute(`
    SELECT bm.board_id, bm.user_id, bm.role, bm.created_at, u.name, u.username, u.email, u.department, u.emp_code, u.avatar_url
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
        // Send email notification to new member
        try {
            const [boardRows, userRows] = await Promise.all([
                execute('SELECT name FROM boards WHERE id = ?', [boardId]),
                execute('SELECT email, name FROM users WHERE id = ?', [userId]),
            ]);
            if (userRows[0]?.email && boardRows[0]?.name) {
                const { sendBoardMemberEmail } = await import('./emailService.js');
                sendBoardMemberEmail({
                    to: userRows[0].email,
                    recipientName: userRows[0].name || 'Team Member',
                    boardName: boardRows[0].name,
                    role,
                }).catch(err => console.warn('[Email] Board invitation email error:', err?.message));
            }
        }
        catch (e) {
            console.warn('[Email] Failed to send board member email:', e);
        }
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
export const updateColumn = async (id, name, color) => {
    const now = new Date().toISOString();
    if (name !== undefined && color !== undefined) {
        await execute('UPDATE board_columns SET name = ?, color = ?, updated_at = ? WHERE id = ?', [name.trim(), color, now, id]);
    }
    else if (name !== undefined) {
        await execute('UPDATE board_columns SET name = ?, updated_at = ? WHERE id = ?', [name.trim(), now, id]);
    }
    else if (color !== undefined) {
        await execute('UPDATE board_columns SET color = ?, updated_at = ? WHERE id = ?', [color, now, id]);
    }
    return (await execute('SELECT * FROM board_columns WHERE id = ?', [id]))[0];
};
export const copyColumn = async (id) => {
    const curRows = await execute('SELECT * FROM board_columns WHERE id = ?', [id]);
    const cur = curRows[0];
    if (!cur)
        throw new HttpError(404, 'Column not found');
    const newId = randomUUID();
    const now = new Date().toISOString();
    const newName = `${cur.name} (Copy)`;
    const newPos = (cur.position || 0) + 1;
    await execute('INSERT INTO board_columns (id, board_id, name, position, color, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)', [newId, cur.board_id, newName, newPos, cur.color || '#6c63ff', now, now]);
    const tasks = await execute('SELECT * FROM tasks WHERE column_id = ? ORDER BY position ASC', [id]);
    for (const t of tasks) {
        const newTaskId = randomUUID();
        await execute('INSERT INTO tasks (id, board_id, column_id, project_id, title, description, priority, start_date, due_date, due_time, due_reminder, recurring, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [newTaskId, t.board_id, newId, t.project_id, t.title, t.description ?? '', t.priority ?? 'medium', t.start_date ?? null, t.due_date ?? null, t.due_time ?? null, t.due_reminder ?? null, t.recurring ?? null, t.position ?? 0, now, now]);
    }
    return (await execute('SELECT * FROM board_columns WHERE id = ?', [newId]))[0];
};
export const moveAllCardsInColumn = async (sourceId, targetId) => {
    const now = new Date().toISOString();
    await execute('UPDATE tasks SET column_id = ?, updated_at = ? WHERE column_id = ?', [targetId, now, sourceId]);
    return { success: true, message: 'All cards moved' };
};
export const archiveAllCardsInColumn = async (colId) => {
    await execute('DELETE FROM tasks WHERE column_id = ?', [colId]);
    return { success: true, message: 'All cards deleted' };
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
export const updateBoard = async (id, data) => {
    const now = new Date().toISOString();
    if (typeof data === 'string') {
        await execute('UPDATE boards SET name = ?, updated_at = ? WHERE id = ?', [data, now, id]);
    }
    else if (data && typeof data === 'object') {
        const fields = [];
        const params = [];
        if (data.name !== undefined) {
            fields.push('name = ?');
            params.push(data.name);
        }
        if (data.background !== undefined) {
            fields.push('background = ?');
            params.push(data.background);
        }
        if (data.template !== undefined) {
            fields.push('template = ?');
            params.push(data.template);
        }
        if (data.visibility !== undefined) {
            fields.push('visibility = ?');
            params.push(data.visibility);
        }
        if (data.accessCode !== undefined) {
            fields.push('access_code = ?');
            params.push(data.accessCode);
        }
        fields.push('updated_at = ?');
        params.push(now);
        params.push(id);
        if (fields.length > 1) {
            await execute(`UPDATE boards SET ${fields.join(', ')} WHERE id = ?`, params);
        }
    }
    return (await execute('SELECT * FROM boards WHERE id = ?', [id]))[0];
};
export const copyBoard = async (sourceId, newName, keepCards = true) => {
    const source = (await execute('SELECT * FROM boards WHERE id = ?', [sourceId]))[0];
    if (!source)
        throw new Error('Source board not found');
    const newBoardId = randomUUID();
    const now = new Date().toISOString();
    let projectId = source.project_id;
    if (!projectId) {
        const defaultProj = (await execute('SELECT id FROM projects ORDER BY created_at ASC'));
        projectId = defaultProj[0]?.id || '00000000-0000-0000-0000-000000000003';
    }
    await execute('INSERT INTO boards (id, project_id, name, background, visibility, access_code, template, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [newBoardId, projectId, newName, source.background || null, source.visibility || 'public', source.access_code || null, source.template || null, now, now]);
    const columns = (await execute('SELECT * FROM board_columns WHERE board_id = ? ORDER BY position ASC', [sourceId]));
    for (const col of columns) {
        const newColId = randomUUID();
        await execute('INSERT INTO board_columns (id, board_id, name, position, color, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)', [newColId, newBoardId, col.name, col.position || 0, col.color || '#6c63ff', now, now]);
        if (keepCards) {
            const cards = (await execute('SELECT * FROM tasks WHERE board_id = ? AND column_id = ?', [sourceId, col.id]));
            for (const card of cards) {
                const newCardId = randomUUID();
                await execute('INSERT INTO tasks (id, board_id, column_id, project_id, title, description, priority, start_date, due_date, due_time, due_reminder, recurring, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [
                    newCardId, newBoardId, newColId, projectId,
                    card.title || 'Untitled', card.description || '', card.priority || 'medium',
                    card.start_date || null, card.due_date || null, card.due_time || null,
                    card.due_reminder || null, card.recurring || null, card.position || 0,
                    now, now
                ]);
                // Copy task assignees if any
                try {
                    const assignees = (await execute('SELECT user_id FROM task_assignees WHERE task_id = ?', [card.id]));
                    for (const a of assignees) {
                        await execute('INSERT INTO task_assignees (task_id, user_id, created_at) VALUES (?, ?, ?)', [newCardId, a.user_id, now]);
                    }
                }
                catch {
                    // ignore if table or column doesn't match
                }
                // Copy task checklists if any
                try {
                    const checklists = (await execute('SELECT * FROM task_checklists WHERE task_id = ? ORDER BY position ASC', [card.id]));
                    for (const ch of checklists) {
                        const newChId = randomUUID();
                        await execute('INSERT INTO task_checklists (id, task_id, title, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)', [newChId, newCardId, ch.title || 'Checklist', ch.position || 0, now, now]);
                        const items = (await execute('SELECT * FROM task_checklist_items WHERE checklist_id = ? ORDER BY position ASC', [ch.id]));
                        for (const item of items) {
                            const newItemId = randomUUID();
                            await execute('INSERT INTO task_checklist_items (id, checklist_id, title, completed, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)', [newItemId, newChId, item.title || '', item.completed ? 1 : 0, item.position || 0, now, now]);
                        }
                    }
                }
                catch {
                    // ignore if table doesn't exist
                }
            }
        }
    }
    return (await execute('SELECT * FROM boards WHERE id = ?', [newBoardId]))[0];
};
export const deleteBoard = async (id) => {
    await execute('DELETE FROM board_members WHERE board_id = ?', [id]);
    await execute('DELETE FROM boards WHERE id = ?', [id]);
    return { success: true };
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
