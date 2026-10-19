import { request as httpsRequest } from 'node:https';
import { lookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';
import { isQuestion, object, text } from '../domain/catalog-schema.ts';
import type {
  BotPreview,
  Catalog,
  Department,
  User,
  Question,
} from '../domain/types.ts';
import { buildCatalogUrl } from './catalog.ts';

import { DigisacError } from './errors.ts';
import { instanceOrigin, InstanceResolver } from './instance.ts';
export { DigisacError } from './errors.ts';
export { instanceOrigin } from './instance.ts';

export const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const blocked = new BlockList();
const blockedV6 = new BlockList();
for (const [base, bits] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 3],
] as const)
  blocked.addSubnet(base, bits, 'ipv4');
for (const [base, bits] of [
  ['::', 96],
  ['::ffff:0:0', 96],
  ['64:ff9b::', 96],
  ['64:ff9b:1::', 48],
  ['100::', 64],
  ['2001::', 32],
  ['2001:db8::', 32],
  ['2002::', 16],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
] as const)
  blockedV6.addSubnet(base, bits, 'ipv6');
export function publicAddress(address: string): boolean {
  const family = isIP(address);
  return family === 4
    ? !blocked.check(address, 'ipv4')
    : family === 6 && !blockedV6.check(address, 'ipv6');
}
export interface UpstreamRequest {
  url: URL;
  method: 'GET' | 'POST' | 'PUT';
  headers: Record<string, string>;
  body?: string;
  timeoutMs?: number;
}
export interface UpstreamResponse {
  status: number;
  body: unknown;
  location?: string;
}
export type Transport = (input: UpstreamRequest) => Promise<UpstreamResponse>;

// Recognize explicit name conflicts only. Never expose upstream payloads, which
// can contain credentials or database details, and never infer this from HTTP alone.
function duplicateBotName(body: unknown): boolean {
  let remaining = 40;
  function visit(value: unknown, nameField = false, depth = 0): boolean {
    if (--remaining < 0 || depth > 5) return false;
    if (typeof value === 'string') {
      const message = value
        .slice(0, 2000)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
      return (
        /^(bot_name_already_exists|duplicate_bot_name|bot_name_taken)$/.test(
          message,
        ) ||
        /\b(?:bot|robot) with (?:this|the same|that) name already exists\b/.test(
          message,
        ) ||
        /\bname (?:has already been taken|already exists|must be unique|is already (?:taken|in use))\b/.test(
          message,
        ) ||
        /\bja existe (?:um )?robo com (?:esse|este|o mesmo) nome\b/.test(
          message,
        ) ||
        /\bnome ja (?:existe|esta em uso|foi utilizado)\b/.test(message) ||
        (nameField &&
          /^(?:unique violation|not_unique|unique|must be unique|has already been taken|already exists)$/.test(
            message,
          ))
      );
    }
    if (Array.isArray(value))
      return value.some((item) => visit(item, nameField, depth + 1));
    if (!object(value)) return false;
    const isName = nameField || value.path === 'name' || value.field === 'name';
    return [
      'code',
      'message',
      'error',
      'errors',
      'data',
      'name',
      'type',
      'validatorKey',
    ].some(
      (key) =>
        Object.hasOwn(value, key) &&
        visit(value[key], isName || key === 'name', depth + 1),
    );
  }
  return visit(body);
}

