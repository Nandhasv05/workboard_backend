import { execute } from '../database/pool.js';
import { HttpError } from '../middleware/errors.js';
const ADMIN_ROLES = ['admin', 'it_admin', 'superadmin'];
const roleOf = (role) => {
    const value = (role || '').toLowerCase();
    if (value === 'view' || value === 'viewer')
        return 'view';
    if (value === 'none' || value === '')
        return 'none';
    return 'edit';
};
const tighten = (parent, child) => {
    if (parent === 'none' || child === 'none')
        return 'none';
    if (parent === 'view' || child === 'view')
        return 'view';
    return 'edit';
};
const flagOn = (value) => value === true || value === 1 || value === '1';
const savedBoardAccess = async (boardId, userId) => {
    if (!userId)
        return null;
    const rows = await execute('SELECT * FROM board_access WHERE board_id = ? AND user_id = ?', [boardId, userId]);
    return rows[0] || null;
};
const levelFromSaved = (row, scope) => {
    const viewKey = scope === 'board' ? 'board_view' : scope === 'list' ? 'list_view' : 'card_view';
    const canChange = scope === 'card'
        ? flagOn(row.card_create) || flagOn(row.card_delete)
        : flagOn(row.board_delete) || flagOn(row.list_create) || flagOn(row.list_delete) || flagOn(row.card_create) || flagOn(row.card_delete);
    if (!flagOn(row[viewKey]) && !canChange)
        return 'none';
    return canChange ? 'edit' : 'view';
};
export const isPortalAdmin = async (userId) => {
    if (!userId)
        return false;
    const rows = await execute('SELECT role, username FROM users WHERE id = ?', [userId]);
    const role = (rows[0]?.role || '').toLowerCase();
    const username = (rows[0]?.username || '').toLowerCase();
    return ADMIN_ROLES.includes(role) || username === 'admin';
};
/** No member rows means the board is still open. A public board stays visible to everyone else. */
export const boardLevel = async (boardId, userId) => {
    const saved = await savedBoardAccess(boardId, userId);
    if (saved)
        return levelFromSaved(saved, 'board');
    if (await isPortalAdmin(userId))
        return 'edit';
    const board = (await execute('SELECT visibility FROM boards WHERE id = ?', [boardId]))[0];
    if (!board)
        throw new HttpError(404, 'Board not found');
    const rows = await execute('SELECT user_id, role FROM board_members WHERE board_id = ?', [boardId]);
    const mine = rows.find(row => String(row.user_id) === String(userId));
    if (mine)
        return roleOf(mine.role);
    if (rows.length === 0)
        return 'edit';
    return (board.visibility || 'public') === 'private' ? 'none' : 'view';
};
export const columnLevel = async (columnId, userId) => {
    const column = (await execute('SELECT board_id FROM board_columns WHERE id = ?', [columnId]))[0];
    if (!column)
        throw new HttpError(404, 'List not found');
    const saved = await savedBoardAccess(column.board_id, userId);
    if (!saved && await isPortalAdmin(userId))
        return 'edit';
    const parent = saved ? levelFromSaved(saved, 'list') : await boardLevel(column.board_id, userId);
    const rows = await execute('SELECT user_id, role FROM column_members WHERE column_id = ?', [columnId]);
    if (rows.length === 0)
        return parent;
    const mine = rows.find(row => String(row.user_id) === String(userId));
    return tighten(parent, mine ? roleOf(mine.role) : 'none');
};
export const taskLevel = async (taskId, userId) => {
    const task = (await execute('SELECT board_id, column_id FROM tasks WHERE id = ?', [taskId]))[0];
    if (!task)
        throw new HttpError(404, 'Card not found');
    const saved = await savedBoardAccess(task.board_id, userId);
    if (!saved && await isPortalAdmin(userId))
        return 'edit';
    const parent = saved
        ? levelFromSaved(saved, 'card')
        : task.column_id ? await columnLevel(task.column_id, userId) : await boardLevel(task.board_id, userId);
    const rows = await execute('SELECT user_id, role FROM task_members WHERE task_id = ?', [taskId]);
    if (rows.length === 0)
        return parent;
    const mine = rows.find(row => String(row.user_id) === String(userId));
    return tighten(parent, mine ? roleOf(mine.role) : 'none');
};
export const requireBoardEdit = async (boardId, userId) => {
    if ((await boardLevel(boardId, userId)) !== 'edit')
        throw new HttpError(403, 'You have view-only access to this board.');
};
export const requireColumnEdit = async (columnId, userId) => {
    const level = await columnLevel(columnId, userId);
    if (level === 'none')
        throw new HttpError(403, 'You do not have access to this list.');
    if (level !== 'edit')
        throw new HttpError(403, 'You have view-only access to this list.');
};
export const requireTaskEdit = async (taskId, userId) => {
    const level = await taskLevel(taskId, userId);
    if (level === 'none')
        throw new HttpError(403, 'You do not have access to this card.');
    if (level !== 'edit')
        throw new HttpError(403, 'You have view-only access to this card.');
};
/** One pass for a board's lists and cards. An empty member table inherits the parent level. */
export const accessMapForBoard = async (boardId, userId, columns, tasks) => {
    const columnAccess = {};
    const taskAccess = {};
    const saved = await savedBoardAccess(boardId, userId);
    if (!saved && await isPortalAdmin(userId)) {
        columns.forEach(column => { columnAccess[String(column.id)] = 'edit'; });
        tasks.forEach(task => { taskAccess[String(task.id)] = 'edit'; });
        return { columnAccess, taskAccess };
    }
    const parent = saved ? levelFromSaved(saved, 'list') : await boardLevel(boardId, userId);
    const columnIds = columns.map(column => column.id);
    const taskIds = tasks.map(task => task.id);
    const columnRows = columnIds.length
        ? await execute(`SELECT column_id, user_id, role FROM column_members WHERE column_id IN (${columnIds.map(() => '?').join(',')})`, columnIds)
        : [];
    const taskRows = taskIds.length
        ? await execute(`SELECT task_id, user_id, role FROM task_members WHERE task_id IN (${taskIds.map(() => '?').join(',')})`, taskIds)
        : [];
    const columnGroups = new Map();
    for (const row of columnRows) {
        const key = String(row.column_id);
        columnGroups.set(key, [...(columnGroups.get(key) || []), row]);
    }
    const taskGroups = new Map();
    for (const row of taskRows) {
        const key = String(row.task_id);
        taskGroups.set(key, [...(taskGroups.get(key) || []), row]);
    }
    const mine = (rows) => {
        if (!rows?.length)
            return null;
        const row = rows.find(item => String(item.user_id) === String(userId));
        return row ? roleOf(row.role) : 'none';
    };
    for (const column of columns) {
        const own = mine(columnGroups.get(String(column.id)));
        columnAccess[String(column.id)] = own == null ? parent : tighten(parent, own);
    }
    for (const task of tasks) {
        const listLevel = task.column_id != null ? columnAccess[String(task.column_id)] || parent : parent;
        const own = mine(taskGroups.get(String(task.id)));
        taskAccess[String(task.id)] = own == null ? listLevel : tighten(listLevel, own);
    }
    return { columnAccess, taskAccess };
};
