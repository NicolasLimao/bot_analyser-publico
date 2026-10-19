import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { compilePreview } from '../domain/compiler.ts';
import { keys, object, text } from '../domain/catalog-schema.ts';
import type { Catalog, Draft } from '../domain/types.ts';
import {
  DigisacClient,
  DigisacError,
  normalizeLoginValue,
  uuidPattern,
} from './client.ts';
import type { Access, AccountConfiguration } from './client.ts';

export interface InactivityTime {
  ticketInactiveTime: number;
  revision: string;
}
function accountFingerprint(account: AccountConfiguration): string {
  function ordered(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(ordered);
    if (object(value))
      return Object.fromEntries(
        Object.keys(value)
          .sort()
          .map((key) => [key, ordered(value[key])]),
      );
    return value;
  }
  return createHash('sha256')
    .update(JSON.stringify(ordered(account)))
    .digest('hex');
}

interface Receipt {
  fingerprint: string;
  promise: Promise<Publication>;
}
export interface Publication {
  status: 'sent' | 'unknown';
  botId: string | null;
  name: string;
  origin: string;
}
interface Session extends Access {
  id: string;
  connectionId: string;
  username: string;
  accountId: string;
  catalog: Catalog;
  receipts: Map<string, Receipt>;
  inactivityReading?: { fingerprint: string; revision: string; readAt: number };
}
export interface ConnectionSummary {
  connectionId: string;
  origin: string;
  username: string;
  accountId: string;
  expiresAt: string;
}
export class Connections {
  private sessions = new Map<string, Session>();
  private attempts: number[] = [];
  private instanceAttempts: number[] = [];
  private accountUpdates = new Set<string>();
  private client: DigisacClient;
  private now: () => number;
  constructor(client = new DigisacClient(), now = Date.now) {
    this.client = client;
    this.now = now;
  }
  private cookieId(cookie = ''): string {
    return (
      cookie
        .split(';')
        .map((part) => part.trim())
        .find((part) => part.startsWith('ba_session='))
        ?.slice(11) ?? ''
    );
  }
  session(cookie?: string): Session | null {
    const session = this.sessions.get(this.cookieId(cookie));
    if (!session) return null;
    if (session.expiresAt <= this.now()) {
      this.sessions.delete(session.id);
      return null;
    }
    return session;
  }
  require(cookie?: string, connectionId?: unknown): Session {
    const session = this.session(cookie);
    if (!session)
      throw new DigisacError(
        401,
        'SESSION_EXPIRED',
        'Conecte à Digisac para continuar. Seu roteiro permanece salvo neste navegador.',
      );
    if (connectionId !== undefined && connectionId !== session.connectionId)
      throw new DigisacError(
        409,
        'CONNECTION_CHANGED',
        'A conexão mudou em outra aba. Conecte novamente à conta desejada antes de enviar.',
      );
    return session;
  }
  summary(session: Session): ConnectionSummary {
    return {
      connectionId: session.connectionId,
      origin: session.origin,
      username: session.username,
      accountId: session.accountId,
      expiresAt: new Date(session.expiresAt).toISOString(),
    };
  }
  async resolveInstance(input: unknown) {
    if (!object(input) || !keys(input, ['origin']) || !text(input.origin, 300))
      throw new DigisacError(
        400,
        'INVALID_INSTANCE',
        'Informe o nome ou a URL da sua instância Digisac.',
      );
    this.instanceAttempts = this.instanceAttempts.filter(
      (time) => this.now() - time < 60_000,
    );
    if (this.instanceAttempts.length >= 10)
      throw new DigisacError(
        429,
        'RATE_LIMIT',
        'Aguarde um minuto antes de verificar outros endereços.',
      );
    this.instanceAttempts.push(this.now());
    return this.client.resolveInstance(input.origin);
  }
  async login(
    input: unknown,
    cookie?: string,
  ): Promise<{
    cookie: string;
    connection: ConnectionSummary;
    catalog: Catalog;
  }> {
    if (
      !object(input) ||
      !keys(input, ['origin', 'username', 'password']) ||
      !text(input.origin, 300) ||
      !text(input.username, 254) ||
      !text(input.password, 1024)
    )
      throw new DigisacError(
        400,
        'INVALID_LOGIN',
        'Preencha URL da instância, usuário e senha.',
      );
    this.attempts = this.attempts.filter((time) => this.now() - time < 60_000);
    if (this.attempts.length >= 5)
      throw new DigisacError(
        429,
        'RATE_LIMIT',
        'Aguarde um minuto antes de tentar conectar novamente.',
      );
    this.attempts.push(this.now());
    for (const [id, session] of this.sessions)
      if (session.expiresAt <= this.now()) this.sessions.delete(id);
    if (this.sessions.size >= 100)
      throw new DigisacError(
        503,
        'SESSION_LIMIT',
        'Limite de conexões locais atingido. Desconecte uma sessão antes de tentar novamente.',
      );
    const access = await this.client.login({
      origin: input.origin,
      username: input.username,
      password: input.password,
    });
    const catalog = await this.client.catalog(access);
    if (access.expiresAt <= this.now())
      throw new DigisacError(
        401,
        'SESSION_EXPIRED',
        'A autorização expirou durante a consulta. Conecte novamente.',
      );
    const session: Session = {
      ...access,
      id: randomBytes(32).toString('hex'),
      connectionId: randomUUID(),
      username: normalizeLoginValue(input.username),
      accountId: catalog.accountId,
      catalog,
      receipts: new Map(),
    };
    this.logout(cookie);
    this.sessions.set(session.id, session);
    return {
      cookie: `ba_session=${session.id}; Path=/api; HttpOnly; SameSite=Strict; Max-Age=${Math.floor((session.expiresAt - this.now()) / 1000)}`,
      connection: this.summary(session),
      catalog,
    };
  }
  logout(cookie?: string): void {
    this.sessions.delete(this.cookieId(cookie));
  }
  async catalog(session: Session): Promise<Catalog> {
    try {
      const catalog = await this.client.catalog(session, session.accountId);
      this.require(`ba_session=${session.id}`, session.connectionId);
      session.catalog = catalog;
      return catalog;
    } catch (e) {
      if (e instanceof DigisacError && e.status === 401)
        this.sessions.delete(session.id);
      throw e;
    }
  }
  private async readAccount(session: Session): Promise<AccountConfiguration> {
    try {
      const account = await this.client.accountConfiguration(
        session,
        session.accountId,
      );
      this.require(`ba_session=${session.id}`, session.connectionId);
      return account;
    } catch (error) {
      if (error instanceof DigisacError && error.status === 401)
        this.sessions.delete(session.id);
      throw error;
    }
  }
  private inactivityView(
    session: Session,
    account: AccountConfiguration,
  ): InactivityTime {
    const revision = randomUUID();
    session.inactivityReading = {
      fingerprint: accountFingerprint(account),
      revision,
      readAt: this.now(),
    };
    return {
      ticketInactiveTime: account.settings.ticketInactiveTime,
      revision,
    };
  }
  async inactivityTime(
    cookie: string | undefined,
    connectionId: unknown,
  ): Promise<InactivityTime> {
    if (typeof connectionId !== 'string')
      throw new DigisacError(
        400,
        'INVALID_CONNECTION',
        'Atualize a conexão antes de consultar o prazo.',
      );
    const session = this.require(cookie, connectionId);
    if (this.accountUpdates.has(`${session.origin}/${session.accountId}`))
      throw new DigisacError(
        409,
        'INACTIVITY_UPDATE_BUSY',
        'Uma alteração desta empresa está em andamento. Aguarde e consulte o prazo novamente.',
      );
    delete session.inactivityReading;
    return this.inactivityView(session, await this.readAccount(session));
  }
  async updateInactivityTime(
    cookie: string | undefined,
    input: unknown,
  ): Promise<InactivityTime> {
    if (
      !object(input) ||
      !keys(input, ['connectionId', 'ticketInactiveTime', 'revision']) ||
      typeof input.connectionId !== 'string' ||
      typeof input.revision !== 'string' ||
      !uuidPattern.test(input.revision) ||
      !Number.isSafeInteger(input.ticketInactiveTime) ||
      (input.ticketInactiveTime as number) <= 0
    )
      throw new DigisacError(
        400,
        'INVALID_INACTIVITY_TIME',
        'Informe um prazo em minutos inteiros, maior que zero.',
      );
    const session = this.require(cookie, input.connectionId);
    const reading = session.inactivityReading;
    if (
      !reading ||
      reading.revision !== input.revision ||
      this.now() - reading.readAt > 300_000
    )
      throw new DigisacError(
        409,
        'INACTIVITY_RELOAD_REQUIRED',
        'Consulte o prazo novamente antes de alterar.',
      );
    const accountKey = `${session.origin}/${session.accountId}`;
    if (this.accountUpdates.has(accountKey))
      throw new DigisacError(
        409,
        'INACTIVITY_UPDATE_BUSY',
        'Uma alteração desta empresa está em andamento. Aguarde e consulte o prazo novamente.',
      );
    this.accountUpdates.add(accountKey);
    delete session.inactivityReading;
    try {
      const account = await this.readAccount(session);
      if (accountFingerprint(account) !== reading.fingerprint)
        throw new DigisacError(
          409,
          'INACTIVITY_CHANGED',
          'A configuração da empresa mudou desde sua consulta. Consulte novamente antes de alterar.',
        );
      const next: AccountConfiguration = {
        ...account,
        settings: {
          ...account.settings,
          ticketInactiveTime: input.ticketInactiveTime as number,
        },
      };
      if (
        next.settings.ticketInactiveTime === account.settings.ticketInactiveTime
      )
        return this.inactivityView(session, account);
      try {
        await this.client.updateAccountConfiguration(session, next);
      } catch (error) {
        if (error instanceof DigisacError && error.status === 401)
          this.sessions.delete(session.id);
        throw error;
      }
      // A successful PUT alone is not enough: read back and compare the settings.
      try {
        const verified = await this.readAccount(session);
        if (accountFingerprint(verified) !== accountFingerprint(next))
          throw new Error('unconfirmed');
        return this.inactivityView(session, verified);
      } catch {
        throw new DigisacError(
          502,
          'INACTIVITY_UPDATE_UNKNOWN',
          'Não foi possível confirmar a alteração e a preservação das configurações. Consulte o prazo novamente antes de tentar outra mudança.',
        );
      }
    } finally {
      this.accountUpdates.delete(accountKey);
    }
  }
  initialDraft(session: Session): Draft {
    return {
      schemaVersion: 1,
      id: `robo-${randomUUID()}`,
      name: 'Novo robô',
      accountId: session.accountId,
      entryNodeId: 'welcome',
      behavior: { firstMessageOnly: false, stopOnAttendantMessage: true },
      nodes: [
        {
          id: 'welcome',
          kind: 'message',
          text: 'Olá! Como podemos ajudar?',
          next: 'stop',
        },
        { id: 'stop', kind: 'stop' },
      ],
    };
  }
  async publish(
    cookie: string | undefined,
    input: unknown,
  ): Promise<Publication> {
    if (
      !object(input) ||
      !keys(input, ['draft', 'connectionId', 'requestId']) ||
      typeof input.requestId !== 'string' ||
      !uuidPattern.test(input.requestId) ||
      typeof input.connectionId !== 'string'
    )
      throw new DigisacError(
        400,
        'INVALID_SEND',
        'Aguarde a preparação dos arquivos antes de enviar o robô.',
      );
    const session = this.require(cookie, input.connectionId);
    // Compile once against the session catalog to normalize the fingerprint; then revalidate live before sending.
    const initial = compilePreview(
      input.draft,
      { ...session.catalog, fetchedAt: new Date(this.now()).toISOString() },
      this.now(),
    );
    if (initial.status !== 'preview')
      throw new DigisacError(
        422,
        'INVALID_DRAFT',
        'O roteiro possui pendências ou pertence a outra conta. Confira a revisão e a conta selecionada.',
      );
    const fingerprint = createHash('sha256')
      .update(JSON.stringify(initial.bot))
      .digest('hex');
    const existing = session.receipts.get(input.requestId);
    if (existing) {
      if (existing.fingerprint !== fingerprint)
        throw new DigisacError(
          409,
          'REQUEST_CHANGED',
          'Este envio já está associado a outro conteúdo. Aguarde a preparação dos arquivos atualizados.',
        );
      return existing.promise;
    }
    const sameContent = [...session.receipts.values()].find(
      (r) => r.fingerprint === fingerprint,
    );
    if (sameContent) return sameContent.promise;
    if (session.receipts.size >= 50)
      throw new DigisacError(
        429,
        'SEND_LIMIT',
        'Limite de envios desta sessão atingido. Confira os robôs criados e conecte novamente.',
      );
    const requestId = input.requestId;
    const promise = (async () => {
      const catalog = await this.catalog(session);
      const compiled = compilePreview(input.draft, catalog, this.now());
      if (compiled.status !== 'preview')
        throw new DigisacError(
          422,
          'CATALOG_CHANGED',
          'Um departamento, atendente, vínculo ou avaliação mudou, ou o roteiro tem pendências. Atualize o catálogo e confira a revisão.',
        );
      this.require(cookie, input.connectionId);
      const result = await this.client.createBot(session, compiled.bot);
      return { ...result, name: compiled.bot.name, origin: session.origin };
    })();
    session.receipts.set(requestId, { fingerprint, promise });
    // A definite pre-send/rejection error permits a later corrected attempt. Unknown outcomes remain cached.
    void promise.catch((error: unknown) => {
      session.receipts.delete(requestId);
      if (error instanceof DigisacError && error.status === 401)
        this.sessions.delete(session.id);
    });
    return promise;
  }
}
