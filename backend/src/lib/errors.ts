export class ApiError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public code?: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function sendError(reply: any, statusCode: number, message: string) {
  reply.status(statusCode).send({ error: message });
}