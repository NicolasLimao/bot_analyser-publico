export class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
export async function api(path: string, options?: RequestInit) {
  const response = await fetch(path, {
    ...options,
    credentials: 'same-origin',
  });
  const data = await response.json();
  if (!response.ok && !(response.status === 422 && data.status === 'invalid'))
    throw new ApiError(
      response.status,
      data.code ?? 'REQUEST_FAILED',
      data.error ?? 'Não foi possível concluir a operação.',
    );
  return data;
}