// Resolve once and pin the validated address to the TLS request. Never follow redirects.
export const requestJson: Transport = async (input) => {
  instanceOrigin(input.url.origin);
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    Math.min(input.timeoutMs ?? 12_000, 12_000),
  );
  timer.unref();
  try {
    const addresses = await Promise.race([
      lookup(input.url.hostname, { all: true, verbatim: true }),
      new Promise<never>((_, reject) =>
        controller.signal.addEventListener(
          'abort',
          () => reject(new Error('deadline')),
          { once: true },
        ),
      ),
    ]);
    if (!addresses.length || addresses.some((a) => !publicAddress(a.address)))
      throw new Error('private address');
    const pinned = addresses[0];
    return await new Promise<UpstreamResponse>((resolve, reject) => {
      const req = httpsRequest(
        input.url,
        {
          method: input.method,
          headers: { Accept: 'application/json', ...input.headers },
          signal: controller.signal,
          lookup: (_host, options, callback) => {
            if (options.all) callback(null, [pinned]);
            else callback(null, pinned.address, pinned.family);
          },
        },
        (res) => {
          const chunks: Buffer[] = [];
          let size = 0;
          res.on('error', reject);
          res.on('data', (chunk: Buffer) => {
            size += chunk.length;
            if (size > 2_097_152) {
              res.destroy(new Error('response limit'));
              return;
            }
            chunks.push(chunk);
          });
          res.on('end', () => {
            let body: unknown = null;
            try {
              body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
            } catch {
              /* Only decoded JSON leaves the transport. */
            }
            resolve({
              status: res.statusCode ?? 502,
              body,
              ...(res.headers.location
                ? { location: res.headers.location }
                : {}),
            });
          });
        },
      );
      req.on('error', reject);
      req.end(input.body);
    });
  } finally {
    clearTimeout(timer);
  }
};

