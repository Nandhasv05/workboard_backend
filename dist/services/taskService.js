import { execute } from '../database/pool.js';
import { accessMapForBoard, taskLevel } from './accessService.js';
import { HttpError } from '../middleware/errors.js';
export const logTaskActivity = async (taskId, userId, action, details) => {
    try {
        const now = new Date().toISOString();
        await execute('INSERT INTO task_activity_logs (user_id, action, entity_type, entity_id, details, created_at) VALUES (?, ?, ?, ?, ?, ?)', [userId || '1', action, 'task', String(taskId), details ? JSON.stringify(details) : null, now]);
    }
    catch (err) {
        console.error('Failed to log task activity:', err);
    }
};
export const createTask = async (userId, input) => {
    const now = new Date().toISOString();
    const res = await execute('INSERT INTO tasks (board_id, column_id, project_id, title, description, priority, start_date, due_date, due_time, due_reminder, recurring, position, created_at, updated_at) OUTPUT INSERTED.* VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)', [input.boardId, input.columnId ?? null, input.projectId, input.title, input.description ?? '', input.priority ?? 'medium', input.startDate ?? null, input.dueDate ?? null, input.dueTime ?? null, input.dueReminder ?? null, input.recurring ?? null, now, now]);
    const task = res[0];
    const id = task.id;
    for (const assigneeId of input.assigneeIds ?? []) {
        if (assigneeId) {
            await execute('INSERT INTO task_assignees (task_id, user_id, created_at) VALUES (?, ?, ?)', [id, assigneeId, now]);
            try {
                const userRows = await execute('SELECT email, name FROM users WHERE id = ?', [assigneeId]);
                if (userRows[0]?.email) {
                    const { sendTaskAssignmentEmail } = await import('./emailService.js');
                    sendTaskAssignmentEmail({
                        to: userRows[0].email,
                        recipientName: userRows[0].name || 'Team Member',
                        taskTitle: input.title,
                        dueDate: input.dueDate || undefined,
                    }).catch(err => console.warn('[Email] Task assignment email error:', err?.message));
                }
            }
            catch (e) {
                console.warn('[Email] Failed to trigger assignee email:', e);
            }
        }
    }
    await logTaskActivity(id, userId, 'created this card');
    if (input.description && input.description.includes('@')) {
        handleMentionsInText(input.description, id, userId, 'description').catch(e => console.warn('[Mention]', e));
    }
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
        if (input.description && input.description.includes('@')) {
            handleMentionsInText(input.description, id, userId, 'description').catch(e => console.warn('[Mention]', e));
        }
    }
    if (input.dueDate !== undefined && input.dueDate !== cur.due_date) {
        await logTaskActivity(id, userId, 'updated due date');
    }
    // Handle Assignees safely
    const rawAssignees = input.assigneeIds !== undefined ? input.assigneeIds : input.assignee_ids;
    if (rawAssignees !== undefined) {
        let assigneeList = [];
        if (Array.isArray(rawAssignees)) {
            assigneeList = rawAssignees.map((a) => typeof a === 'string' ? a : a.id || a.user_id).filter(Boolean);
        }
        else if (typeof rawAssignees === 'string' && rawAssignees.trim()) {
            assigneeList = rawAssignees.split(',').map((s) => s.trim()).filter(Boolean);
        }
        const existingAssignees = await execute('SELECT user_id FROM task_assignees WHERE task_id = ?', [id]);
        const existingSet = new Set(existingAssignees.map(a => a.user_id));
        await execute('DELETE FROM task_assignees WHERE task_id = ?', [id]);
        const now = new Date().toISOString();
        const taskTitle = title;
        const boardName = cur.board_name || 'Board';
        for (const uid of assigneeList) {
            if (uid) {
                await execute('INSERT INTO task_assignees (task_id, user_id, created_at) VALUES (?, ?, ?)', [id, uid, now]);
                // Generate notification for newly assigned member
                if (!existingSet.has(uid)) {
                    await execute('INSERT INTO notifications (user_id, type, title, message, created_at) VALUES (?, ?, ?, ?, ?)', [uid, 'task_assigned', `Task Assigned: ${taskTitle}`, `You have been assigned to card "${taskTitle}" in board "${boardName}"`, now]);
                    await logTaskActivity(id, userId, 'assigned member');
                    // Send email notification to newly assigned member
                    try {
                        const userRows = await execute('SELECT email, name FROM users WHERE id = ?', [uid]);
                        if (userRows[0]?.email) {
                            const { sendTaskAssignmentEmail } = await import('./emailService.js');
                            sendTaskAssignmentEmail({
                                to: userRows[0].email,
                                recipientName: userRows[0].name || 'Team Member',
                                taskTitle,
                                boardName,
                                dueDate: input.dueDate || cur.due_date,
                            }).catch(err => console.warn('[Email] Task assignment email error:', err?.message));
                        }
                    }
                    catch (e) {
                        console.warn('[Email] Failed to trigger assignee email:', e);
                    }
                }
            }
        }
    }
    // Handle Labels safely whether passed as array of strings, array of objects, or comma string
    const rawLabels = input.labels;
    if (rawLabels !== undefined) {
        let labelList = [];
        if (Array.isArray(rawLabels)) {
            labelList = rawLabels.map((l) => typeof l === 'string' ? l : l.name).filter(Boolean);
        }
        else if (typeof rawLabels === 'string' && rawLabels.trim()) {
            labelList = rawLabels.split(',').map((s) => s.trim()).filter(Boolean);
        }
        await execute('DELETE FROM task_labels WHERE task_id = ?', [id]);
        for (const labelName of labelList) {
            if (!labelName)
                continue;
            let existing = await execute('SELECT id FROM labels WHERE name = ?', [labelName]);
            let labelId = existing[0]?.id;
            if (!labelId) {
                const now = new Date().toISOString();
                const wsRows = await execute('SELECT id FROM workspaces');
                const wsId = wsRows[0]?.id || 1;
                const newLblRes = await execute('INSERT INTO labels (workspace_id, name, color, created_at) OUTPUT INSERTED.* VALUES (?, ?, ?, ?)', [wsId, labelName, '#0052cc', now]);
                labelId = newLblRes[0]?.id;
            }
            await execute('INSERT INTO task_labels (task_id, label_id) VALUES (?, ?)', [id, labelId]);
        }
        await logTaskActivity(id, userId, 'updated labels');
    }
    return (await execute('SELECT * FROM tasks WHERE id = ?', [id]))[0];
};
333;
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
export const listTasks = async (projectId, boardId, userId) => {
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
    const visible = [];
    const byBoard = new Map();
    for (const task of tasks) {
        const key = String(task.board_id);
        byBoard.set(key, [...(byBoard.get(key) || []), task]);
    }
    for (const [groupBoardId, group] of byBoard) {
        const columns = [...new Map(group.filter(task => task.column_id != null).map(task => [String(task.column_id), { id: task.column_id }])).values()];
        const access = await accessMapForBoard(groupBoardId, userId, columns, group);
        for (const task of group) {
            const level = access.taskAccess[String(task.id)] || 'edit';
            if (level === 'none')
                continue;
            visible.push({
                ...task,
                my_access: level,
                assignee_ids: assigneeMap[task.id]?.join(',') ?? null,
                labels: labelMap[task.id]?.join(',') ?? null,
            });
        }
    }
    return visible;
};
export const getTaskDetails = async (id, userId) => {
    const taskRows = await execute('SELECT t.*, bc.name as column_name, b.name as board_name, p.name as project_name FROM tasks t LEFT JOIN board_columns bc ON bc.id = t.column_id LEFT JOIN boards b ON b.id = t.board_id LEFT JOIN projects p ON p.id = t.project_id WHERE t.id = ?', [id]);
    const task = taskRows[0];
    if (!task)
        throw new HttpError(404, 'Task not found');
    const myAccess = await taskLevel(id, userId);
    if (myAccess === 'none')
        throw new HttpError(403, 'You do not have access to this card.');
    const assignees = await execute('SELECT u.id, u.name, u.username, u.email, u.department, u.avatar_url FROM task_assignees ta JOIN users u ON u.id = ta.user_id WHERE ta.task_id = ?', [id]);
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
        my_access: myAccess,
        assignees,
        labels,
        checklists,
        attachments,
        comments,
        activities
    };
};
export const addComment = async (taskId, userId, body) => {
    const now = new Date().toISOString();
    const res = await execute('INSERT INTO task_comments (task_id, user_id, body, created_at) OUTPUT INSERTED.* VALUES (?, ?, ?, ?)', [taskId, userId || '1', body, now]);
    const comment = res[0];
    await logTaskActivity(taskId, userId, 'commented', { body });
    if (body && body.includes('@')) {
        handleMentionsInText(body, taskId, userId || '1', 'comment').catch(e => console.warn('[Mention]', e));
    }
    return (await execute('SELECT tc.id, tc.body, tc.created_at, u.id as user_id, u.name as user_name, u.avatar_url FROM task_comments tc LEFT JOIN users u ON u.id = tc.user_id WHERE tc.id = ?', [comment.id]))[0];
};
export const addChecklist = async (taskId, title, userId) => {
    const now = new Date().toISOString();
    const res = await execute('INSERT INTO task_checklists (task_id, title, created_at, updated_at) OUTPUT INSERTED.* VALUES (?, ?, ?, ?)', [taskId, title, now, now]);
    const ch = res[0];
    await logTaskActivity(taskId, userId || '1', `added checklist "${title}"`);
    return { id: ch.id, task_id: taskId, title, created_at: now, updated_at: now, items: [] };
};
export const addChecklistItem = async (checklistId, title, userId) => {
    const now = new Date().toISOString();
    const res = await execute('INSERT INTO task_checklist_items (checklist_id, title, completed, created_at, updated_at) OUTPUT INSERTED.* VALUES (?, ?, 0, ?, ?)', [checklistId, title, now, now]);
    const item = res[0];
    const chRows = await execute('SELECT task_id FROM task_checklists WHERE id = ?', [checklistId]);
    if (chRows[0]?.task_id) {
        await logTaskActivity(chRows[0].task_id, userId || '1', `added checklist item "${title}"`);
    }
    return { id: item.id, checklist_id: checklistId, title, completed: false, created_at: now, updated_at: now };
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
    3;
    const now = new Date().toISOString();
    const res = await execute('INSERT INTO task_attachments (task_id, user_id, file_name, s3_key, url, file_type, file_size, created_at) OUTPUT INSERTED.* VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [taskId, userId || '1', fileName, fileName, url, fileType, fileSize, now]);
    await logTaskActivity(taskId, userId || '1', `attached file "${fileName}"`);
    return res[0];
};
export const deleteAttachment = async (attachmentId) => {
    await execute('DELETE FROM task_attachments WHERE id = ?', [attachmentId]);
};
export const updateAttachmentDescription = async (attachmentId, description) => {
    await execute('UPDATE task_attachments SET description = ? WHERE id = ?', [description, attachmentId]);
    const rows = await execute('SELECT * FROM task_attachments WHERE id = ?', [attachmentId]);
    if (!rows[0])
        throw new HttpError(404, 'Attachment not found');
    return rows[0];
};
export const listTaskMembers = async (taskId) => {
    const own = await execute(`
    SELECT tm.task_id, tm.user_id, tm.role, tm.created_at, u.name, u.username, u.email, u.department, u.emp_code, u.avatar_url
    FROM task_members tm JOIN users u ON u.id = tm.user_id
    WHERE tm.task_id = ? ORDER BY tm.created_at ASC
  `, [taskId]);
    if (own.length > 0)
        return { members: own, inherited: false };
    const task = (await execute('SELECT column_id, board_id FROM tasks WHERE id = ?', [taskId]))[0];
    if (!task)
        throw new HttpError(404, 'Card not found');
    if (task.column_id) {
        const columnMembers = await execute(`
      SELECT cm.user_id, cm.role, u.name, u.username, u.email, u.department, u.emp_code, u.avatar_url
      FROM column_members cm JOIN users u ON u.id = cm.user_id WHERE cm.column_id = ?
    `, [task.column_id]);
        if (columnMembers.length > 0)
            return { members: columnMembers, inherited: true };
    }
    const boardMembers = await execute(`
    SELECT bm.user_id, bm.role, u.name, u.username, u.email, u.department, u.emp_code, u.avatar_url
    FROM board_members bm JOIN users u ON u.id = bm.user_id WHERE bm.board_id = ?
  `, [task.board_id]);
    return { members: boardMembers, inherited: true };
};
export const setTaskMembersAccess = async (taskId, members) => {
    const now = new Date().toISOString();
    for (const member of members) {
        if (!member.role || member.role === 'none') {
            await execute('DELETE FROM task_members WHERE task_id = ? AND user_id = ?', [taskId, member.userId]);
        }
        else {
            const existing = await execute('SELECT 1 FROM task_members WHERE task_id = ? AND user_id = ?', [taskId, member.userId]);
            if (existing.length === 0) {
                await execute('INSERT INTO task_members (task_id, user_id, role, created_at) VALUES (?, ?, ?, ?)', [taskId, member.userId, member.role, now]);
            }
            else {
                await execute('UPDATE task_members SET role = ? WHERE task_id = ? AND user_id = ?', [member.role, taskId, member.userId]);
            }
        }
    }
    return await listTaskMembers(taskId);
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
export const handleMentionsInText = async (text, taskId, senderUserId, source) => {
    if (!text)
        return;
    const matches = text.match(/@([a-zA-Z0-9._-]+)/g);
    if (!matches)
        return;
    const usernames = Array.from(new Set(matches.map(m => m.slice(1).trim().toLowerCase())));
    if (!usernames.length)
        return;
    const taskRows = await execute('SELECT t.title, b.name as board_name FROM tasks t LEFT JOIN boards b ON b.id = t.board_id WHERE t.id = ?', [taskId]);
    const taskTitle = taskRows[0]?.title || 'Card';
    const boardName = taskRows[0]?.board_name || 'Board';
    const senderRows = await execute('SELECT name FROM users WHERE id = ?', [senderUserId]);
    const senderName = senderRows[0]?.name || 'A team member';
    for (const username of usernames) {
        const userRows = await execute('SELECT id, name, email FROM users WHERE (LOWER(username) = ? OR LOWER(email) = ?) AND is_active = 1', [username, username]);
        const targetUser = userRows[0];
        if (targetUser && targetUser.email) {
            const now = new Date().toISOString();
            await execute('INSERT INTO notifications (user_id, type, title, message, created_at) VALUES (?, ?, ?, ?, ?)', [
                targetUser.id,
                'user_mentioned',
                `Mentioned by ${senderName}`,
                `${senderName} mentioned you in "${taskTitle}": "${text.slice(0, 120)}"`,
                now
            ]).catch(() => { });
            const { sendMentionEmail } = await import('./emailService.js');
            sendMentionEmail({
                to: targetUser.email,
                recipientName: targetUser.name || username,
                mentionerName: senderName,
                taskTitle,
                boardName,
                contextText: text,
                source,
            }).catch(err => console.warn('[Email] Mention notification error:', err?.message));
        }
    }
};
