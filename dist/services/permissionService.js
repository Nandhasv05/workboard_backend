import { execute } from '../database/pool.js';
import { HttpError } from '../middleware/errors.js';
import { isPortalAdmin } from './accessService.js';
export const PERMISSION_KEYS = [
    'board_create', 'board_view', 'board_delete',
    'list_create', 'list_view', 'list_delete',
    'card_create', 'card_view', 'card_delete',
];
const BOARD_KEYS = PERMISSION_KEYS.filter(key => key !== 'board_create');
const fullAccess = () => Object.fromEntries(PERMISSION_KEYS.map(key => [key, true]));
const noneAccess = () => Object.fromEntries(PERMISSION_KEYS.map(key => [key, false]));
const asFlag = (value) => value === true || value === 1 || value === '1';
const fromRow = (row) => ({
    ...noneAccess(),
    ...Object.fromEntries(BOARD_KEYS.map(key => [key, asFlag(row[key])])),
});
const onlyView = (parent) => ({
    board_create: false,
    board_view: parent.board_view,
    board_delete: false,
    list_create: false,
    list_view: parent.list_view && parent.board_view,
    list_delete: false,
    card_create: false,
    card_view: parent.card_view && parent.list_view && parent.board_view,
    card_delete: false,
});
const flagsOf = (input) => BOARD_KEYS.map(key => (input?.[key] ? 1 : 0));
const anyFlag = (input) => BOARD_KEYS.some(key => !!input?.[key]);
const resolveSaved = (access) => access ? fromRow(access) : noneAccess();
export const boardPermissionsFor = async (userId, boardId) => {
    if (!userId)
        return noneAccess();
    const access = (await execute('SELECT * FROM board_access WHERE board_id = ? AND user_id = ?', [boardId, userId]))[0];
    if (access)
        return resolveSaved(access);
    if (await isPortalAdmin(userId))
        return fullAccess();
    return noneAccess();
};
const columnRole = (rows, columnId, userId) => {
    const mine = rows.filter(row => String(row.column_id) === String(columnId));
    if (!mine.length)
        return null;
    const row = mine.find(item => String(item.user_id) === String(userId));
    return row ? (row.role || '').toLowerCase() : 'none';
};
const taskRole = (rows, taskId, userId) => {
    const mine = rows.filter(row => String(row.task_id) === String(taskId));
    if (!mine.length)
        return null;
    const row = mine.find(item => String(item.user_id) === String(userId));
    return row ? (row.role || '').toLowerCase() : 'none';
};
const applyListRole = (parent, role) => {
    if (role === null)
        return parent;
    if (role === 'none')
        return { ...noneAccess(), board_view: parent.board_view };
    if (role === 'view' || role === 'viewer')
        return onlyView(parent);
    return parent;
};
const applyCardRole = (parent, role) => {
    if (role === null)
        return parent;
    if (role === 'none')
        return { ...parent, card_create: false, card_view: false, card_delete: false };
    if (role === 'view' || role === 'viewer')
        return { ...parent, card_create: false, card_delete: false, card_view: parent.card_view };
    return parent;
};
export const requireBoardPermission = async (userId, boardId, key) => {
    const permissions = await boardPermissionsFor(userId, boardId);
    if (permissions[key])
        return;
    throw new HttpError(403, 'You do not have this option on this board.');
};
export const requireColumnPermission = async (userId, columnId, key) => {
    const column = (await execute('SELECT board_id FROM board_columns WHERE id = ?', [columnId]))[0];
    if (!column)
        throw new HttpError(404, 'List not found');
    const boardPerms = await boardPermissionsFor(userId, String(column.board_id));
    const rows = await execute('SELECT column_id, user_id, role FROM column_members WHERE column_id = ?', [columnId]);
    const permissions = applyListRole(boardPerms, columnRole(rows, columnId, userId));
    if (!permissions[key])
        throw new HttpError(403, 'You do not have this option on this list.');
};
export const requireTaskPermission = async (userId, taskId, key) => {
    const task = (await execute('SELECT board_id, column_id FROM tasks WHERE id = ?', [taskId]))[0];
    if (!task)
        throw new HttpError(404, 'Card not found');
    const boardPerms = await boardPermissionsFor(userId, String(task.board_id));
    const columnRows = task.column_id
        ? await execute('SELECT column_id, user_id, role FROM column_members WHERE column_id = ?', [task.column_id])
        : [];
    const taskRows = await execute('SELECT task_id, user_id, role FROM task_members WHERE task_id = ?', [taskId]);
    const listPerms = applyListRole(boardPerms, task.column_id ? columnRole(columnRows, task.column_id, userId) : null);
    const permissions = applyCardRole(listPerms, taskRole(taskRows, taskId, userId));
    if (!permissions[key])
        throw new HttpError(403, 'You do not have this option on this card.');
};
export const listBoardAccess = async (boardId) => {
    const saved = await execute('SELECT * FROM board_access WHERE board_id = ?', [boardId]);
    return saved.map(row => ({ user_id: String(row.user_id), ...fromRow(row) }));
};
export const applyRoleToBoard = async (boardId, userId, role) => {
    const value = (role || '').toLowerCase();
    if (!value || value === 'none') {
        await execute('DELETE FROM board_access WHERE board_id = ? AND user_id = ?', [boardId, userId]);
        return;
    }
    const access = value === 'view' || value === 'viewer'
        ? { ...noneAccess(), board_view: true, list_view: true, card_view: true }
        : { ...fullAccess(), board_create: false };
    const existing = await execute('SELECT 1 FROM board_access WHERE board_id = ? AND user_id = ?', [boardId, userId]);
    const values = flagsOf(access);
    const now = new Date().toISOString();
    if (existing[0]) {
        await execute(`UPDATE board_access SET ${BOARD_KEYS.map(key => `${key} = ?`).join(', ')}, updated_at = ? WHERE board_id = ? AND user_id = ?`, [...values, now, boardId, userId]);
    }
    else {
        await execute(`INSERT INTO board_access (board_id, user_id, ${BOARD_KEYS.join(', ')}, updated_at) VALUES (?, ?, ${BOARD_KEYS.map(() => '?').join(', ')}, ?)`, [boardId, userId, ...values, now]);
    }
};
const sameFlags = (left, right) => BOARD_KEYS.every(key => !!left[key] === !!right?.[key]);
const notifyAccessChange = async (boardId, userId, access) => {
    try {
        const [board] = await execute('SELECT name FROM boards WHERE id = ?', [boardId]);
        const [person] = await execute('SELECT email, name FROM users WHERE id = ?', [userId]);
        if (!board?.name || !person?.email)
            return;
        const granted = BOARD_KEYS.filter(key => access[key]).map(key => key.replace('_', ' '));
        const { sendBoardMemberEmail } = await import('./emailService.js');
        await sendBoardMemberEmail({
            to: person.email,
            recipientName: person.name || 'Team Member',
            boardName: board.name,
            role: granted.join(', ') || 'view',
        });
    }
    catch (error) {
        console.warn(`[Email] Board access mail was not delivered: ${error?.message || error}`);
    }
};
export const saveBoardAccess = async (boardId, members) => {
    const now = new Date().toISOString();
    for (const member of members) {
        if (!member?.userId)
            continue;
        const previous = (await execute('SELECT * FROM board_access WHERE board_id = ? AND user_id = ?', [boardId, member.userId]))[0];
        const previousFlags = previous ? fromRow(previous) : noneAccess();
        if (!anyFlag(member)) {
            if (await isPortalAdmin(member.userId)) {
                const values = flagsOf(noneAccess());
                if (previous) {
                    await execute(`UPDATE board_access SET ${BOARD_KEYS.map(key => `${key} = ?`).join(', ')}, updated_at = ? WHERE board_id = ? AND user_id = ?`, [...values, now, boardId, member.userId]);
                }
                else {
                    await execute(`INSERT INTO board_access (board_id, user_id, ${BOARD_KEYS.join(', ')}, updated_at) VALUES (?, ?, ${BOARD_KEYS.map(() => '?').join(', ')}, ?)`, [boardId, member.userId, ...values, now]);
                }
            }
            else if (previous) {
                await execute('DELETE FROM board_access WHERE board_id = ? AND user_id = ?', [boardId, member.userId]);
            }
            await execute('DELETE FROM board_members WHERE board_id = ? AND user_id = ? AND role <> ?', [boardId, member.userId, 'owner']);
            continue;
        }
        const values = flagsOf(member);
        if (previous) {
            await execute(`UPDATE board_access SET ${BOARD_KEYS.map(key => `${key} = ?`).join(', ')}, updated_at = ? WHERE board_id = ? AND user_id = ?`, [...values, now, boardId, member.userId]);
        }
        else {
            await execute(`INSERT INTO board_access (board_id, user_id, ${BOARD_KEYS.join(', ')}, updated_at) VALUES (?, ?, ${BOARD_KEYS.map(() => '?').join(', ')}, ?)`, [boardId, member.userId, ...values, now]);
        }
        const role = member.board_delete || member.list_create || member.list_delete || member.card_create || member.card_delete ? 'edit' : 'view';
        const existing = await execute('SELECT 1 FROM board_members WHERE board_id = ? AND user_id = ?', [boardId, member.userId]);
        if (!existing[0]) {
            await execute('INSERT INTO board_members (board_id, user_id, role, created_at) VALUES (?, ?, ?, ?)', [boardId, member.userId, role, now]);
        }
        else {
            await execute('UPDATE board_members SET role = ? WHERE board_id = ? AND user_id = ? AND role <> ?', [role, boardId, member.userId, 'owner']);
        }
        if (!sameFlags(previousFlags, member))
            await notifyAccessChange(boardId, member.userId, member);
    }
    return listBoardAccess(boardId);
};
export const permissionsForBoards = async (userId, boards) => {
    const admin = await isPortalAdmin(userId);
    if (!userId || !boards.length)
        return { boards: [], hiddenBoards: [] };
    const ids = boards.map(board => board.id);
    const saved = await execute(`SELECT * FROM board_access WHERE user_id = ? AND board_id IN (${ids.map(() => '?').join(',')})`, [userId, ...ids]);
    const visible = [];
    const hiddenBoards = [];
    for (const board of boards) {
        const row = saved.find(item => String(item.board_id) === String(board.id));
        if (row) {
            const permissions = fromRow(row);
            const shaped = { ...board, my_permissions: permissions };
            if (permissions.board_view)
                visible.push(shaped);
            else if (admin)
                hiddenBoards.push(shaped);
            continue;
        }
        if (admin)
            visible.push({ ...board, my_permissions: fullAccess() });
    }
    return { boards: visible, hiddenBoards };
};
export const shapeBoardForUser = async (userId, board) => {
    const boardPerms = await boardPermissionsFor(userId, String(board.id));
    if (!boardPerms.board_view)
        return null;
    const columns = board.columns || [];
    const columnIds = columns.map((column) => column.id);
    const tasks = columns.flatMap((column) => column.tasks || []);
    const taskIds = tasks.map((task) => task.id);
    const columnRows = columnIds.length
        ? await execute(`SELECT column_id, user_id, role FROM column_members WHERE column_id IN (${columnIds.map(() => '?').join(',')})`, columnIds)
        : [];
    const taskRows = taskIds.length
        ? await execute(`SELECT task_id, user_id, role FROM task_members WHERE task_id IN (${taskIds.map(() => '?').join(',')})`, taskIds)
        : [];
    return {
        ...board,
        my_permissions: boardPerms,
        columns: columns.flatMap((column) => {
            const listPerms = applyListRole(boardPerms, columnRole(columnRows, column.id, userId));
            if (!listPerms.list_view)
                return [];
            return [{
                    ...column,
                    my_permissions: listPerms,
                    tasks: (column.tasks || []).filter((task) => applyCardRole(listPerms, taskRole(taskRows, task.id, userId)).card_view),
                }];
        }),
    };
};
export const filterVisibleTasks = async (userId, tasks) => {
    if (!userId || !tasks.length)
        return [];
    const boards = [...new Set(tasks.map(task => String(task.board_id)))];
    const visible = [];
    for (const boardId of boards) {
        const boardPerms = await boardPermissionsFor(userId, boardId);
        if (!boardPerms.board_view)
            continue;
        const group = tasks.filter(task => String(task.board_id) === boardId);
        const columnIds = [...new Set(group.map(task => task.column_id).filter(Boolean))];
        const taskIds = group.map(task => task.id);
        const columnRows = columnIds.length
            ? await execute(`SELECT column_id, user_id, role FROM column_members WHERE column_id IN (${columnIds.map(() => '?').join(',')})`, columnIds)
            : [];
        const taskRows = await execute(`SELECT task_id, user_id, role FROM task_members WHERE task_id IN (${taskIds.map(() => '?').join(',')})`, taskIds);
        for (const task of group) {
            const listPerms = applyListRole(boardPerms, task.column_id ? columnRole(columnRows, task.column_id, userId) : null);
            const permissions = applyCardRole(listPerms, taskRole(taskRows, task.id, userId));
            if (permissions.card_view)
                visible.push({ ...task, my_permissions: permissions });
        }
    }
    return visible;
};
