import { Router } from 'express';
import { dashboardSummary, workload } from '../services/reportService.js';

export const reportRouter = Router();
reportRouter.get('/dashboard', async (req, res) => res.json({ summary: await dashboardSummary(req.query.workspaceId as string) }));
reportRouter.get('/workload', async (req, res) => res.json({ workload: await workload(req.query.workspaceId as string) }));
