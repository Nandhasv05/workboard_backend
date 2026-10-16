import { Router } from 'express';
import { body, param, validationResult } from 'express-validator';
import { HttpError } from '../middleware/errors.js';
import { 
  createBoard, createColumn, getBoard, listBoards, updateBoard,
  verifyBoardAccess, listBoardMembers, addBoardMember, removeBoardMember,
  updateColumn, deleteColumn, reorderColumns, updateBoardVisibility,
  copyColumn, moveAllCardsInColumn, archiveAllCardsInColumn,
  copyBoard, deleteBoard, setBoardMembersAccess, listColumnMembers, setColumnMembersAccess
} from '../services/boardService.js';
import { isPortalAdmin, requireBoardEdit, requireColumnEdit } from '../services/accessService.js';
import { listBoardAccess, permissionsForBoards, requireBoardPermission, requireColumnPermission, saveBoardAccess, shapeBoardForUser } from '../services/permissionService.js';

export const boardRouter = Router();

boardRouter.get('/', async (req, res) => {
  const userId = (req as any).user?.id;
  const boards = await listBoards(req.query.projectId as string);
  res.json(await permissionsForBoards(userId, boards));
});

boardRouter.get('/:id/access', param('id').notEmpty(), async (req, res) => {
  const id = (req.params as { id: string }).id;
  if (!(await isPortalAdmin((req as any).user?.id))) throw new HttpError(403, 'Only an admin can view member access settings.');
  res.json({ members: await listBoardAccess(id) });
});

boardRouter.put('/:id/access', param('id').notEmpty(), async (req, res) => {
  const id = (req.params as { id: string }).id;
  if (!(await isPortalAdmin((req as any).user?.id))) throw new HttpError(403, 'Only an admin can change member access.');
  res.json({ members: await saveBoardAccess(id, req.body.members || []) });
});

boardRouter.get('/:id', param('id').notEmpty(), async (req, res) => {
  const id = (req.params as { id: string }).id;
  const userId = (req as any).user?.id;
  const board = await getBoard(id, userId);
  if ('locked' in board && board.locked) {
    res.json({ board });
    return;
  }
  const visible = await shapeBoardForUser(userId, board);
  if (!visible) throw new HttpError(403, 'You do not have access to this board.');
  res.json({ board: visible });
});

boardRouter.post('/:id/verify-access', param('id').notEmpty(), async (req, res) => {
  const id = (req.params as { id: string }).id;
  const result = await verifyBoardAccess(id, req.body.accessCode, (req as any).user?.id);
  res.json(result);
});

boardRouter.get('/:id/members', param('id').notEmpty(), async (req, res) => {
  const id = (req.params as { id: string }).id;
  res.json({ members: await listBoardMembers(id) });
});

boardRouter.post('/:id/members', param('id').notEmpty(), body('userId').isString().notEmpty(), async (req, res) => {
  const id = (req.params as { id: string }).id;
  const members = await addBoardMember(id, req.body.userId, req.body.role || 'member');
  res.status(201).json({ members });
});

boardRouter.put('/:id/members', param('id').notEmpty(), async (req, res) => {
  const id = (req.params as { id: string }).id;
  await requireBoardEdit(id, (req as any).user?.id);
  const members = await setBoardMembersAccess(id, req.body.members || []);
  res.json({ members });
});

boardRouter.delete('/:id/members/:userId', param('id').notEmpty(), async (req, res) => {
  const { id, userId } = req.params as { id: string; userId: string };
  const members = await removeBoardMember(id, userId);
  res.json({ members });
});

boardRouter.put('/:id', param('id').notEmpty(), async (req, res) => {
  const id = (req.params as { id: string }).id;
  res.json({ board: await updateBoard(id, req.body) });
});

boardRouter.post('/:id/copy', param('id').notEmpty(), async (req, res) => {
  const id = (req.params as { id: string }).id;
  if (!(await isPortalAdmin((req as any).user?.id))) throw new HttpError(403, 'Only an admin can create a board.');
  const { name, keepCards } = req.body;
  res.status(201).json({ board: await copyBoard(id, name || 'Copy of Board', keepCards ?? true) });
});

