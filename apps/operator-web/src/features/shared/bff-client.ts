import type { BffErrorBody } from "@/contracts";

export type BffFetchResult<T> = {
  data: T | null;
  error: BffFetchError | null;
};

export type BffFetchError = {
  status: number;
  message: string;
  detail?: unknown;
};

export async function bffFetch<T>(input: string, init?: RequestInit): Promise<BffFetchResult<T>> {
  let response: Response;
  try {
    response = await fetch(input, { cache: "no-store", ...init });
  } catch {
    return {
      data: null,
      error: {
        status: 0,
        message: "Sem conexão com o servidor. Verifique sua internet e tente de novo.",
      },
    };
  }

  const isJson = (response.headers.get("content-type") ?? "").includes("application/json");
  const body = isJson ? await response.json().catch(() => null) : null;

  if (!response.ok) {
    const errorBody = body as BffErrorBody | null;
    const message =
      errorBody?.error?.message ??
      getNestedString(body, ["detail"]) ??
      `Erro ${response.status} ao consultar o servidor.`;
    return {
      data: null,
      error: {
        status: response.status,
        message,
        detail: errorBody?.error?.detail ?? body,
      },
    };
  }

  return { data: body as T, error: null };
}

export async function bffSend<T>(
  input: string,
  body: unknown,
  method: "POST" | "PATCH" = "POST",
): Promise<BffFetchResult<T>> {
  return bffFetch<T>(input, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export async function bffUpload<T>(input: string, form: FormData): Promise<BffFetchResult<T>> {
  return bffFetch<T>(input, { method: "POST", body: form });
}

function getNestedString(value: unknown, path: string[]): string | null {
  let current = value;
  for (const part of path) {
    if (!current || typeof current !== "object" || !(part in current)) {
      return null;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return typeof current === "string" ? current : null;
}
