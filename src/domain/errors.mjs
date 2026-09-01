export class AsterismError extends Error {
  constructor(code, message, details = undefined) {
    super(message);
    this.name = "AsterismError";
    this.code = code;
    this.details = details;
  }
}

export function asPublicError(error) {
  if (error instanceof AsterismError) {
    return {
      code: error.code,
      message: error.message,
      ...(error.details === undefined ? {} : { details: error.details })
    };
  }

  return {
    code: "INTERNAL_ERROR",
    message: error instanceof Error ? error.message : "Unknown error"
  };
}
