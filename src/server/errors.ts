/**
 * Errors thrown by services. Messages are written for end users: plain language, and where
 * possible they say how to fix the problem.
 */
export class AppError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class UnauthenticatedError extends AppError {
  constructor(message = "Please sign in to continue.") {
    super(message, 401, "UNAUTHENTICATED");
  }
}

export class PasswordChangeRequiredError extends AppError {
  constructor() {
    super("Please set a new password before continuing.", 403, "PASSWORD_CHANGE_REQUIRED");
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "You don't have access to this. Ask an Admin if you need it.") {
    super(message, 403, "FORBIDDEN");
  }
}

export class NotFoundError extends AppError {
  constructor(message = "We couldn't find that record. It may have been archived.") {
    super(message, 404, "NOT_FOUND");
  }
}

export class ValidationError extends AppError {
  constructor(
    message: string,
    readonly fieldErrors: Record<string, string> = {},
  ) {
    super(message, 422, "VALIDATION");
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 409, "CONFLICT");
  }
}
