import "server-only";

export function getRequiredServerEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required server environment variable: ${name}`);
  }
  return value;
}

export function getOptionalServerEnv(name: string): string | undefined {
  return process.env[name];
}
