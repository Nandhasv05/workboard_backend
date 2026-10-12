import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import { loginController, meController, registerController, portalLoginController, portalUsersController } from '../controllers/authController.js';
import { authenticate } from '../middleware/auth.js';

export const authRouter = Router();

authRouter.post('/portal-session', portalLoginController);
authRouter.get('/portal-session', portalLoginController);
authRouter.get('/users', authenticate, portalUsersController);
authRouter.post('/register', body('name').trim().isLength({ min: 2, max: 120 }), body('email').isEmail().normalizeEmail(), body('password').isLength({ min: 10 }).matches(/^(?=.*[A-Z])(?=.*[a-z])(?=.*\d)/), (req, _res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) throw new Error(errors.array()[0]?.msg ?? 'Invalid input');
  next();
}, registerController);
authRouter.post('/login', body('email').isEmail().normalizeEmail(), body('password').notEmpty(), loginController);
authRouter.get('/me', authenticate, meController);
