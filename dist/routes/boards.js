import { Router } from 'express';
import { body, param, validationResult } from 'express-validator';
import { HttpError } from '../middleware/errors.js';
import { createBoard, createColumn, getBoard, listBoards, updateBoard, verifyBoardAccess, listBoardMembers, addBoardMember, removeBoardMember, updateColumn, deleteColumn, reorderColumns, updateBoardVisibility, copyColumn, moveAllCardsInColumn, archiveAllCardsInColumn, copyBoard, deleteBoard } from '../services/boardService.js';
export const boardRouter = Router();
boardRouter.get('/', async (req, res) => {
    res.json({ boards: await listBoards(req.query.projectId) });
});
boardRouter.get('/:id', param('id').isUUID(), async (req, res) => {
    const id = req.params.id;
    res.json({ board: await getBoard(id, req.user?.id) });
});
boardRouter.post('/:id/verify-access', param('id').isUUID(), async (req, res) => {
    const id = req.params.id;
    const result = await verifyBoardAccess(id, req.body.accessCode, req.user?.id);
    res.json(result);
});
boardRouter.get('/:id/members', param('id').isUUID(), async (req, res) => {
    const id = req.params.id;
    res.json({ members: await listBoardMembers(id) });
});
boardRouter.post('/:id/members', param('id').isUUID(), body('userId').isString().notEmpty(), async (req, res) => {
    const id = req.params.id;
    const members = await addBoardMember(id, req.body.userId, req.body.role || 'member');
    res.status(201).json({ members });
});
boardRouter.delete('/:id/members/:userId', param('id').isUUID(), async (req, res) => {
    const { id, userId } = req.params;
    const members = await removeBoardMember(id, userId);
    res.json({ members });
});
boardRouter.put('/:id', param('id').isUUID(), async (req, res) => {
    const id = req.params.id;
    res.json({ board: await updateBoard(id, req.body) });
});
boardRouter.post('/:id/copy', param('id').isUUID(), async (req, res) => {
    const id = req.params.id;
    const { name, keepCards } = req.body;
    res.status(201).json({ board: await copyBoard(id, name || 'Copy of Board', keepCards ?? true) });
});
boardRouter.delete('/:id', param('id').isUUID(), async (req, res) => {
    const id = req.params.id;
    res.json(await deleteBoard(id));
});
boardRouter.post('/', body('projectId').optional().isString(), body('name').trim().isLength({ min: 1, max: 160 }), (req, _res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty())
        throw new HttpError(400, errors.array()[0]?.msg ?? 'Invalid input');
    next();
}, async (req, res) => {
    res.status(201).json({ board: await createBoard(req.body, req.user?.id) });
});
boardRouter.post('/columns', body('boardId').isString().notEmpty(), body('name').trim().isLength({ min: 1, max: 160 }), async (req, res) => {
    res.status(201).json({ column: await createColumn(req.body) });
});
boardRouter.put('/columns/:id', param('id').isUUID(), async (req, res) => {
    const id = req.params.id;
    const { name, color } = req.body;
    res.json({ column: await updateColumn(id, name, color) });
});
boardRouter.post('/columns/:id/copy', param('id').isUUID(), async (req, res) => {
    const id = req.params.id;
    res.status(201).json({ column: await copyColumn(id) });
});
boardRouter.post('/columns/:id/move-cards', param('id').isUUID(), async (req, res) => {
    const id = req.params.id;
    const { targetColumnId } = req.body;
    res.json(await moveAllCardsInColumn(id, targetColumnId));
});
boardRouter.delete('/columns/:id/cards', param('id').isUUID(), async (req, res) => {
    const id = req.params.id;
    res.json(await archiveAllCardsInColumn(id));
});
boardRouter.delete('/columns/:id', param('id').isUUID(), async (req, res) => {
    const id = req.params.id;
    res.json(await deleteColumn(id));
});
boardRouter.put('/:id/columns/reorder', param('id').isUUID(), body('columnIds').isArray(), async (req, res) => {
    const id = req.params.id;
    res.json({ columns: await reorderColumns(id, req.body.columnIds) });
});
boardRouter.put('/:id/visibility', param('id').isUUID(), body('visibility').isIn(['public', 'private']), async (req, res) => {
    const id = req.params.id;
    res.json({ board: await updateBoardVisibility(id, req.body.visibility, req.body.accessCode) });
});
