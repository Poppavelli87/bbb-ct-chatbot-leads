export type ApiError = {
  error: string;
};

const isJsonResponse = (contentType: string | null): boolean =>
  Boolean(contentType?.includes("application/json"));

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const headers = new Headers(options.headers);

  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(path, {
    ...options,
    headers,
    credentials: "include"
  });

  const contentType = response.headers.get("content-type");
  const payload = isJsonResponse(contentType)
    ? ((await response.json()) as Record<string, unknown>)
    : {};

  if (!response.ok) {
    const message =
      typeof payload.error === "string"
        ? payload.error
        : `Request failed with ${response.status}`;
    throw new Error(message);
  }

  return payload as T;
}
