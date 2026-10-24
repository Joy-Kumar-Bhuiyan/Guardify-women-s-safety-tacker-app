import type { ErrorRequestHandler, NextFunction, Request, RequestHandler, Response } from 'express';
import { ZodError, type ZodType } from 'zod';

export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string
  ) {
    super(message);
  }
}

export function asyncRoute(
  handler: (request: Request, response: Response, next: NextFunction) => Promise<unknown>
): RequestHandler {
  return (request, response, next) => void handler(request, response, next).catch(next);
}

export function validate(schemas: { body?: ZodType; params?: ZodType; query?: ZodType }): RequestHandler {
  return (request, _response, next) => {
    try {
      request.validated = {
        ...(schemas.body ? { body: schemas.body.parse(request.body) } : {}),
        ...(schemas.params ? { params: schemas.params.parse(request.params) } : {}),
        ...(schemas.query ? { query: schemas.query.parse(request.query) } : {})
      };
      next();
    } catch (error) {
      next(error);
    }
  };
}

export const notFound: RequestHandler = (_request, _response, next) => {
  next(new AppError(404, 'NOT_FOUND', 'The requested resource was not found'));
};

export const errorHandler: ErrorRequestHandler = (error: unknown, request, response, _next) => {
  void _next;
  if (error instanceof ZodError) {
    response.status(400).json({
      error: { code: 'VALIDATION_FAILED', message: 'The request is invalid', requestId: request.id }
    });
    return;
  }
  if (error instanceof AppError) {
    response
      .status(error.status)
      .json({ error: { code: error.code, message: error.message, requestId: request.id } });
    return;
  }
  const httpStatus =
    typeof error === 'object' && error && 'status' in error ? Number(error.status) : undefined;
  if (httpStatus === 413) {
    response.status(413).json({
      error: { code: 'BODY_TOO_LARGE', message: 'The request body is too large', requestId: request.id }
    });
    return;
  }
  if (httpStatus === 400 && error instanceof SyntaxError) {
    response.status(400).json({
      error: { code: 'MALFORMED_JSON', message: 'The request body is not valid JSON', requestId: request.id }
    });
    return;
  }
  const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : '';
  if (code === 'ALREADY_EXISTS') {
    response.status(409).json({
      error: {
        code: 'CONFLICT',
        message: 'The request conflicts with existing data',
        requestId: request.id
      }
    });
    return;
  }
  request.log.error({ err: error }, 'request failed');
  response.status(500).json({
    error: { code: 'INTERNAL_ERROR', message: 'The request could not be completed', requestId: request.id }
  });
};
