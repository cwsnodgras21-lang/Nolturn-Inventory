export type ErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "MEMBERSHIP_REQUIRED"
  | "PERMISSION_DENIED"
  | "LOCATION_DENIED"
  | "VALIDATION"
  | "NOT_FOUND"
  | "CONFLICT"
  | "INTERNAL";

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;

  constructor(code: ErrorCode, message: string, status = 400) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = status;
  }
}

export function toSafeErrorMessage(error: unknown): string {
  if (error instanceof AppError) {
    return error.message;
  }
  return "Something went wrong. Please try again.";
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}
