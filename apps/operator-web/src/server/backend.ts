import "server-only";

import { getServerEnv, ServerEnvError } from "./env";

type ErrorBody = {
  error: {
    status: number;
    message: string;
    detail?: unknown;
  };
};

const FORWARD_RESPONSE_HEADERS = new Set([
  "content-type",
  "content-length",
  "content-disposition",
  "cache-control",
]);

export type ProxyOptions = {
  forwardQuery?: boolean;
};

export async function proxyBackend(
  request: Request,
  backendPath: string,
  options?: ProxyOptions,
): Promise<Response> {
  let env;
  try {
    env = getServerEnv();
  } catch (error) {
    const message = error instanceof ServerEnvError ? error.message : "configuracao server-only invalida";
    return jsonError(500, "Configuracao server-only invalida para chamar o backend.", message);
  }

  const backendUrl = new URL(backendPath, `${env.backendApiUrl}/`);
  if (options?.forwardQuery !== false) {
    const requestUrl = new URL(request.url);
    requestUrl.searchParams.forEach((value, key) => {
      backendUrl.searchParams.append(key, value);
    });
  }

  const headers = new Headers();
  headers.set("accept", "application/json, application/octet-stream, */*");
  headers.set("x-operator-api-key", env.operatorApiKey);
  const incomingContentType = request.headers.get("content-type");
  if (incomingContentType) {
    headers.set("content-type", incomingContentType);
  }

  const method = request.method.toUpperCase();
  const hasBody = method !== "GET" && method !== "HEAD";
  let bodyBuffer: ArrayBuffer | undefined;
  if (hasBody) {
    try {
      bodyBuffer = await request.arrayBuffer();
    } catch {
      return jsonError(400, "Nao foi possivel ler o corpo da requisicao operacional.");
    }
  }

  let backendResponse: Response;
  try {
    backendResponse = await fetch(backendUrl, {
      method,
      headers,
      body: bodyBuffer && bodyBuffer.byteLength > 0 ? bodyBuffer : undefined,
      cache: "no-store",
    });
  } catch {
    return jsonError(502, "Nao foi possivel conectar ao backend FastAPI.");
  }

  if (!backendResponse.ok) {
    const detail = await readBackendError(backendResponse);
    return jsonError(backendResponse.status, backendErrorMessage(backendResponse.status), detail);
  }

  const responseHeaders = new Headers();
  backendResponse.headers.forEach((value, key) => {
    if (FORWARD_RESPONSE_HEADERS.has(key.toLowerCase())) {
      responseHeaders.set(key, value);
    }
  });

  const payload = await backendResponse.arrayBuffer();
  return new Response(payload, {
    status: backendResponse.status,
    headers: responseHeaders,
  });
}

function jsonError(status: number, message: string, detail?: unknown): Response {
  const body: ErrorBody = { error: { status, message } };
  if (detail !== undefined) {
    body.error.detail = detail;
  }
  return Response.json(body, { status });
}

async function readBackendError(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    try {
      return await response.json();
    } catch {
      return null;
    }
  }
  const text = await response.text();
  return text ? text.slice(0, 1000) : null;
}

function backendErrorMessage(status: number): string {
  if (status === 400) {
    return "Backend recusou a requisicao por dados invalidos.";
  }
  if (status === 401) {
    return "Backend recusou a chave operacional configurada no servidor.";
  }
  if (status === 404) {
    return "Backend nao encontrou o recurso solicitado.";
  }
  if (status === 409) {
    return "Backend recusou a operacao por conflito de estado.";
  }
  if (status === 413) {
    return "Backend recusou upload acima do limite configurado.";
  }
  if (status === 415) {
    return "Backend recusou o tipo de midia enviado.";
  }
  if (status === 422) {
    return "Backend recusou a requisicao por validacao.";
  }
  if (status >= 500) {
    return "Backend retornou erro interno.";
  }
  return "Backend retornou erro para a requisicao operacional.";
}
