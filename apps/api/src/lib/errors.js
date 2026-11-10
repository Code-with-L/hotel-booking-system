// Error model: { error: { code, message, details? } } everywhere.
import { API_ERROR } from '@stillhouse/shared';

export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (message, details) => new ApiError(400, API_ERROR.VALIDATION, message, details);
export const unauthorized = (message = 'Authentication required') => new ApiError(401, API_ERROR.UNAUTHENTICATED, message);
export const forbidden = (message = 'Forbidden') => new ApiError(403, API_ERROR.FORBIDDEN, message);
export const notFound = (message = 'Not found') => new ApiError(404, API_ERROR.NOT_FOUND, message);
export const conflict = (message, details) => new ApiError(409, API_ERROR.CONFLICT, message, details);
export const roomUnavailable = () => new ApiError(409, API_ERROR.ROOM_UNAVAILABLE, 'The requested room is no longer available for these dates or party size.');
