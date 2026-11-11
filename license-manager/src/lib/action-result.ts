export type ActionResult<T = { id: string }> =
  | { success: true; data: T }
  | { success: false; error: string; fields?: Record<string, string[]> };
