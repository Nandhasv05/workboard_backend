import { Router } from 'express';
import { meController, portalLoginController, portalUsersController } from '../controllers/authController.js';
import { authenticate } from '../middleware/auth.js';
export const authRouter = Router();
authRouter.post('/portal-session', portalLoginController);
authRouter.get('/portal-session', portalLoginController);
authRouter.get('/users', authenticate, portalUsersController);
authRouter.get('/me', authenticate, meController);
