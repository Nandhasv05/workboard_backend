import { randomUUID } from 'node:crypto';
import { execute } from '../database/pool.js';
import { HttpError } from '../middleware/errors.js';
export const logTaskActivity = async (taskId, userId, action, details) => {
    try {
        const actId = randomUUID();
        const now = new Date().toISOString();
        await execute('INSERT INTO task_activity_logs (id, user_id, action, entity_type, entity_id, details, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', [actId, userId || '1', action, 'task', taskId, details ? JSON.stringify(details) : null, now]);
    }
    catch (err) {
        console.error('Failed to log task activity:', err);
    }
};
export const createTask = async (userId, input) => {
    const id = randomUUID();
    const now = new Date().toISOString();
    await execute('INSERT INTO tasks (id, board_id, column_id, project_id, title, description, priority, start_date, due_date, due_time, due_reminder, recurring, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)', [id, input.boardId, input.columnId ?? null, input.projectId, input.title, input.description ?? '', input.priority ?? 'medium', input.startDate ?? null, input.dueDate ?? null, input.dueTime ?? null, input.dueReminder ?? null, input.recurring ?? null, now, now]);
    for (const assigneeId of input.assigneeIds ?? []) {
        if (assigneeId) {
            await execute('INSERT INTO task_assignees (task_id, user_id, created_at) VALUES (?, ?, ?)', [id, assigneeId, now]);
        }
    }
    await logTaskActivity(id, userId, 'created this card');
    return (await execute('SELECT * FROM tasks WHERE id = ?', [id]))[0];
};
export const updateTask = async (id, input) => {
    const current = await execute('SELECT t.*, b.name as board_name FROM tasks t LEFT JOIN boards b ON b.id = t.board_id WHERE t.id = ?', [id]);
    if (!current[0])
        throw new HttpError(404, 'Task not found');
    const cur = current[0];
    const title = input.title !== undefined ? input.title.trim() : cur.title;
    const description = input.description !== undefined ? input.description : cur.description;
    const priority = input.priority !== undefined ? input.priority : cur.priority;
    const startDate = input.startDate !== undefined ? input.startDate : cur.start_date;
    const dueDate = input.dueDate !== undefined ? input.dueDate : cur.due_date;
    const dueTime = input.dueTime !== undefined ? input.dueTime : cur.due_time;
    const dueReminder = input.dueReminder !== undefined ? input.dueReminder : cur.due_reminder;
    const recurring = input.recurring !== undefined ? input.recurring : cur.recurring;
    const columnId = input.columnId !== undefined ? input.columnId : cur.column_id;
    await execute('UPDATE tasks SET title = ?, description = ?, priority = ?, start_date = ?, due_date = ?, due_time = ?, due_reminder = ?, recurring = ?, column_id = ?, updated_at = ? WHERE id = ?', [title, description, priority, startDate, dueDate, dueTime, dueReminder, recurring, columnId, new Date().toISOString(), id]);
    const userId = input.userId || '1';
    if (input.title !== undefined && input.title.trim() !== cur.title) {
        await logTaskActivity(id, userId, `renamed card to "${title}"`);
    }
    if (input.description !== undefined && input.description !== cur.description) {
        await logTaskActivity(id, userId, 'updated description');
    }
    if (input.dueDate !== undefined && input.dueDate !== cur.due_date) {
        await logTaskActivity(id, userId, 'updated due date');
    }
    // Handle Assignees
    if (Array.isArray(input.assigneeIds)) {
        const existingAssignees = await execute('SELECT user_id FROM task_assignees WHERE task_id = ?', [id]);
        const existingSet = new Set(existingAssignees.map(a => a.user_id));
        await execute('DELETE FROM task_assignees WHERE task_id = ?', [id]);
        const now = new Date().toISOString();
        const taskTitle = title;
        const boardName = cur.board_name || 'Board';
        for (const uid of input.assigneeIds) {
            if (uid) {
                await execute('INSERT INTO task_assignees (task_id, user_id, created_at) VALUES (?, ?, ?)', [id, uid, now]);
                // Generate notification for newly assigned member
                if (!existingSet.has(uid)) {
                    const notifId = randomUUID();
                    await execute('INSERT INTO notifications (id, user_id, type, title, message, created_at) VALUES (?, ?, ?, ?, ?, ?)', [notifId, uid, 'task_assigned', `Task Assigned: ${taskTitle}`, `You have been assigned to card "${taskTitle}" in board "${boardName}"`, now]);
                    await logTaskActivity(id, userId, 'assigned member');
                }
            }
        }
    }
    // Handle Labels
    if (Array.isArray(input.labels)) {
        await execute('DELETE FROM task_labels WHERE task_id = ?', [id]);
        for (const lbl of input.labels) {
            const labelName = typeof lbl === 'string' ? lbl : lbl.name;
            const labelColor = typeof lbl === 'object' && lbl.color ? lbl.color : '#0052cc';
            if (!labelName)
                continue;
            let existing = await execute('SELECT id FROM labels WHERE name = ?', [labelName]);
            let labelId = existing[0]?.id;
            if (!labelId) {
                labelId = randomUUID();
                const now = new Date().toISOString();
                const wsRows = await execute('SELECT id FROM workspaces');
                const wsId = wsRows[0]?.id || '00000000-0000-0000-0000-000000000001';
                await execute('INSERT INTO labels (id, workspace_id, name, color, created_at) VALUES (?, ?, ?, ?, ?)', [labelId, wsId, labelName, labelColor, now]);
            }
            await execute('INSERT INTO task_labels (task_id, label_id) VALUES (?, ?)', [id, labelId]);
        }
        await logTaskActivity(id, userId, 'updated labels');
    }
    return (await execute('SELECT * FROM tasks WHERE id = ?', [id]))[0];
};
export const moveTask = async (id, columnId, position, userId) => {
    await execute('UPDATE tasks SET column_id = ?, position = ?, updated_at = ? WHERE id = ?', [columnId, position, new Date().toISOString(), id]);
    const colRows = await execute('SELECT name FROM board_columns WHERE id = ?', [columnId]);
    const colName = colRows[0]?.name || 'list';
    await logTaskActivity(id, userId || '1', `moved card to ${colName}`);
    return (await execute('SELECT * FROM tasks WHERE id = ?', [id]))[0];
};
export const deleteTask = async (id) => {
    const current = await execute('SELECT id FROM tasks WHERE id = ?', [id]);
    if (!current[0])
        throw new HttpError(404, 'Task not found');
    // Explicitly cascade delete all dependent records
    await execute('DELETE FROM task_checklist_items WHERE checklist_id IN (SELECT id FROM task_checklists WHERE task_id = ?)', [id]);
    await execute('DELETE FROM task_checklists WHERE task_id = ?', [id]);
    await execute('DELETE FROM task_comments WHERE task_id = ?', [id]);
    await execute('DELETE FROM task_assignees WHERE task_id = ?', [id]);
    await execute('DELETE FROM task_labels WHERE task_id = ?', [id]);
    await execute('DELETE FROM task_attachments WHERE task_id = ?', [id]);
    await execute('DELETE FROM task_activity_logs WHERE entity_id = ?', [id]);
    await execute('DELETE FROM tasks WHERE id = ?', [id]);
};
export const listTasks = async (projectId, boardId) => {
    let tasks;
    if (boardId) {
        tasks = await execute('SELECT * FROM tasks WHERE board_id = ? ORDER BY position ASC, updated_at DESC', [boardId]);
    }
    else if (projectId) {
        tasks = await execute('SELECT * FROM tasks WHERE project_id = ? ORDER BY position ASC, updated_at DESC', [projectId]);
    }
    else {
        tasks = await execute('SELECT * FROM tasks ORDER BY position ASC, updated_at DESC');
    }
    if (tasks.length === 0)
        return [];
    const taskIds = tasks.map(t => t.id);
    const placeholders = taskIds.map(() => '?').join(',');
    const assignees = await execute(`SELECT task_id, user_id FROM task_assignees WHERE task_id IN (${placeholders})`, taskIds);
    const labels = await execute(`SELECT tl.task_id, l.name FROM task_labels tl JOIN labels l ON l.id = tl.label_id WHERE tl.task_id IN (${placeholders})`, taskIds);
    const assigneeMap = {};
    for (const a of assignees) {
        if (!assigneeMap[a.task_id])
            assigneeMap[a.task_id] = [];
        const list = assigneeMap[a.task_id];
        if (!list.includes(a.user_id))
            list.push(a.user_id);
    }
    const labelMap = {};
    for (const l of labels) {
        if (!labelMap[l.task_id])
            labelMap[l.task_id] = [];
        const list = labelMap[l.task_id];
        if (!list.includes(l.name))
            list.push(l.name);
    }
    return tasks.map(t => ({
        ...t,
        assignee_ids: assigneeMap[t.id]?.join(',') ?? null,
        labels: labelMap[t.id]?.join(',') ?? null,
    }));
};
export const getTaskDetails = async (id) => {
    const taskRows = await execute('SELECT t.*, bc.name as column_name, b.name as board_name, p.name as project_name FROM tasks t LEFT JOIN board_columns bc ON bc.id = t.column_id LEFT JOIN boards b ON b.id = t.board_id LEFT JOIN projects p ON p.id = t.project_id WHERE t.id = ?', [id]);
    const task = taskRows[0];
    if (!task)
        throw new HttpError(404, 'Task not found');
    const assignees = await execute('SELECT u.id, u.name, u.email, u.avatar_url FROM task_assignees ta JOIN users u ON u.id = ta.user_id WHERE ta.task_id = ?', [id]);
    const labels = await execute('SELECT l.id, l.name, l.color FROM task_labels tl JOIN labels l ON l.id = tl.label_id WHERE tl.task_id = ?', [id]);
    const checklists = await execute('SELECT * FROM task_checklists WHERE task_id = ? ORDER BY created_at ASC', [id]);
    for (const checklist of checklists) {
        checklist.items = await execute('SELECT * FROM task_checklist_items WHERE checklist_id = ? ORDER BY created_at ASC', [checklist.id]);
    }
    const attachments = await execute('SELECT * FROM task_attachments WHERE task_id = ? ORDER BY created_at DESC', [id]);
    const comments = await execute('SELECT tc.id, tc.body, tc.created_at, u.id as user_id, u.name as user_name, u.avatar_url FROM task_comments tc LEFT JOIN users u ON u.id = tc.user_id WHERE tc.task_id = ? ORDER BY tc.created_at DESC', [id]);
    // Safe query for activities: LEFT JOIN users, no LIMIT keyword
    const activities = await execute('SELECT tal.id, tal.action, tal.entity_type, tal.details, tal.created_at, COALESCE(u.name, \'Team Member\') as user_name FROM task_activity_logs tal LEFT JOIN users u ON u.id = tal.user_id WHERE tal.entity_id = ? ORDER BY tal.created_at DESC', [id]);
    return {
        ...task,
        assignees,
        labels,
        checklists,
        attachments,
        comments,
        activities
    };
};
export const addComment = async (taskId, userId, body) => {
    const id = randomUUID();
    const now = new Date().toISOString();
    await execute('INSERT INTO task_comments (id, task_id, user_id, body, created_at) VALUES (?, ?, ?, ?, ?)', [id, taskId, userId || '1', body, now]);
    await logTaskActivity(taskId, userId, 'commented', { body });
    return (await execute('SELECT tc.id, tc.body, tc.created_at, u.id as user_id, u.name as user_name, u.avatar_url FROM task_comments tc LEFT JOIN users u ON u.id = tc.user_id WHERE tc.id = ?', [id]))[0];
};
export const addChecklist = async (taskId, title, userId) => {
    const id = randomUUID();
    const now = new Date().toISOString();
    await execute('INSERT INTO task_checklists (id, task_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)', [id, taskId, title, now, now]);
    await logTaskActivity(taskId, userId || '1', `added checklist "${title}"`);
    return { id, task_id: taskId, title, created_at: now, updated_at: now, items: [] };
};
export const addChecklistItem = async (checklistId, title, userId) => {
    const id = randomUUID();
    const now = new Date().toISOString();
    await execute('INSERT INTO task_checklist_items (id, checklist_id, title, completed, created_at, updated_at) VALUES (?, ?, ?, 0, ?, ?)', [id, checklistId, title, now, now]);
    const chRows = await execute('SELECT task_id FROM task_checklists WHERE id = ?', [checklistId]);
    if (chRows[0]?.task_id) {
        await logTaskActivity(chRows[0].task_id, userId || '1', `added checklist item "${title}"`);
    }
    return { id, checklist_id: checklistId, title, completed: false, created_at: now, updated_at: now };
};
export const toggleChecklistItem = async (itemId, completed, userId) => {
    const now = new Date().toISOString();
    await execute('UPDATE task_checklist_items SET completed = ?, updated_at = ? WHERE id = ?', [completed ? 1 : 0, now, itemId]);
    const itemRows = await execute('SELECT title, checklist_id FROM task_checklist_items WHERE id = ?', [itemId]);
    if (itemRows[0]) {
        const chRows = await execute('SELECT task_id FROM task_checklists WHERE id = ?', [itemRows[0].checklist_id]);
        if (chRows[0]?.task_id) {
            await logTaskActivity(chRows[0].task_id, userId || '1', `${completed ? 'completed' : 'uncompleted'} "${itemRows[0].title}"`);
        }
    }
    return (await execute('SELECT * FROM task_checklist_items WHERE id = ?', [itemId]))[0];
};
export const deleteChecklistItem = async (itemId) => {
    await execute('DELETE FROM task_checklist_items WHERE id = ?', [itemId]);
};
export const deleteChecklist = async (checklistId) => {
    await execute('DELETE FROM task_checklist_items WHERE checklist_id = ?', [checklistId]);
    await execute('DELETE FROM task_checklists WHERE id = ?', [checklistId]);
};
export const addAttachment = async (taskId, userId, fileName, fileType, fileSize, url) => {
    const id = randomUUID();
    const now = new Date().toISOString();
    await execute('INSERT INTO task_attachments (id, task_id, user_id, file_name, s3_key, url, file_type, file_size, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [id, taskId, userId || '1', fileName, fileName, url, fileType, fileSize, now]);
    await logTaskActivity(taskId, userId || '1', `attached file "${fileName}"`);
    return (await execute('SELECT * FROM task_attachments WHERE id = ?', [id]))[0];
};
export const deleteAttachment = async (attachmentId) => {
    await execute('DELETE FROM task_attachments WHERE id = ?', [attachmentId]);
};
export const getUserInbox = async (userId) => {
    const assigned = await execute(`
    SELECT t.*, b.name as board_name, bc.name as column_name, p.name as project_name
    FROM tasks t
    JOIN task_assignees ta ON ta.task_id = t.id
    LEFT JOIN boards b ON b.id = t.board_id
    LEFT JOIN board_columns bc ON bc.id = t.column_id
    LEFT JOIN projects p ON p.id = t.project_id
    WHERE ta.user_id = ?
    ORDER BY t.due_date ASC, t.updated_at DESC
  `, [userId]);
    const recent = await execute(`
    SELECT TOP 15 t.*, b.name as board_name, bc.name as column_name, p.name as project_name
    FROM tasks t
    LEFT JOIN boards b ON b.id = t.board_id
    LEFT JOIN board_columns bc ON bc.id = t.column_id
    LEFT JOIN projects p ON p.id = t.project_id
    ORDER BY t.updated_at DESC
  `);
    return { assigned, recent };
};
