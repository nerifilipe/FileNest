export async function request<T>(endpoint: string, body: unknown): Promise<T> {
  const response = await fetch(`/api/${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-FileNest-Client": "local-preview",
    },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(
      typeof data.detail === "string"
        ? data.detail
        : "Invalid request. Check the details and try again.",
    );
  return data;
}
