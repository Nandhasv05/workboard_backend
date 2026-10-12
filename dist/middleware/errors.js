import { isProduction } from '../config/env.js';
export class HttpError extends Error {
    status;
    details;
    constructor(status, message, details) {
        super(message);
        this.status = status;
        this.details = details;
    }
}
export const notFound = (req, res) => {
    res.status(404).json({ error: `Route ${req.method} ${req.path} was not found` });
};
export const errorHandler = (error, _req, res, _next) => {
    if (error instanceof HttpError) {
        res.status(error.status).json({ error: error.message, details: error.details });
        return;
    }
    const message = isProduction ? 'Unexpected server error' : error instanceof Error ? error.message : 'Unexpected server error';
    console.error(error);
    res.status(500).json({ error: message });
};
