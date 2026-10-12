import { Router } from 'express';
import { body, param, validationResult } from 'express-validator';
import { HttpError } from '../middleware/errors.js';
import { createBoard, createColumn, getBoard, listBoards, updateBoard, verifyBoardAccess, listBoardMembers, addBoardMember, removeBoardMember, updateColumn, deleteColumn, reorderColumns, updateBoardVisibility } from '../services/boardService.js';
export const boardRouter = Router();
boardRouter.get('/', async (req, res) => {
    res.json({ boards: await listBoards(req.query.projectId) });
});
boardRouter.get('/:id', param('id').isUUID(), async (req, res) => {
    const id = req.params.id;
    res.json({ board: await getBoard(id) });
});
boardRouter.post('/:id/verify-access', param('id').isUUID(), async (req, res) => {
    const id = req.params.id;
    const result = await verifyBoardAccess(id, req.body.accessCode);
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
boardRouter.put('/:id', param('id').isUUID(), body('name').trim().isLength({ min: 1, max: 160 }), async (req, res) => {
    const id = req.params.id;
    res.json({ board: await updateBoard(id, req.body.name) });
});
boardRouter.post('/', body('projectId').optional().isString(), body('name').trim().isLength({ min: 1, max: 160 }), (req, _res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty())
        throw new HttpError(400, errors.array()[0]?.msg ?? 'Invalid input');
    next();
}, async (req, res) => {
    res.status(201).json({ board: await createBoard(req.body) });
});
boardRouter.post('/columns', body('boardId').isString().notEmpty(), body('name').trim().isLength({ min: 1, max: 160 }), async (req, res) => {
    res.status(201).json({ column: await createColumn(req.body) });
});
boardRouter.put('/columns/:id', param('id').isUUID(), body('name').trim().isLength({ min: 1, max: 160 }), async (req, res) => {
    const id = req.params.id;
    res.json({ column: await updateColumn(id, req.body.name) });
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
