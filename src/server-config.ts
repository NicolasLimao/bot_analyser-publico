export function readServerConfig(env: NodeJS.ProcessEnv = process.env) {
  const production = env.NODE_ENV === 'production';
  const configuredOrigin =
    env.PUBLIC_ORIGIN ||
    (production ? 'https://bot-demo.example.com' : undefined);
  let publicOrigin: string | undefined;
  if (configuredOrigin) {
    let url: URL;
    try {
      url = new URL(configuredOrigin);
    } catch {
      throw new Error('PUBLIC_ORIGIN deve ser uma origem HTTPS válida.');
    }
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.pathname !== '/' ||
      url.search ||
      url.hash
    )
      throw new Error(
        'PUBLIC_ORIGIN deve ser uma origem HTTPS sem caminho, credenciais ou parâmetros.',
      );
    publicOrigin = url.origin;
  }
  const port = Number(env.PORT ?? (production ? 80 : 3001));
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535)
    throw new Error('PORT deve estar entre 1 e 65535.');
  return {
    host: env.HOST || (production ? '0.0.0.0' : '127.0.0.1'),
    port,
    publicOrigin,
  };
}
