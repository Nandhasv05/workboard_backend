import { Router } from 'express';
import { listProjects } from '../services/projectService.js';
export const projectRouter = Router();
projectRouter.get('/', async (req, res) => res.json({ projects: await listProjects(req.query.workspaceId, req.user.id) }));
