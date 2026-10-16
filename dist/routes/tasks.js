import { Router } from 'express';
import { body, param, validationResult } from 'express-validator';
import fs from 'fs';
import path from 'path';
import { HttpError } from '../middleware/errors.js';
import { createTask, deleteTask, listTasks, moveTask, updateTask, getTaskDetails, addComment, addChecklist, addChecklistItem, toggleChecklistItem, deleteChecklistItem, deleteChecklist, addAttachment, deleteAttachment, updateAttachmentDescription, getUserInbox, listTaskMembers, setTaskMembersAccess } from '../services/taskService.js';
import { canOpenBoard } from '../services/boardService.js';
import { requireColumnEdit, requireTaskEdit } from '../services/accessService.js';
import { filterVisibleTasks, requireBoardPermission, requireColumnPermission, requireTaskPermission } from '../services/permissionService.js';
export const taskRouter = Router();
taskRouter.get('/inbox/summary', async (req, res) => {
    const userId = req.user?.id || '1';
    res.json(await getUserInbox(userId));
});
taskRouter.get('/', async (req, res) => {
    const userId = req.user?.id;
    const boardId = req.query.boardId;
    if (boardId && !(await canOpenBoard(boardId, userId))) {
        throw new HttpError(403, 'This board is private. Enter the access code to open it.');
    }
    const tasks = await listTasks(req.query.projectId, req.query.boardId, userId);
    res.json({ tasks: await filterVisibleTasks(userId, tasks) });
});
taskRouter.get('/:id', param('id').notEmpty(), async (req, res) => {
    const id = req.params.id;
    const userId = req.user?.id;
    await requireTaskPermission(userId, id, 'card_view');
    const tasks = await filterVisibleTasks(userId, [await getTaskDetails(id, userId)]);
    if (!tasks[0])
        throw new HttpError(403, 'You do not have access to this card.');
    res.json({ task: tasks[0] });
});
taskRouter.post('/', body('boardId').notEmpty(), body('projectId').notEmpty(), body('title').trim().isLength({ min: 1, max: 240 }), (req, _res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty())
        throw new HttpError(400, errors.array()[0]?.msg ?? 'Invalid input');
    next();
}, async (req, res) => {
    const userId = req.user?.id;
    if (req.body.columnId)
        await requireColumnPermission(userId, req.body.columnId, 'card_create');
    else
        await requireBoardPermission(userId, req.body.boardId, 'card_create');
    if (req.body.columnId)
        await requireColumnEdit(req.body.columnId, userId);
    res.status(201).json({ task: await createTask(userId || '1', req.body) });
});
taskRouter.put('/:id', async (req, res) => {
    const id = req.params.id;
    const userId = req.user?.id || '1';
    await requireTaskEdit(id, userId);
    if (req.body.columnId)
        await requireColumnEdit(req.body.columnId, userId);
    res.json({ task: await updateTask(id, { ...req.body, userId }) });
});
taskRouter.patch('/:id/move', body('columnId').notEmpty(), async (req, res) => {
    const id = req.params.id;
    const userId = req.user?.id || '1';
    await requireTaskEdit(id, userId);
    await requireColumnEdit(req.body.columnId, userId);
    res.json({ task: await moveTask(id, req.body.columnId, req.body.position ?? 0, userId) });
});
taskRouter.delete('/:id', async (req, res) => {
    const id = req.params.id;
    await requireTaskPermission(req.user?.id, id, 'card_delete');
    await requireTaskEdit(id, req.user?.id);
    await deleteTask(id);
    res.status(204).send();
});
taskRouter.get('/:id/members', param('id').notEmpty(), async (req, res) => {
    const id = req.params.id;
    res.json(await listTaskMembers(id));
});
taskRouter.put('/:id/members', param('id').notEmpty(), async (req, res) => {
    const id = req.params.id;
    await requireTaskEdit(id, req.user?.id);
    res.json(await setTaskMembersAccess(id, req.body.members || []));
});
// Attachments
taskRouter.post('/:id/attachments', param('id').notEmpty(), async (req, res) => {
    const id = req.params.id;
    const { fileName, fileType, dataUrl } = req.body;
    if (!dataUrl) {
        return res.status(400).json({ error: 'dataUrl is required' });
    }
    const uploadsDir = path.resolve('uploads');
    if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
    }
    const cleanName = (fileName || 'image.png').replace(/[^a-zA-Z0-9._-]/g, '_');
    const safeName = `${Date.now()}_${cleanName}`;
    const filePath = path.join(uploadsDir, safeName);
    let buffer;
    let mime = fileType || 'image/png';
    const matches = dataUrl.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    if (matches && matches.length === 3) {
        mime = matches[1] || mime;
        buffer = Buffer.from(matches[2], 'base64');
    }
    else {
        buffer = Buffer.from(dataUrl, 'base64');
    }
    fs.writeFileSync(filePath, buffer);
    const fileUrl = `/Workboard/TodoList/uploads/${safeName}`;
    const userId = req.user?.id || '1';
    await requireTaskEdit(id, userId);
    const attachment = await addAttachment(id, userId, fileName || cleanName, mime, buffer.length, fileUrl);
    res.status(201).json({ attachment });
});
taskRouter.patch('/:id/attachments/:attachmentId', param('id').notEmpty(), param('attachmentId').notEmpty(), async (req, res) => {
    const { id, attachmentId } = req.params;
    await requireTaskEdit(id, req.user?.id);
    res.json({ attachment: await updateAttachmentDescription(attachmentId, req.body.description ?? '') });
});
taskRouter.delete('/:id/attachments/:attachmentId', param('id').notEmpty(), param('attachmentId').notEmpty(), async (req, res) => {
    const { id, attachmentId } = req.params;
    await requireTaskEdit(id, req.user?.id);
    await deleteAttachment(attachmentId);
    res.status(204).send();
});
// Comments
taskRouter.post('/:id/comments', param('id').notEmpty(), body('body').trim().isLength({ min: 1 }), async (req, res) => {
    const id = req.params.id;
    const userId = req.user?.id || '1';
    const comment = await addComment(id, userId, req.body.body);
    res.status(201).json({ comment });
});
// Checklists
taskRouter.post('/:id/checklists', param('id').notEmpty(), body('title').trim().isLength({ min: 1 }), async (req, res) => {
    const id = req.params.id;
    const userId = req.user?.id || '1';
    const checklist = await addChecklist(id, req.body.title, userId);
    res.status(201).json({ checklist });
});
taskRouter.delete('/:id/checklists/:checklistId', param('id').notEmpty(), param('checklistId').notEmpty(), async (req, res) => {
    await deleteChecklist(req.params.checklistId);
    res.status(204).send();
});
taskRouter.post('/:id/checklists/:checklistId/items', param('id').notEmpty(), param('checklistId').notEmpty(), body('title').trim().isLength({ min: 1 }), async (req, res) => {
    const userId = req.user?.id || '1';
    const item = await addChecklistItem(req.params.checklistId, req.body.title, userId);
    res.status(201).json({ item });
});
taskRouter.patch('/:id/checklists/items/:itemId', param('id').notEmpty(), param('itemId').notEmpty(), body('completed').isBoolean(), async (req, res) => {
    const userId = req.user?.id || '1';
    const item = await toggleChecklistItem(req.params.itemId, req.body.completed, userId);
    res.json({ item });
});
taskRouter.delete('/:id/checklists/items/:itemId', param('id').notEmpty(), param('itemId').notEmpty(), async (req, res) => {
    await deleteChecklistItem(req.params.itemId);
    res.status(204).send();
});
