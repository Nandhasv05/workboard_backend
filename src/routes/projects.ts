import { Router } from 'express';
import { body, param, validationResult } from 'express-validator';
import { HttpError } from '../middleware/errors.js';
import { archiveProject, createProject, listProjects, updateProject } from '../services/projectService.js';

export const projectRouter = Router();
projectRouter.get('/', async (req, res) => res.json({ projects: await listProjects(req.query.workspaceId as string, (req as any).user.id) }));
projectRouter.post('/', body('workspaceId').isUUID(), body('name').trim().isLength({ min: 2, max: 160 }), body('code').trim().isLength({ min: 2, max: 40 }), (req, _res, next) => { const errors = validationResult(req); if (!errors.isEmpty()) throw new HttpError(400, errors.array()[0]?.msg ?? 'Invalid input'); next(); }, async (req, res) => res.status(201).json({ project: await createProject(req.body) }));
projectRouter.put('/:id', param('id').isUUID(), async (req, res) => { const id = (req.params as { id: string }).id; res.json({ project: await updateProject(id, (req as any).user.id, req.body) }); });
projectRouter.patch('/:id/archive', param('id').isUUID(), async (req, res) => { const id = (req.params as { id: string }).id; await archiveProject(id, (req as any).user.id); res.status(204).send(); });
