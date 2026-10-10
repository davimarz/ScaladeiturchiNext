export async function readServiceJson<T>(response: Response, unavailable: string): Promise<T> {
  if (!response.headers.get("content-type")?.includes("application/json")) throw new Error(unavailable);
  try { return await response.json() as T; }
  catch { throw new Error(unavailable); }
}