boardRouter.delete('/:id', param('id').notEmpty(), async (req, res) => {
  const id = (req.params as { id: string }).id;
  await requireBoardPermission((req as any).user?.id, id, 'board_delete');
  res.json(await deleteBoard(id));
});

boardRouter.post('/', body('projectId').optional().isString(), body('name').trim().isLength({ min: 1, max: 160 }), (req, _res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) throw new HttpError(400, errors.array()[0]?.msg ?? 'Invalid input');
  next();
}, async (req, res) => {
  if (!(await isPortalAdmin((req as any).user?.id))) throw new HttpError(403, 'Only an admin can create a board.');
  res.status(201).json({ board: await createBoard(req.body, (req as any).user?.id) });
});

boardRouter.post('/columns', body('boardId').isString().notEmpty(), body('name').trim().isLength({ min: 1, max: 160 }), async (req, res) => {
  await requireBoardPermission((req as any).user?.id, req.body.boardId, 'list_create');
  await requireBoardEdit(req.body.boardId, (req as any).user?.id);
  res.status(201).json({ column: await createColumn(req.body) });
});

boardRouter.get('/columns/:id/members', param('id').notEmpty(), async (req, res) => {
  const id = (req.params as { id: string }).id;
  res.json(await listColumnMembers(id));
});

boardRouter.put('/columns/:id/members', param('id').notEmpty(), async (req, res) => {
  const id = (req.params as { id: string }).id;
  await requireColumnEdit(id, (req as any).user?.id);
  res.json(await setColumnMembersAccess(id, req.body.members || []));
});

boardRouter.put('/columns/:id', param('id').notEmpty(), async (req, res) => {
  const id = (req.params as { id: string }).id;
  await requireColumnEdit(id, (req as any).user?.id);
  const { name, color } = req.body;
  res.json({ column: await updateColumn(id, name, color) });
});

boardRouter.post('/columns/:id/copy', param('id').notEmpty(), async (req, res) => {
  const id = (req.params as { id: string }).id;
  await requireColumnPermission((req as any).user?.id, id, 'list_create');
  await requireColumnEdit(id, (req as any).user?.id);
  res.status(201).json({ column: await copyColumn(id) });
});

boardRouter.post('/columns/:id/move-cards', param('id').notEmpty(), async (req, res) => {
  const id = (req.params as { id: string }).id;
  await requireColumnEdit(id, (req as any).user?.id);
  const { targetColumnId } = req.body;
  if (targetColumnId) await requireColumnEdit(targetColumnId, (req as any).user?.id);
  res.json(await moveAllCardsInColumn(id, targetColumnId));
});

boardRouter.delete('/columns/:id/cards', param('id').notEmpty(), async (req, res) => {
  const id = (req.params as { id: string }).id;
  await requireColumnPermission((req as any).user?.id, id, 'card_delete');
  await requireColumnEdit(id, (req as any).user?.id);
  res.json(await archiveAllCardsInColumn(id));
});

boardRouter.delete('/columns/:id', param('id').notEmpty(), async (req, res) => {
  const id = (req.params as { id: string }).id;
  await requireColumnPermission((req as any).user?.id, id, 'list_delete');
  await requireColumnEdit(id, (req as any).user?.id);
  res.json(await deleteColumn(id));
});

boardRouter.put('/:id/columns/reorder', param('id').notEmpty(), body('columnIds').isArray(), async (req, res) => {
  const id = (req.params as { id: string }).id;
  res.json({ columns: await reorderColumns(id, req.body.columnIds) });
});

boardRouter.put('/:id/visibility', param('id').notEmpty(), body('visibility').isIn(['public', 'private']), async (req, res) => {
  const id = (req.params as { id: string }).id;
  res.json({ board: await updateBoardVisibility(id, req.body.visibility, req.body.accessCode) });
});

