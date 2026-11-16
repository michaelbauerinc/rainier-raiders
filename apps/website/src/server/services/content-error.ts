export type ContentErrorCode =
  | "DATABASE_UNAVAILABLE"
  | "NOT_FOUND"
  | "CONFLICT"
  | "VALIDATION"
  | "CAPACITY"
  | "CLOSED";

export class ContentError extends Error {
  constructor(public readonly code: ContentErrorCode, message: string) {
    super(message);
    this.name = "ContentError";
  }
}
