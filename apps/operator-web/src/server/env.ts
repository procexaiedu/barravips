import "server-only";

export type ServerEnv = {
  backendApiUrl: string;
  operatorApiKey: string;
};

export class ServerEnvError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ServerEnvError";
  }
}

export function getServerEnv(): ServerEnv {
  const errors: string[] = [];
  const backendApiUrl = process.env.BACKEND_API_URL;
  const operatorApiKey = process.env.OPERATOR_API_KEY;

  if (process.env.NEXT_PUBLIC_BACKEND_API_URL) {
    errors.push("NEXT_PUBLIC_BACKEND_API_URL nao pode ser usado");
  }
  if (process.env.NEXT_PUBLIC_OPERATOR_API_KEY) {
    errors.push("NEXT_PUBLIC_OPERATOR_API_KEY nao pode ser usado");
  }
  if (!backendApiUrl) {
    errors.push("BACKEND_API_URL ausente");
  }
  if (!operatorApiKey) {
    errors.push("OPERATOR_API_KEY ausente");
  }

  if (backendApiUrl) {
    try {
      const parsed = new URL(backendApiUrl);
      if (!["http:", "https:"].includes(parsed.protocol)) {
        errors.push("BACKEND_API_URL deve usar http ou https");
      }
    } catch {
      errors.push("BACKEND_API_URL invalida");
    }
  }

  if (errors.length > 0) {
    throw new ServerEnvError(errors.join("; "));
  }

  return {
    backendApiUrl: backendApiUrl!.replace(/\/+$/, ""),
    operatorApiKey: operatorApiKey!,
  };
}
