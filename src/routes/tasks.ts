import { Router } from 'express';
import { body, param, validationResult } from 'express-validator';
import fs from 'fs';
import path from 'path';
import { HttpError } from '../middleware/errors.js';
import { 
  createTask, deleteTask, listTasks, moveTask, updateTask, 
  getTaskDetails, addComment, addChecklist, addChecklistItem, 
  toggleChecklistItem, deleteChecklistItem, deleteChecklist,
  addAttachment, deleteAttachment, getUserInbox
} from '../services/taskService.js';
import { canOpenBoard } from '../services/boardService.js';

export const taskRouter = Router();

taskRouter.get('/inbox/summary', async (req, res) => {
  const userId = (req as any).user?.id || '1';
  res.json(await getUserInbox(userId));
});

taskRouter.get('/', async (req, res) => {
  const boardId = req.query.boardId as string | undefined;
  if (boardId && !(await canOpenBoard(boardId, (req as any).user?.id))) {
    throw new HttpError(403, 'This board is private. Enter the access code to open it.');
  }
  res.json({ tasks: await listTasks(req.query.projectId as string, req.query.boardId as string) });
});

taskRouter.get('/:id', param('id').isUUID(), async (req, res) => {
  const id = (req.params as { id: string }).id;
  res.json({ task: await getTaskDetails(id) });
});

taskRouter.post(
  '/',
  body('boardId').isString().notEmpty(),
  body('projectId').isString().notEmpty(),
  body('title').trim().isLength({ min: 1, max: 240 }),
  (req, _res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) throw new HttpError(400, errors.array()[0]?.msg ?? 'Invalid input');
    next();
  },
  async (req, res) => {
    res.status(201).json({ task: await createTask((req as any).user?.id || '1', req.body) });
  }
);

taskRouter.put('/:id', async (req, res) => {
  const id = (req.params as { id: string }).id;
  const userId = (req as any).user?.id || '1';
  res.json({ task: await updateTask(id, { ...req.body, userId }) });
});

taskRouter.patch('/:id/move', body('columnId').isString().notEmpty(), async (req, res) => {
  const id = (req.params as { id: string }).id;
  const userId = (req as any).user?.id || '1';
  res.json({ task: await moveTask(id, req.body.columnId, req.body.position ?? 0, userId) });
});

taskRouter.delete('/:id', async (req, res) => {
  const id = (req.params as { id: string }).id;
  await deleteTask(id);
  res.status(204).send();
});

// Attachments
taskRouter.post('/:id/attachments', param('id').isUUID(), async (req, res) => {
  const id = (req.params as { id: string }).id;
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

  let buffer: Buffer;
  let mime = fileType || 'image/png';
  const matches = dataUrl.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
  if (matches && matches.length === 3) {
    mime = matches[1] || mime;
    buffer = Buffer.from(matches[2]!, 'base64');
  } else {
    buffer = Buffer.from(dataUrl, 'base64');
  }

  fs.writeFileSync(filePath, buffer);
  const fileUrl = `/Workboard/TodoList/uploads/${safeName}`;
  const userId = (req as any).user?.id || '1';

  const attachment = await addAttachment(id, userId, fileName || cleanName, mime, buffer.length, fileUrl);
  res.status(201).json({ attachment });
});

taskRouter.delete('/:id/attachments/:attachmentId', param('id').isUUID(), param('attachmentId').isUUID(), async (req, res) => {
  await deleteAttachment(req.params!.attachmentId);
  res.status(204).send();
});

// Comments
taskRouter.post('/:id/comments', param('id').isUUID(), body('body').trim().isLength({ min: 1 }), async (req, res) => {
  const id = (req.params as { id: string }).id;
  const userId = (req as any).user?.id || '1';
  const comment = await addComment(id, userId, req.body.body);
  res.status(201).json({ comment });
});

// Checklists
taskRouter.post('/:id/checklists', param('id').isUUID(), body('title').trim().isLength({ min: 1 }), async (req, res) => {
  const id = (req.params as { id: string }).id;
  const userId = (req as any).user?.id || '1';
  const checklist = await addChecklist(id, req.body.title, userId);
  res.status(201).json({ checklist });
});

taskRouter.delete('/:id/checklists/:checklistId', param('id').isUUID(), param('checklistId').isUUID(), async (req, res) => {
  await deleteChecklist(req.params!.checklistId);
  res.status(204).send();
});

taskRouter.post('/:id/checklists/:checklistId/items', param('id').isUUID(), param('checklistId').isUUID(), body('title').trim().isLength({ min: 1 }), async (req, res) => {
  const userId = (req as any).user?.id || '1';
  const item = await addChecklistItem(req.params!.checklistId, req.body.title, userId);
  res.status(201).json({ item });
});

taskRouter.patch('/:id/checklists/items/:itemId', param('id').isUUID(), param('itemId').isUUID(), body('completed').isBoolean(), async (req, res) => {
  const userId = (req as any).user?.id || '1';
  const item = await toggleChecklistItem(req.params!.itemId, req.body.completed, userId);
  res.json({ item });
});

taskRouter.delete('/:id/checklists/items/:itemId', param('id').isUUID(), param('itemId').isUUID(), async (req, res) => {
  await deleteChecklistItem(req.params!.itemId);
  res.status(204).send();
});
