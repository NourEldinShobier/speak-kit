/** Whether an answer from the app says the pairing token is wrong: 401 or 403 from an older app, or 404 carrying the code token-rejected. A bare 404 is a missing endpoint. */
export function tokenRejected(status: number, body: unknown): boolean {
  if (status === 401 || status === 403) return true;
  if (status !== 404 || typeof body !== "object" || body === null) return false;
  const error = (body as { error?: unknown }).error;
  return typeof error === "object" && error !== null && (error as { code?: unknown }).code === "token-rejected";
}
