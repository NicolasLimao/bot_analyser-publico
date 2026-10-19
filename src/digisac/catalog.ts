import {
  isDepartment,
  isUser,
  object,
  text,
} from '../domain/catalog-schema.ts';
import type { Catalog, Department, User } from '../domain/types.ts';

export type Resource = 'users' | 'departments';
export interface DecodedPage {
  records: unknown[];
  hasMore: boolean;
}
export interface CatalogOptions {
  accountId: string;
  baseUrl: string;
  source: Catalog['source'];
  request: (url: URL) => Promise<unknown>;
  decode: (resource: Resource, value: unknown) => DecodedPage;
  now?: () => number;
  maxPages?: number;
}

// Only constructs URLs. The server-provided transport owns authentication,
// approved-host validation, deadlines and response size limits before network I/O.
export function buildCatalogUrl(
  base: string,
  resource: Resource | 'questions',
  page: number,
): URL {
  const url = new URL(base);
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !['', '/', '/api', '/api/', '/api/v1', '/api/v1/'].includes(url.pathname) ||
    !['users', 'departments', 'questions'].includes(resource) ||
    !Number.isSafeInteger(page) ||
    page < 1
  ) {
    throw new Error('Configuração de consulta inválida.');
  }
  url.pathname = `/api/v1/${resource}`;
  url.searchParams.set('perPage', '40');
  url.searchParams.set('page', String(page));
  if (resource === 'users')
    url.searchParams.set(
      'query',
      JSON.stringify({
        include: [{ model: 'departments', attributes: ['id', 'name'] }],
      }),
    );
  return url;
}

export async function loadCatalog(options: CatalogOptions): Promise<Catalog> {
  const maxPages = options.maxPages ?? 100;
  if (
    !text(options.accountId, 128) ||
    !['simulated', 'digisac'].includes(options.source) ||
    !Number.isSafeInteger(maxPages) ||
    maxPages < 1 ||
    maxPages > 100
  )
    throw new Error('Configuração do catálogo inválida.');
  const collected: Record<Resource, unknown[]> = { departments: [], users: [] };
  const now = options.now ?? Date.now;
  // Timestamp the beginning: a slow multi-page fetch must not appear newer than it is.
  const fetchedAt = new Date(now()).toISOString();
  for (const resource of ['departments', 'users'] as const) {
    const seen = new Set<string>();
    for (let page = 1; page <= maxPages; page++) {
      const url = buildCatalogUrl(options.baseUrl, resource, page);
      let decoded: DecodedPage;
      try {
        decoded = options.decode(resource, await options.request(url));
      } catch {
        throw new Error('Não foi possível concluir a consulta do catálogo.');
      }
      if (
        !object(decoded) ||
        !Array.isArray(decoded.records) ||
        decoded.records.length > 1000 ||
        typeof decoded.hasMore !== 'boolean' ||
        (decoded.hasMore && decoded.records.length === 0)
      ) {
        throw new Error('Página de catálogo inválida ou incompleta.');
      }
      for (const record of decoded.records) {
        const valid =
          resource === 'departments' ? isDepartment(record) : isUser(record);
        if (!valid)
          throw new Error('Registro de catálogo fora do contrato normalizado.');
        const entity = record as Department | User;
        if (seen.has(entity.id))
          throw new Error('Identificador repetido durante a paginação.');
        seen.add(entity.id);
        if (seen.size > 10_000)
          throw new Error('Catálogo excede o limite deste incremento.');
        collected[resource].push(structuredClone(entity));
      }
      if (!decoded.hasMore) break;
      if (page === maxPages)
        throw new Error(
          'A consulta excedeu o limite de páginas e está incompleta.',
        );
    }
  }
  return {
    accountId: options.accountId,
    source: options.source,
    fetchedAt,
    complete: true,
    departments: collected.departments as Department[],
    users: collected.users as User[],
  };
}
