import "server-only";

/** Runtime-only switch: the same image supports the public preview and full site. */
export function isPreviewMode(): boolean {
  return process.env.WEBSITE_MODE === "preview";
}

export class PreviewReadOnlyError extends Error {
  constructor() {
    super("This public preview is read-only.");
    this.name = "PreviewReadOnlyError";
  }
}

/** Keep this at service boundaries as well as routes: UI visibility is not a guard. */
export function assertFullWebsite(): void {
  if (isPreviewMode()) throw new PreviewReadOnlyError();
}
