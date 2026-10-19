import { DigisacError } from './errors.ts';
import type { Transport } from './client.ts';

export const instanceSuffixes = [
  'digisac.me',
  'digisac.app',
  'digisac.co',
  'digisac.chat',
  'digisac.io',
] as const;
const tenantLabel = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
function invalidInstance(): DigisacError {
  return new DigisacError(
    400,
    'INVALID_INSTANCE',
    'Informe o nome da instância (ex.: empresa-exemplo) ou sua URL HTTPS da Digisac.',
  );
}
export function instanceOrigin(input: unknown): string {
  if (typeof input !== 'string' || input.length > 300) throw invalidInstance();
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw invalidInstance();
  }
  const separator = url.hostname.indexOf('.');
  const label = url.hostname.slice(0, separator);
  const suffix = url.hostname.slice(separator + 1);
  if (
    url.protocol !== 'https:' ||
    url.port ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !['/', '/api', '/api/', '/api/v1', '/api/v1/'].includes(url.pathname) ||
    separator < 1 ||
    !tenantLabel.test(label) ||
    ![...instanceSuffixes, 'digisac.com.br'].some(
      (allowed) => suffix === allowed,
    )
  )
    throw invalidInstance();
  return url.origin;
}
export function instanceCandidates(input: unknown): string[] {
  if (typeof input !== 'string' || input.length > 300) throw invalidInstance();
  const value = input.replace(/[\u200B-\u200D\uFEFF]/g, '').trim();
  if (tenantLabel.test(value.toLowerCase()))
    return instanceSuffixes.map(
      (suffix) => `https://${value.toLowerCase()}.${suffix}`,
    );
  return [instanceOrigin(value.includes('://') ? value : `https://${value}`)];
}
export interface InstanceResolution {
  origins: string[];
}

export class InstanceResolver {
  private transport: Transport;
  private now: () => number;
  private available = new Map<string, number>();
  constructor(transport: Transport, now = Date.now) {
    this.transport = transport;
    this.now = now;
  }
  private async probe(
    origin: string,
    deadline: number,
  ): Promise<'found' | 'missing' | 'unavailable'> {
    let url = new URL(origin);
    try {
      for (let redirects = 0; redirects <= 2; redirects++) {
        const remaining = deadline - Date.now();
        if (remaining <= 0) return 'unavailable';
        const response = await this.transport({
          url,
          method: 'GET',
          headers: { Accept: 'text/html' },
          timeoutMs: remaining,
        });
        if (response.status >= 200 && response.status < 300) return 'found';
        if ([404, 410].includes(response.status)) return 'missing';
        if (
          ![301, 302, 303, 307, 308].includes(response.status) ||
          redirects === 2 ||
          !response.location ||
          response.location.length > 2048
        )
          return 'unavailable';
        const next = new URL(response.location, url);
        if (next.origin !== origin || next.username || next.password)
          return 'unavailable';
        url = next;
      }
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        ['ENOTFOUND', 'ENODATA'].includes(String(error.code))
      )
        return 'missing';
    }
    return 'unavailable';
  }
  async resolve(input: unknown): Promise<InstanceResolution> {
    const candidates = instanceCandidates(input);
    const deadline = Date.now() + 6000;
    for (const origin of candidates) this.available.delete(origin);
    const results = await Promise.all(
      candidates.map((origin) => this.probe(origin, deadline)),
    );
    const origins = candidates.filter((_, index) => results[index] === 'found');
    for (const [origin, expiresAt] of this.available)
      if (expiresAt <= this.now()) this.available.delete(origin);
    for (const origin of origins)
      this.available.set(origin, this.now() + 60_000);
    while (this.available.size > 128)
      this.available.delete(this.available.keys().next().value!);
    if (!origins.length) {
      if (results.includes('unavailable'))
        throw new DigisacError(
          503,
          'INSTANCE_UNAVAILABLE',
          'Não foi possível verificar a página da instância. Confira o endereço e tente novamente.',
        );
      throw new DigisacError(
        404,
        'INSTANCE_NOT_FOUND',
        candidates.length === 1
          ? 'Não encontramos uma página neste endereço. Confira a URL da sua instância.'
          : 'Não encontramos esta instância nos cinco domínios. Confira o nome ou informe a URL completa.',
      );
    }
    return { origins };
  }
  async forLogin(input: unknown): Promise<string> {
    const candidates = instanceCandidates(input);
    if (
      candidates.length === 1 &&
      (this.available.get(candidates[0]) ?? 0) > this.now()
    )
      return candidates[0];
    const { origins } = await this.resolve(input);
    if (origins.length !== 1)
      throw new DigisacError(
        409,
        'INSTANCE_AMBIGUOUS',
        'Encontramos mais de uma instância. Escolha o endereço ou informe a URL completa antes de conectar.',
      );
    return origins[0];
  }
}