export interface Credentials {
  origin: string;
  username: string;
  password: string;
}
// Match the Digisac login form: pasted zero-width characters and surrounding
// whitespace are removed from both fields; internal spaces remain unchanged.
export function normalizeLoginValue(value: string): string {
  return value.replace(/[\u200B-\u200D\uFEFF]/g, '').trim();
}
export interface Access {
  origin: string;
  token: string;
  expiresAt: number;
}
// Server-only shape observed in the account update supplied by the owner.
// Keep the settings object intact; it is never returned to the browser.
export interface AccountConfiguration {
  id: string;
  name: string;
  defaultDepartment: Record<string, unknown> | null;
  wizardProgress: string;
  settings: Record<string, unknown> & { ticketInactiveTime: number };
}
export class DigisacClient {
  private transport: Transport;
  private now: () => number;
  private instances: InstanceResolver;
  constructor(transport: Transport = requestJson, now = Date.now) {
    this.transport = transport;
    this.now = now;
    this.instances = new InstanceResolver(transport, now);
  }
  async resolveInstance(input: unknown) {
    return this.instances.resolve(input);
  }
  async accountConfiguration(
    access: Access,
    expectedAccount: string,
  ): Promise<AccountConfiguration> {
    let response: UpstreamResponse;
    try {
      response = await this.transport({
        url: new URL(
          '/api/v1/me/account?include%5B0%5D=defaultDepartment',
          access.origin,
        ),
        method: 'GET',
        headers: { Authorization: `Bearer ${access.token}` },
      });
    } catch {
      throw new DigisacError(
        502,
        'INACTIVITY_READ_FAILED',
        'Não foi possível consultar o prazo de inatividade. Tente novamente.',
      );
    }
    this.accountStatus(response.status);
    const account = response.body;
    if (
      !object(account) ||
      !text(account.id, 128) ||
      !uuidPattern.test(account.id)
    )
      throw new DigisacError(
        502,
        'INVALID_ACCOUNT_CONFIGURATION',
        'A resposta da conta não permite consultar o prazo com segurança.',
      );
    if (account.id !== expectedAccount)
      throw new DigisacError(
        409,
        'ACCOUNT_CHANGED',
        'A conta retornada mudou. Conecte novamente antes de alterar o prazo.',
      );
    if (
      !text(account.name, 300) ||
      !text(account.wizardProgress, 128) ||
      !(
        account.defaultDepartment === null ||
        (object(account.defaultDepartment) &&
          text(account.defaultDepartment.id, 128) &&
          uuidPattern.test(account.defaultDepartment.id) &&
          account.defaultDepartment.accountId === expectedAccount)
      ) ||
      !object(account.settings) ||
      !Number.isSafeInteger(account.settings.ticketInactiveTime) ||
      (account.settings.ticketInactiveTime as number) < 0
    )
      throw new DigisacError(
        502,
        'INVALID_ACCOUNT_CONFIGURATION',
        'A resposta da conta não permite consultar o prazo com segurança.',
      );
    return structuredClone({
      id: account.id,
      name: account.name,
      defaultDepartment: account.defaultDepartment,
      wizardProgress: account.wizardProgress,
      settings: account.settings,
    }) as AccountConfiguration;
  }
  private accountStatus(status: number): void {
    if (status === 401)
      throw new DigisacError(
        401,
        'SESSION_EXPIRED',
        'A conexão expirou. Conecte novamente à Digisac; seu roteiro foi preservado.',
      );
    if (status === 403)
      throw new DigisacError(
        403,
        'INACTIVITY_FORBIDDEN',
        'Este acesso não tem permissão para consultar ou alterar o prazo da empresa.',
      );
    if (status === 429)
      throw new DigisacError(
        429,
        'RATE_LIMIT',
        'A Digisac limitou as consultas. Aguarde antes de tentar novamente.',
      );
    if (status < 200 || status >= 300)
      throw new DigisacError(
        502,
        'INACTIVITY_READ_FAILED',
        'A Digisac não disponibilizou a configuração de inatividade. Tente novamente.',
      );
  }
  async updateAccountConfiguration(
    access: Access,
    account: AccountConfiguration,
  ): Promise<void> {
    let response: UpstreamResponse;
    try {
      response = await this.transport({
        url: new URL(
          '/api/v1/me/account?include%5B0%5D=defaultDepartment',
          access.origin,
        ),
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${access.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(account),
      });
    } catch {
      throw new DigisacError(
        502,
        'INACTIVITY_UPDATE_UNKNOWN',
        'Não foi possível confirmar a alteração. Consulte o prazo novamente antes de tentar outra mudança.',
      );
    }
    if (response.status === 408 || response.status >= 500)
      throw new DigisacError(
        502,
        'INACTIVITY_UPDATE_UNKNOWN',
        'Não foi possível confirmar a alteração. Consulte o prazo novamente antes de tentar outra mudança.',
      );
    if ([400, 409, 422].includes(response.status))
      throw new DigisacError(
        422,
        'INACTIVITY_UPDATE_REJECTED',
        'A Digisac recusou a alteração do prazo. Consulte novamente e confira o valor informado.',
      );
    this.accountStatus(response.status);
  }
  async login(credentials: Credentials): Promise<Access> {
    const username = normalizeLoginValue(credentials.username);
    const password = normalizeLoginValue(credentials.password);
    if (!text(username, 254) || !text(password, 1024))
      throw new DigisacError(
        400,
        'INVALID_CREDENTIALS',
        'Preencha usuário e senha.',
      );
    const origin = await this.instances.forLogin(credentials.origin);
    let response: UpstreamResponse;
    try {
      response = await this.transport({
        url: new URL('/api/v1/oauth/token', origin),
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'password',
          client_id: 'api',
          client_secret: 'secret',
          username,
          password,
          scope: '*',
        }).toString(),
      });
    } catch {
      throw new DigisacError(
        502,
        'CONNECTION_FAILED',
        'Não foi possível acessar a Digisac. Confira a URL e tente conectar novamente.',
      );
    }
    if (response.status === 429)
      throw new DigisacError(
        429,
        'RATE_LIMIT',
        'A Digisac limitou as tentativas. Aguarde um minuto antes de conectar novamente.',
      );
    const body = response.body;
    if (
      [400, 401, 403].includes(response.status) &&
      object(body) &&
      typeof body.error === 'string' &&
      [
        'invalid_client',
        'unauthorized_client',
        'unsupported_grant_type',
        'invalid_scope',
      ].includes(body.error)
    )
      throw new DigisacError(
        502,
        'LOGIN_CONFIGURATION',
        'A Digisac recusou a configuração de autenticação da integração. É necessário revisar o acesso pela API.',
      );
    if (response.status === 403)
      throw new DigisacError(
        403,
        'LOGIN_FORBIDDEN',
        'A Digisac bloqueou o login pela API (HTTP 403). Confira as permissões e as restrições de acesso desta conta.',
      );
    if ([400, 401].includes(response.status))
      throw new DigisacError(
        401,
        'LOGIN_REJECTED',
        `A Digisac recusou a autenticação (HTTP ${response.status}). Confirme a instância e o usuário. Se o login funciona na plataforma, é necessário verificar o motivo da recusa pela API.`,
      );
    if (
      response.status !== 200 ||
      !object(body) ||
      !text(body.access_token, 8192) ||
      /[\s\r\n]/.test(body.access_token) ||
      body.token_type !== 'Bearer' ||
      typeof body.expires_in !== 'number' ||
      !Number.isSafeInteger(body.expires_in) ||
      body.expires_in <= 0
    )
      throw new DigisacError(
        502,
        'INVALID_LOGIN_RESPONSE',
        'A resposta de login não corresponde ao formato esperado. A conexão não foi criada.',
      );
    return {
      origin,
      token: body.access_token,
      expiresAt: this.now() + Math.min(body.expires_in, 28_800) * 1000,
    };
  }
  async departments(
    access: Access,
    expectedAccount?: string,
  ): Promise<Catalog> {
    return this.readResource(
      access,
      'departments',
      this.now(),
      expectedAccount,
    );
  }
  async catalog(access: Access, expectedAccount?: string): Promise<Catalog> {
    const started = this.now();
    const catalog = await this.readResource(
      access,
      'departments',
      started,
      expectedAccount,
    );
    const users = await this.readResource(
      access,
      'users',
      started,
      catalog.accountId,
    );
    let questions: NonNullable<Catalog['questions']>;
    try {
      questions = (
        await this.readResource(access, 'questions', started, catalog.accountId)
      ).questions!;
    } catch (error) {
      if (
        error instanceof DigisacError &&
        (error.status === 401 || error.code === 'ACCOUNT_CHANGED')
      )
        throw error;
      // Failure of this optional resource must not block existing workflows.
      // An enabled evaluation still fails validation until a complete refresh.
      questions = { state: 'unavailable', items: [] };
    }
    return { ...catalog, users: users.users, questions };
  }
  private async readResource(
    access: Access,
    resource: 'departments' | 'users' | 'questions',
    started: number,
    expectedAccount?: string,
  ): Promise<Catalog> {
    const departments: Department[] = [];
    const users: User[] = [];
    const questions: Question[] = [];
    const resourceName =
      resource === 'users'
        ? 'usuários e seus vínculos'
        : resource === 'questions'
          ? 'avaliações'
          : 'departamentos';
    const seen = new Set<string>();
    let accountId = expectedAccount;
    let expectedTotal: number | undefined;
    let currentPage = 0;
    let responseStatus = 0;
    let responseBody: unknown;
    let currentRecord: unknown;
    const fieldType = (value: unknown) =>
      value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
    const shape = (value: unknown, fields: string[]) =>
      Object.fromEntries(
        fields.map((field) => [
          field,
          fieldType(object(value) ? value[field] : undefined),
        ]),
      );
    const invalid = (reason = 'paginação incompatível') => {
      const body = responseBody;
      const error = new DigisacError(
        502,
        'INVALID_CATALOG',
        `A consulta de ${resourceName} não pôde ser concluída: ${reason} (página ${currentPage}).`,
      );
      error.diagnostic = {
        resource,
        page: currentPage,
        status: responseStatus,
        reason,
        envelope: shape(responseBody, [
          'data',
          'total',
          'limit',
          'currentPage',
          'lastPage',
        ]),
        pagination: object(body)
          ? Object.fromEntries(
              ['total', 'limit', 'currentPage', 'lastPage'].map((field) => [
                field,
                typeof body[field] === 'number' &&
                Number.isSafeInteger(body[field])
                  ? body[field]
                  : null,
              ]),
            )
          : null,
        record: shape(currentRecord, [
          'id',
          'name',
          'accountId',
          'archivedAt',
          'departments',
          'departmentIds',
          'isActive',
          'active',
          ...(resource === 'questions'
            ? ['deletedAt', 'type', 'questionMessage']
            : []),
        ]),
      };
      return error;
    };
    for (let page = 1; page <= 100; page++) {
      currentPage = page;
      currentRecord = undefined;
      if (this.now() - started > 30_000) throw invalid('tempo limite excedido');
      const url = buildCatalogUrl(access.origin, resource, page);
      let response: UpstreamResponse;
      try {
        response = await this.transport({
          url,
          method: 'GET',
          headers: { Authorization: `Bearer ${access.token}` },
        });
      } catch {
        throw new DigisacError(
          502,
          'CATALOG_FAILED',
          `Não foi possível consultar ${resourceName}. O roteiro foi preservado; tente atualizar novamente.`,
        );
      }
      responseStatus = response.status;
      responseBody = response.body;
      if (this.now() - started > 30_000) throw invalid('tempo limite excedido');
      this.checkAuthorization(response.status);
      const b = response.body;
      if (
        response.status !== 200 ||
        !object(b) ||
        !Array.isArray(b.data) ||
        b.data.length > 40 ||
        !Number.isSafeInteger(b.total) ||
        (b.total as number) < 0 ||
        (b.total as number) > 4000 ||
        b.limit !== 40 ||
        b.currentPage !== page ||
        !Number.isSafeInteger(b.lastPage) ||
        (b.lastPage as number) < page ||
        (b.lastPage as number) !==
          Math.max(1, Math.ceil((b.total as number) / 40))
      )
        throw invalid();
      if (expectedTotal !== undefined && expectedTotal !== b.total)
        throw invalid('total de registros mudou durante a consulta');
      expectedTotal = b.total as number;
      for (const row of b.data) {
        currentRecord = row;
        if (!object(row)) throw invalid('registro em formato incompatível');
        if (typeof row.id !== 'string' || !uuidPattern.test(row.id))
          throw invalid('identificador do registro incompatível');
        if (!text(row.name, 300))
          throw invalid('nome do registro ausente ou incompatível');
        if (
          typeof row.accountId !== 'string' ||
          !uuidPattern.test(row.accountId)
        )
          throw invalid('conta do registro ausente ou incompatível');
        const archiveField =
          resource === 'questions' ? 'deletedAt' : 'archivedAt';
        if (
          !(
            row[archiveField] === null ||
            (typeof row[archiveField] === 'string' &&
              Number.isFinite(Date.parse(row[archiveField])))
          ) ||
          seen.has(row.id)
        )
          throw invalid(
            seen.has(row.id)
              ? 'registro repetido'
              : `campo ${archiveField} ausente ou incompatível`,
          );
        accountId ??= row.accountId;
        if (row.accountId !== accountId)
          throw new DigisacError(
            409,
            'ACCOUNT_CHANGED',
            'A resposta pertence a outra conta. Conecte novamente à instância correta.',
          );
        seen.add(row.id);
        const record = {
          id: row.id,
          name: row.name,
          active: row[archiveField] === null,
        };
        if (resource === 'users') {
          if (!Array.isArray(row.departments) || row.departments.length > 1000)
            throw invalid('vínculos departments ausentes ou incompatíveis');
          const memberships = new Set<string>();
          for (const department of row.departments) {
            if (
              !object(department) ||
              typeof department.id !== 'string' ||
              !uuidPattern.test(department.id)
            )
              throw invalid('vínculo de departamento em formato incompatível');
            if (
              department.accountId !== undefined &&
              department.accountId !== accountId
            )
              throw new DigisacError(
                409,
                'ACCOUNT_CHANGED',
                'Um vínculo de departamento pertence a outra conta. Conecte novamente à instância correta.',
              );
            // A relationship can reference a department absent from the listing.
            // Preserve that explicit ID without inventing a selectable department;
            // validateResources still requires an active catalog department to send.
            memberships.add(department.id);
          }
          users.push({ ...record, departmentIds: [...memberships] });
        } else if (resource === 'questions') {
          const question = {
            ...record,
            accountId: row.accountId,
            type: row.type,
            questionMessage: row.questionMessage,
            duration: row.duration,
            tries: row.tries,
            successMessage: row.successMessage,
            invalidMessage: row.invalidMessage,
            reasonMessage: row.reasonMessage,
          };
          if (!isQuestion(question))
            throw invalid('configuração da avaliação incompatível');
          questions.push(question);
        } else departments.push(record);
      }
      if (page === b.lastPage) {
        if (
          (resource === 'users'
            ? users.length
            : resource === 'questions'
              ? questions.length
              : departments.length) !== b.total
        )
          throw invalid('quantidade recebida diferente do total informado');
        if (!accountId)
          throw new DigisacError(
            422,
            'EMPTY_CATALOG',
            'O login foi aceito, mas não há departamentos para identificar a conta. Cadastre um departamento na Digisac e conecte novamente.',
          );
        return {
          accountId,
          source: 'digisac',
          fetchedAt: new Date(started).toISOString(),
          complete: true,
          departments,
          users,
          ...(resource === 'questions'
            ? { questions: { state: 'ready' as const, items: questions } }
            : {}),
        };
      }
      if (b.data.length !== 40)
        throw invalid('página intermediária incompleta');
    }
    throw invalid('limite de páginas excedido');
  }
  private checkAuthorization(status: number): void {
    if (status === 401)
      throw new DigisacError(
        401,
        'SESSION_EXPIRED',
        'A autorização da Digisac expirou. Conecte novamente; seu roteiro foi preservado.',
      );
    if (status === 403)
      throw new DigisacError(
        403,
        'FORBIDDEN',
        'Seu usuário não tem permissão para esta operação na Digisac.',
      );
    if (status === 429)
      throw new DigisacError(
        429,
        'RATE_LIMIT',
        'A Digisac limitou as requisições. Aguarde um minuto e tente novamente.',
      );
  }
  async createBot(
    access: Access,
    bot: BotPreview,
  ): Promise<{ status: 'sent' | 'unknown'; botId: string | null }> {
    let response: UpstreamResponse;
    try {
      response = await this.transport({
        url: new URL('/api/v1/bots', access.origin),
        method: 'POST',
        headers: {
          Authorization: `Bearer ${access.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(bot),
      });
    } catch {
      return { status: 'unknown', botId: null };
    }
    if (response.status >= 500) return { status: 'unknown', botId: null };
    this.checkAuthorization(response.status);
    if (
      [400, 409, 422].includes(response.status) &&
      duplicateBotName(response.body)
    )
      throw new DigisacError(
        409,
        'BOT_NAME_DUPLICATE',
        'Já existe um robô com esse nome na plataforma. Altere o nome do robô e tente enviar novamente. Seu roteiro foi preservado.',
      );
    if (response.status < 200 || response.status >= 300)
      throw new DigisacError(
        422,
        'BOT_REJECTED',
        `A Digisac recusou o robô (HTTP ${response.status}). Confira as regras e os departamentos antes de tentar enviar novamente.`,
      );
    const body =
      object(response.body) && object(response.body.data)
        ? response.body.data
        : response.body;
    const botId =
      object(body) && typeof body.id === 'string' && uuidPattern.test(body.id)
        ? body.id
        : null;
    return { status: 'sent', botId };
  }
}
