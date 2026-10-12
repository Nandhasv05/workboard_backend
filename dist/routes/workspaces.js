import { Router } from 'express';
import { body, param, validationResult } from 'express-validator';
import { authenticate, authorize } from '../middleware/auth.js';
import { HttpError } from '../middleware/errors.js';
import { addWorkspaceMember, createWorkspace, deleteWorkspace, listWorkspaces, updateWorkspace } from '../services/workspaceService.js';
export const workspaceRouter = Router();
workspaceRouter.get('/', async (req, res) => res.json({ workspaces: await listWorkspaces(req.user.id) }));
workspaceRouter.post('/', body('name').trim().isLength({ min: 2, max: 160 }), (req, _res, next) => { const errors = validationResult(req); if (!errors.isEmpty())
    throw new HttpError(400, errors.array()[0]?.msg ?? 'Invalid input'); next(); }, async (req, res) => res.status(201).json({ workspace: await createWorkspace(req.user.id, req.body) }));
workspaceRouter.put('/:id', param('id').isUUID(), async (req, res) => { const id = req.params.id; res.json({ workspace: await updateWorkspace(id, req.user.id, req.body) }); });
workspaceRouter.delete('/:id', param('id').isUUID(), async (req, res) => { const id = req.params.id; await deleteWorkspace(id, req.user.id); res.status(204).send(); });
workspaceRouter.post('/:id/members', authenticate, authorize('owner', 'admin'), async (req, res) => { const id = req.params.id; await addWorkspaceMember(id, String(req.body.userId), String(req.body.role)); res.status(201).json({ ok: true }); });
