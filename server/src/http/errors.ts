import type { ErrorRequestHandler, Request, Response } from 'express';
import { QueryError } from '../databases/sql.js';

/** An error that knows its HTTP status. Throw it from a service or route; errorHandler formats it. */
export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export const badRequest = (msg: string) => new HttpError(400, msg);
export const notFound = (msg: string) => new HttpError(404, msg);

export const statusOf = (err: unknown) =>
  err instanceof HttpError ? err.status : err instanceof QueryError ? 400 : 500;

// Express 5 forwards rejected promises from async handlers here, so routes can just `throw`.
// Response shape stays { success: false, error } because the client's unwrap() depends on it.
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  const status = statusOf(err);
  if (status >= 500) console.error(err);
  if (res.headersSent) return void res.end();
  res.status(status).json({ success: false, error: err?.message || String(err) });
};

/** Unknown /api route: same JSON shape as every other error instead of Express's HTML page. */
export const notFoundHandler = (_req: Request, res: Response) =>
  res.status(404).json({ success: false, error: 'Not found' });
