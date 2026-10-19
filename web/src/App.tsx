import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type {
  Catalog,
  CompileResult,
  Diagnostic,
  Draft,
  Step,
} from '../../src/domain/types.ts';
import { validateDraft } from '../../src/domain/validate.ts';
import { entryOutcome } from '../../src/domain/entry.ts';
import { ReturnToEntry } from './ReturnToEntry.tsx';
import { BehaviorSettings } from './BehaviorSettings.tsx';
import { BehaviorWizard } from './BehaviorWizard.tsx';
import { behaviorRules } from './behavior-model.ts';
import type { BehaviorRule } from './behavior-model.ts';
import { menuText } from '../../src/domain/presentation.ts';
import { api, ApiError } from './api.ts';
import { ConnectionPanel } from './ConnectionPanel.tsx';
import { FlowEditor } from './FlowEditor.tsx';
import { GuidedBuilder } from './GuidedBuilder.tsx';
import { RobotActions } from './RobotActions.tsx';
import { ThemeToggle } from './ThemeToggle.tsx';
import type {
  ConnectionSummary,
  Publication,
} from '../../src/digisac/connections.ts';

type IconName =
  | 'flow'
  | 'people'
  | 'menu'
  | 'message'
  | 'transfer'
  | 'stop'
  | 'plus'
  | 'check'
  | 'arrow'
  | 'refresh'
  | 'trash'
  | 'download';
const paths: Record<IconName, ReactNode> = {
  flow: (
    <>
      <rect x="3" y="3" width="7" height="6" rx="1" />
      <rect x="14" y="15" width="7" height="6" rx="1" />
      <path d="M6.5 9v9H14M10 6h7.5v9" />
    </>
  ),
  people: (
    <>
      <circle cx="9" cy="8" r="3" />
      <path d="M3 21v-3a6 6 0 0 1 12 0v3M16 5a3 3 0 0 1 0 6M18 15a5 5 0 0 1 3 5" />
    </>
  ),
  menu: (
    <>
      <path d="M9 5h12M9 12h12M9 19h12" />
      <circle cx="4" cy="5" r="1" />
      <circle cx="4" cy="12" r="1" />
      <circle cx="4" cy="19" r="1" />
    </>
  ),
  message: (
    <path d="M4 3h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H9l-6 4V4a1 1 0 0 1 1-1Z" />
  ),
  transfer: (
    <>
      <path d="M3 7h15M14 3l4 4-4 4M21 17H6M10 13l-4 4 4 4" />
    </>
  ),
  stop: <rect x="5" y="5" width="14" height="14" rx="2" />,
  plus: <path d="M12 5v14M5 12h14" />,
  check: <path d="m5 12 4 4L19 6" />,
  arrow: <path d="M4 12h16m-6-6 6 6-6 6" />,
  refresh: (
    <>
      <path d="M20 8a8 8 0 1 0 0 8M20 3v5h-5" />
    </>
  ),
  trash: (
    <>
      <path d="M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7" />
    </>
  ),
  download: <path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5" />,
};
function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}
const kindName: Record<Step['kind'], string> = {
  menu: 'Menu de opções',
  message: 'Enviar mensagem',
  transfer: 'Transferir atendimento',
  stop: 'Parar o robô',
};
function stepName(node: Step, index: number): string {
  return `${index + 1}. ${kindName[node.kind]}`;
}
function shortText(node: Step, catalog: Catalog): string {
  if (node.kind === 'menu') return node.message;
  if (node.kind === 'message') return node.text;
  if (node.kind === 'transfer')
    return (
      catalog.departments.find((d) => d.id === node.departmentId)?.name ??
      'Selecione o departamento'
    );
  return 'A equipe continua o atendimento';
}
export function App() {
  const [entry, setEntry] = useState<'choose' | 'editor'>(() => {
    try {
      return sessionStorage.getItem('bot-analyser:workspace-open') === 'true'
        ? 'editor'
        : 'choose';
    } catch {
      return 'choose';
    }
  });
  const [offline, setOffline] = useState(() => {
    try {
      return sessionStorage.getItem('bot-analyser:offline') === 'true';
    } catch {
      return false;
    }
  });
  const [hasWork, setHasWork] = useState(false);
  useEffect(() => {
    try {
      sessionStorage.setItem(
        'bot-analyser:workspace-open',
        String(entry === 'editor'),
      );
      sessionStorage.setItem('bot-analyser:offline', String(offline));
    } catch {
      /* Navigation remains available in this page. */
    }
  }, [entry, offline]);
  const [initializing, setInitializing] = useState(true);
  const [hasSavedDraft, setHasSavedDraft] = useState(false);
  const entryTitle = useRef<HTMLHeadingElement>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [refreshingCatalog, setRefreshingCatalog] = useState(false);
  const catalogRefreshSequence = useRef(0);
  const [selectedId, setSelectedId] = useState('');
  const [tab, setTab] = useState<'creator' | 'catalog'>('creator');
  const [navigationOpen, setNavigationOpen] = useState(false);
  const navigationToggle = useRef<HTMLButtonElement>(null);
  function closeNavigation() {
    setNavigationOpen(false);
    if (window.matchMedia('(max-width: 720px)').matches)
      navigationToggle.current?.focus();
  }
  const [loadError, setLoadError] = useState('');
  const [notice, setNotice] = useState('');
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<CompileResult | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [preparationError, setPreparationError] = useState('');
  const [preparationAttempt, setPreparationAttempt] = useState(0);
  const [actionTab, setActionTab] = useState<'draft' | 'export'>('export');
  const [completed, setCompleted] = useState(false);
  const [editing, setEditing] = useState(true);
  const [sendError, setSendError] = useState('');
  const [removed, setRemoved] = useState<{ node: Step; index: number } | null>(
    null,
  );
  const [newKind, setNewKind] = useState<Step['kind']>('message');
  const [advanced, setAdvanced] = useState(() => {
    try {
      return localStorage.getItem('bot-analyser:editor-mode') === 'advanced';
    } catch {
      return false;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(
        'bot-analyser:editor-mode',
        advanced ? 'advanced' : 'paths',
      );
    } catch {
      /* Editing remains available when storage is unavailable. */
    }
  }, [advanced]);
  const [previewFrom, setPreviewFrom] = useState('');
  const [mobileChat, setMobileChat] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [profileId, setProfileId] = useState(() => {
    try {
      const stored = localStorage.getItem('bot-analyser:profile');
      return stored === 'qa' || stored === 'live' ? stored : 'demo';
    } catch {
      return 'demo';
    }
  });
  const [profiles, setProfiles] = useState<{ id: string; label: string }[]>([]);
  const [creating, setCreating] = useState(false);
  const [configuringBehavior, setConfiguringBehavior] = useState<{
    rule?: BehaviorRule;
  } | null>(null);
  const [connection, setConnection] = useState<ConnectionSummary | null>(null);
  useEffect(() => {
    if (profileId === 'live' && !connection) setNavigationOpen(true);
  }, [profileId, connection]);
  const [publication, setPublication] = useState<Publication | null>(null);
  const [sending, setSending] = useState(false);
  const requestId = useRef(crypto.randomUUID());
  const editorRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    let active = true;
    setLoadError('');
    api(`/api/bootstrap?profile=${profileId}`)
      .then((data) => {
        if (!active) return;
        let loaded: Draft = data.draft;
        setProfiles(data.profiles);
        setConnection(data.connection ?? null);
        if (data.connection && !offline && profileId !== 'live') {
          setProfileId('live');
          return;
        }
        setHasSavedDraft(false);
        try {
          const stored = localStorage.getItem(
            `bot-analyser:draft:${data.catalog.accountId}`,
          );
          if (stored) {
            const candidate: unknown = JSON.parse(stored);
            const diagnostics = validateDraft(candidate, data.catalog);
            if (
              !diagnostics.some((d) =>
                ['INVALID_SCHEMA', 'ACCOUNT_MISMATCH'].includes(d.code),
              )
            ) {
              loaded = candidate as Draft;
              setSaved(true);
              setHasSavedDraft(true);
              setNotice('Seu rascunho local foi restaurado.');
            } else
              setNotice(
                'O rascunho anterior usa outro formato. Carregamos a demonstração.',
              );
          }
        } catch {
          setNotice(
            'O armazenamento local não está disponível. Você ainda pode editar nesta sessão.',
          );
        }
        loaded = {
          ...loaded,
          behavior: loaded.behavior ?? {
            firstMessageOnly: false,
            stopOnAttendantMessage: true,
          },
        };
        setDraft(loaded);
        setPreviewFrom('');
        setCatalog(data.catalog);
        setSelectedId(loaded.entryNodeId);
        setInitializing(false);
      })
      .catch((e) => {
        if (active) {
          setLoadError(e.message);
          if (e instanceof ApiError && e.status === 401) setConnection(null);
          setInitializing(false);
        }
      });
    return () => {
      active = false;
    };
  }, [attempt, profileId, offline]);

  useEffect(() => {
    entryTitle.current?.focus();
  }, [connection, initializing, entry, offline, catalog]);

  useEffect(() => {
    catalogRefreshSequence.current++;
    setRefreshingCatalog(false);
  }, [profileId, connection?.connectionId]);

  useEffect(() => {
    let active = true;
    setResult(null);
    setPreparationError('');
    if (
      !draft ||
      !catalog ||
      creating ||
      entry !== 'editor' ||
      (profileId === 'live' && !connection)
    ) {
      setPreparing(false);
      return;
    }
    const localIssues = validateDraft(draft, catalog);
    if (
      localIssues.some((issue) =>
        [
          'EVALUATION_REQUIRED',
          'EVALUATION_UNAVAILABLE',
          'EVALUATIONS_UNAVAILABLE',
        ].includes(issue.code),
      )
    ) {
      setResult({
        status: 'invalid',
        importReady: false,
        diagnostics: localIssues,
        warnings: [],
      });
      setPreparing(false);
      return;
    }
    setPreparing(true);
    // The preview endpoint refreshes the catalog before validating and compiling.
    const timer = setTimeout(async () => {
      try {
        const preview: CompileResult = await api(
          `/api/preview?profile=${profileId}`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(profileId === 'live' && connection
                ? { 'X-Connection-Id': connection.connectionId }
                : {}),
            },
            body: JSON.stringify(draft),
          },
        );
        if (!active) return;
        setResult(preview);
        requestId.current = crypto.randomUUID();
      } catch (error) {
        if (!active) return;
        setPreparationError(
          error instanceof Error
            ? error.message
            : 'Não foi possível preparar os arquivos.',
        );
        if (
          error instanceof ApiError &&
          ['SESSION_EXPIRED', 'CONNECTION_CHANGED'].includes(error.code)
        ) {
          setNotice(error.message);
          setConnection(null);
        }
      } finally {
        if (active) setPreparing(false);
      }
    }, 400);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [
    draft,
    catalog,
    profileId,
    connection,
    creating,
    preparationAttempt,
    entry,
  ]);

  function preserveDraft() {
    if (draft && catalog)
      localStorage.setItem(
        `bot-analyser:draft:${catalog.accountId}`,
        JSON.stringify(draft),
      );
  }
  function connected(next: ConnectionSummary) {
    setHasWork(false);
    setOffline(false);
    setEntry('choose');
    setConnection(next);
    try {
      localStorage.setItem('bot-analyser:profile', 'live');
    } catch {
      /* The live session still works without storage. */
    }
    setCompleted(false);
    setEditing(true);
    setResult(null);
    setPublication(null);
    setRemoved(null);
    setCreating(false);
    setDraft(null);
    setCatalog(null);
    setProfileId('live');
    setAttempt((value) => value + 1);
  }
  function disconnected() {
    setOffline(false);
    setEntry('choose');
    setConnection(null);
    setResult(null);
    setNotice(
      'Conexão encerrada. O roteiro foi guardado; você pode reconectar ou escolher outro catálogo.',
    );
  }
  const connectionPanel = (
    <ConnectionPanel
      connection={connection}
      disabled={busy}
      reconnect={profileId === 'live' && !connection}
      beforeChange={preserveDraft}
      onConnected={connected}
      onDisconnected={disconnected}
    />
  );

  const entryHeader = (
    <header className="entry-header">
      <div className="entry-brand">
        <Icon name="flow" size={24} />
        <span>bot_analyser</span>
      </div>
      <ThemeToggle />
    </header>
  );
  if (!initializing && !connection && !offline)
    return (
      <div className="entry-shell">
        {entryHeader}
        <main className="entry-main login-main">
          <div className="entry-heading">
            <h1 ref={entryTitle} tabIndex={-1}>
              Conecte sua Digisac.
            </h1>
            <p>
              Entre na sua conta para criar um robô com os departamentos e a
              equipe que você já usa.
            </p>
          </div>
          {notice && profileId === 'live' && (
            <p className="entry-notice" role="status">
              {notice}
            </p>
          )}
          <ConnectionPanel
            connection={null}
            disabled={busy}
            reconnect
            standalone
            beforeChange={preserveDraft}
            onConnected={connected}
            onDisconnected={disconnected}
          />
          <button
            className="text-button demo-entry"
            onClick={() => {
              try {
                preserveDraft();
              } catch {
                setNotice(
                  'Não foi possível guardar o roteiro. Reconecte para continuar sem perder suas alterações.',
                );
                return;
              }
              setOffline(true);
              setProfileId('demo');
              setLoadError('');
              setEntry('choose');
            }}
          >
            Experimentar com dados de demonstração
          </button>
        </main>
        <footer className="entry-footer">
          Seu atendimento começa com uma boa conversa.
        </footer>
      </div>
    );

  if (initializing || !draft || !catalog)
    return (
      <main className="loading-page">
        <div className="brand loading-brand">
          <Icon name="flow" size={30} />
          bot_analyser
        </div>
        {loadError ? (
          <>
            <h1>Não foi possível abrir o criador</h1>
            <p>{loadError}</p>
            {profileId === 'live' && connectionPanel}
            <button
              className="primary"
              onClick={() => setAttempt((a) => a + 1)}
            >
              Tentar novamente
            </button>
            {profileId === 'live' && (
              <button
                className="secondary"
                onClick={() => {
                  try {
                    localStorage.setItem('bot-analyser:profile', 'demo');
                  } catch {
                    /* Local selection only. */
                  }
                  setProfileId('demo');
                }}
              >
                Abrir demonstração
              </button>
            )}
          </>
        ) : (
          <>
            <h1>Preparando seu espaço de criação</h1>
            <p>Carregando o roteiro e os recursos locais.</p>
            <div className="skeleton" />
            <div className="skeleton short" />
          </>
        )}
      </main>
    );

  const activeDraft = draft;
  const activeCatalog = catalog;
  const qaSnapshot = catalog.source === 'snapshot';
  const liveCatalog = catalog.source === 'digisac';
  const liveHeaders: Record<string, string> =
    connection && profileId === 'live'
      ? { 'X-Connection-Id': connection.connectionId }
      : {};
  function reportError(error: unknown) {
    setNotice(
      error instanceof Error
        ? error.message
        : 'Não foi possível concluir a operação.',
    );
    if (
      error instanceof ApiError &&
      ['SESSION_EXPIRED', 'CONNECTION_CHANGED'].includes(error.code)
    ) {
      setConnection(null);
      setResult(null);
    }
  }
  async function refreshCatalog() {
    const sequence = ++catalogRefreshSequence.current;
    setRefreshingCatalog(true);
    try {
      const data = await api(`/api/catalog?profile=${profileId}`, {
        headers: liveHeaders,
      });
      if (sequence !== catalogRefreshSequence.current) return;
      setCatalog(data.catalog);
      setNotice(
        liveCatalog
          ? 'Departamentos, equipe e avaliações consultados na Digisac.'
          : qaSnapshot
            ? 'Cópia local recarregada. Não houve consulta à Digisac.'
            : 'Catálogo de demonstração atualizado.',
      );
    } catch (error) {
      if (sequence === catalogRefreshSequence.current) {
        setCatalog((current) =>
          current
            ? { ...current, questions: { state: 'unavailable', items: [] } }
            : current,
        );
        reportError(error);
      }
    } finally {
      if (sequence === catalogRefreshSequence.current)
        setRefreshingCatalog(false);
    }
  }
  const diagnostics = validateDraft(draft, catalog);
  const selectedIndex = draft.nodes.findIndex((n) => n.id === selectedId);
  const selected = draft.nodes[selectedIndex];
  function update(next: Draft) {
    setDraft(next);
    setSaved(false);
    setResult(null);
    setSendError('');
    setPublication((current) =>
      current?.status === 'unknown' ? current : null,
    );
    setNotice('');
  }
  function updateNode(node: Step) {
    update({
      ...activeDraft,
      nodes: activeDraft.nodes.map((n) => (n.id === node.id ? node : n)),
    });
  }
  function save() {
    try {
      localStorage.setItem(
        `bot-analyser:draft:${activeCatalog.accountId}`,
        JSON.stringify(activeDraft),
      );
      setSaved(true);
      setNotice('Rascunho salvo neste navegador.');
    } catch {
      setNotice(
        'Não foi possível salvar no navegador. Mantenha esta página aberta.',
      );
    }
  }
  async function publish() {
    if (
      !connection ||
      profileId !== 'live' ||
      result?.status !== 'preview' ||
      busy ||
      publication
    )
      return;
    const destination = connection.origin;
    const name = activeDraft.name;
    setBusy(true);
    setSending(true);
    setSendError('');
    setNotice('');
    try {
      const receipt: Publication = await api('/api/bots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          draft: activeDraft,
          connectionId: connection.connectionId,
          requestId: requestId.current,
        }),
      });
      setPublication(receipt);
    } catch (e) {
      if (e instanceof ApiError) {
        setSendError(e.message);
        reportError(e);
      } else
        setPublication({
          status: 'unknown',
          botId: null,
          name,
          origin: destination,
        });
    } finally {
      setBusy(false);
      setSending(false);
    }
  }
  function download(botOnly = false) {
    if (result?.status !== 'preview') return;
    if (botOnly && result.catalogSource === 'simulated') return;
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(botOnly ? result.bot : result, null, 2)], {
        type: 'application/json',
      }),
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeDraft.id}.${botOnly ? 'bot.experimental' : 'preview'}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function addNode() {
    const id = `step-${crypto.randomUUID()}`;
    const next = activeDraft.nodes.find((n) => n.kind === 'stop')?.id ?? '';
    const node: Step =
      newKind === 'menu'
        ? {
            id,
            kind: 'menu',
            message: 'Como podemos ajudar?',
            options: [
              { id: 'option-1', value: '1', label: 'Continuar', target: next },
            ],
          }
        : newKind === 'message'
          ? { id, kind: 'message', text: 'Escreva sua mensagem.', next }
          : newKind === 'transfer'
            ? { id, kind: 'transfer', departmentId: '', userId: null, next }
            : { id, kind: 'stop' };
    update({ ...activeDraft, nodes: [...activeDraft.nodes, node] });
    setSelectedId(id);
    setRemoved(null);
    setNotice(
      'Etapa adicionada. Conecte-a usando o destino de uma opção ou a próxima etapa.',
    );
  }
  const displayedDiagnostics =
    result?.status === 'invalid' ? result.diagnostics : diagnostics;
  function startGuided() {
    try {
      preserveDraft();
      setCreating(true);
    } catch {
      setNotice(
        'Não foi possível guardar o roteiro atual. Mantenha esta página aberta; o novo robô não foi criado.',
      );
    }
  }
  function startManual() {
    try {
      preserveDraft();
      setHasWork(true);
      const id = crypto.randomUUID();
      update({
        schemaVersion: 1,
        id: `bot-${id}`,
        name: 'Novo atendimento',
        accountId: activeCatalog.accountId,
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
      });
      setSelectedId('welcome');
      setAdvanced(false);
      setCompleted(false);
      setEditing(true);
      setPublication(null);
      setRemoved(null);
      setPreviewFrom('');
      setTab('creator');
      setEntry('editor');
      requestAnimationFrame(() => document.getElementById('bot-name')?.focus());
    } catch {
      setNotice(
        'Não foi possível guardar o roteiro atual. Mantenha esta página aberta e tente novamente.',
      );
    }
  }
  if (configuringBehavior)
    return (
      <BehaviorWizard
        connectionId={
          profileId === 'live' ? connection?.connectionId : undefined
        }
        draft={draft}
        catalog={catalog}
        initialRule={configuringBehavior.rule}
        onRefreshCatalog={refreshCatalog}
        refreshingCatalog={refreshingCatalog}
        onChange={update}
        onClose={() => {
          setConfiguringBehavior(null);
          requestAnimationFrame(() =>
            document.getElementById('configure-behavior')?.focus(),
          );
        }}
      />
    );
  if (creating)
    return (
      <GuidedBuilder
        connectionId={
          profileId === 'live' ? connection?.connectionId : undefined
        }
        current={draft}
        catalog={catalog}
        onRefreshCatalog={refreshCatalog}
        refreshingCatalog={refreshingCatalog}
        onCancel={() => {
          setCreating(false);
          requestAnimationFrame(() =>
            document
              .getElementById(entry === 'choose' ? 'choose-model' : 'new-bot')
              ?.focus(),
          );
        }}
        onCreate={(next) => {
          setHasWork(true);
          setEntry('editor');
          preserveDraft();
          update(next);
          setSelectedId(next.entryNodeId);
          setPreviewFrom('');
          setRemoved(null);
          setPublication(null);
          setAdvanced(false);
          setMobileChat(false);
          setCreating(false);
          setCompleted(true);
          setEditing(false);
          setActionTab('export');
          setNotice(
            'Novo robô criado a partir do modelo. O rascunho anterior continua disponível até você salvar este.',
          );
          requestAnimationFrame(() =>
            document.getElementById('robot-actions-title')?.focus(),
          );
        }}
        renderConversation={(next) => (
          <Conversation
            key={JSON.stringify(next)}
            draft={next}
            catalog={catalog}
            compact
          />
        )}
      />
    );
  if (entry === 'choose')
    return (
      <div className="entry-shell">
        {entryHeader}
        <main className="entry-main choice-main">
          <div className="entry-heading">
            <h1 ref={entryTitle} tabIndex={-1}>
              Como você quer começar?
            </h1>
            <p>Escolha o ponto de partida do seu atendimento.</p>
          </div>
          <div className="creation-choices">
            <button
              id="choose-model"
              className="creation-choice"
              onClick={startGuided}
            >
              <span>
                <strong>Criar a partir de um modelo</strong>
                <span>
                  Personalize um roteiro pronto, com orientação em cada etapa.
                </span>
              </span>
              <Icon name="arrow" size={22} />
            </button>
            <button className="creation-choice" onClick={startManual}>
              <span>
                <strong>Montar manualmente</strong>
                <span>
                  Comece do zero e crie as mensagens, opções e caminhos do seu
                  jeito.
                </span>
              </span>
              <Icon name="arrow" size={22} />
            </button>
          </div>
          {(hasSavedDraft || hasWork) && (
            <button
              className="text-button resume-draft"
              onClick={() => {
                setEntry('editor');
                setTab('creator');
              }}
            >
              {hasWork ? 'Voltar ao roteiro atual' : 'Continuar rascunho salvo'}
            </button>
          )}
          {notice && !notice.includes('restaurado') && (
            <p className="entry-notice" role="status">
              {notice}
            </p>
          )}
          <div className="entry-account">
            {connection ? (
              <>
                <p>
                  Conectado a{' '}
                  <strong>{new URL(connection.origin).hostname}</strong>
                </p>
                <details>
                  <summary>Gerenciar conexão</summary>
                  {connectionPanel}
                </details>
              </>
            ) : (
              <>
                <p>Você está usando dados de demonstração.</p>
                <button
                  className="text-button"
                  onClick={() => setOffline(false)}
                >
                  Conectar minha Digisac
                </button>
              </>
            )}
          </div>
        </main>
      </div>
    );
  return (
    <div className="app-shell">
      <a className="skip-link" href="#editor" onClick={() => setEditing(true)}>
        Pular para o editor
      </a>
      <aside
        className="sidebar"
        onKeyDown={(event) => {
          if (event.key === 'Escape' && navigationOpen) {
            event.preventDefault();
            closeNavigation();
          }
        }}
      >
        <div className="sidebar-heading">
          <div className="brand">
            <span className="brand-symbol">
              <Icon name="flow" size={24} />
            </span>
            <span>bot_analyser</span>
          </div>
          <button
            ref={navigationToggle}
            className="navigation-toggle"
            aria-label={navigationOpen ? 'Fechar menu' : 'Abrir menu'}
            aria-expanded={navigationOpen}
            aria-controls="sidebar-content"
            onClick={() => setNavigationOpen((open) => !open)}
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.65"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path
                d={
                  navigationOpen
                    ? 'M6 6l12 12M6 18L18 6'
                    : 'M3 5h18M3 12h18M3 19h18'
                }
              />
            </svg>
          </button>
        </div>
        <div
          id="sidebar-content"
          className={`sidebar-content${navigationOpen ? ' is-open' : ''}`}
        >
          <div className="workspace-name">Espaço de criação</div>
          <nav aria-label="Navegação principal">
            <button
              className="nav-item"
              onClick={() => {
                setEntry('choose');
                closeNavigation();
              }}
            >
              <Icon name="plus" />
              Início
            </button>
            <button
              className={tab === 'creator' ? 'nav-item current' : 'nav-item'}
              onClick={() => {
                setTab('creator');
                closeNavigation();
              }}
              aria-current={tab === 'creator' ? 'page' : undefined}
            >
              <Icon name="flow" />
              Criador de robôs
            </button>
            <button
              className={tab === 'catalog' ? 'nav-item current' : 'nav-item'}
              onClick={() => {
                setTab('catalog');
                closeNavigation();
              }}
              aria-current={tab === 'catalog' ? 'page' : undefined}
            >
              <Icon name="people" />
              Departamentos e equipe
            </button>
          </nav>
          <div className="sidebar-account">
            {connectionPanel}
            {!connection && (
              <div className="connection">
                <span className="connection-dot" />
                <div>
                  <strong>
                    {liveCatalog
                      ? connection
                        ? 'Digisac conectada'
                        : 'Reconexão necessária'
                      : qaSnapshot
                        ? 'Demonstração'
                        : 'Conta de demonstração'}
                  </strong>
                  <span>
                    {liveCatalog
                      ? 'Departamentos da plataforma'
                      : qaSnapshot
                        ? 'Departamentos em cópia local'
                        : 'Sem conexão com a Digisac'}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      </aside>
      <main className="workspace">
        <header className="topbar">
          <span>
            Robôs <span className="slash">/</span>{' '}
            {tab === 'creator' ? 'Criador V3' : 'Recursos da conta'}
          </span>
          <div className="topbar-actions">
            <ThemeToggle />
            <span className="demo-badge">
              {liveCatalog
                ? 'Conta Digisac'
                : qaSnapshot
                  ? 'QA · cópia local'
                  : 'Demonstração local'}
            </span>
          </div>
        </header>
        <div className="page-heading">
          <div>
            <h1>
              {tab === 'creator'
                ? 'Seu atendimento, passo a passo.'
                : 'As pessoas por trás do atendimento.'}
            </h1>
            <p>
              {tab === 'creator'
                ? 'Organize o roteiro, escolha os destinos e confira a conversa.'
                : liveCatalog
                  ? 'Departamentos e usuários consultados na conta conectada.'
                  : qaSnapshot
                    ? 'Departamentos fornecidos para os testes na QA, sem consulta automática à plataforma.'
                    : 'Os recursos abaixo são fictícios e servem para experimentar o criador.'}
            </p>
          </div>
          {tab === 'creator' && (
            <div className="heading-actions">
              <button
                id="new-bot"
                className="secondary"
                disabled={busy}
                onClick={startGuided}
              >
                Novo robô
              </button>
            </div>
          )}
        </div>
        <div className="demo-notice">
          <span className="notice-mark">i</span>
          <p>
            {liveCatalog
              ? 'Os departamentos e atendentes serão conferidos novamente antes do envio. O botão de envio cria um robô na conta conectada; não ativa canais de atendimento.'
              : qaSnapshot
                ? 'Departamentos fictícios para experimentar o editor, sem conexão com uma conta real.'
                : 'Você está usando um catálogo fictício. Para exportar um robô de teste, selecione os departamentos da QA abaixo.'}
          </p>
        </div>
        <div className="feedback" role="status" aria-live="polite">
          {notice}
          {removed && (
            <button
              className="text-button"
              onClick={() => {
                const nodes = [...draft.nodes];
                nodes.splice(removed.index, 0, removed.node);
                update({ ...draft, nodes });
                setSelectedId(removed.node.id);
                setRemoved(null);
                setNotice('Etapa restaurada.');
              }}
            >
              Desfazer exclusão
            </button>
          )}
        </div>
        {tab === 'catalog' ? (
          <CatalogView catalog={catalog} onRefresh={refreshCatalog} />
        ) : (
          <>
            <section
              className="resource-choice"
              aria-label="Recursos para o robô"
            >
              <label htmlFor="catalog-profile">
                Departamentos disponíveis
                <select
                  id="catalog-profile"
                  value={profileId}
                  disabled={busy}
                  onChange={(e) => {
                    // Preserve the current account's draft before changing catalogs.
                    try {
                      localStorage.setItem(
                        `bot-analyser:draft:${activeCatalog.accountId}`,
                        JSON.stringify(activeDraft),
                      );
                      localStorage.setItem(
                        'bot-analyser:profile',
                        e.target.value,
                      );
                    } catch {
                      setNotice(
                        'Não foi possível guardar o rascunho. Salve uma prévia antes de trocar de catálogo.',
                      );
                      return;
                    }
                    setCompleted(false);
                    setEditing(true);
                    setPublication(null);
                    setSendError('');
                    setCreating(false);
                    setResult(null);
                    setRemoved(null);
                    setSaved(false);
                    setDraft(null);
                    setCatalog(null);
                    setProfileId(e.target.value);
                  }}
                >
                  {profiles.map((profile) => (
                    <option key={profile.id} value={profile.id}>
                      {profile.label}
                    </option>
                  ))}
                </select>
              </label>
              <p className="field-help">
                Cada conta mantém seu próprio rascunho neste navegador.
              </p>
            </section>
            <section className="draft-meta" aria-label="Dados do robô">
              <label htmlFor="bot-name">
                Nome do robô
                <input
                  id="bot-name"
                  maxLength={200}
                  value={draft.name}
                  onChange={(e) => update({ ...draft, name: e.target.value })}
                />
              </label>
              <div className="draft-state">
                <span
                  className={
                    diagnostics.length ? 'state-dot warning' : 'state-dot'
                  }
                />
                {diagnostics.length
                  ? `${diagnostics.length} pendência${diagnostics.length === 1 ? '' : 's'} no roteiro`
                  : 'Roteiro sem pendências locais'}
              </div>
            </section>
            <BehaviorSettings
              draft={draft}
              catalog={catalog}
              onConfigure={() => setConfiguringBehavior({})}
            />
            <RobotActions
              draft={draft}
              catalog={catalog}
              result={result}
              preparing={preparing}
              error={preparationError}
              retry={() => setPreparationAttempt((value) => value + 1)}
              saved={saved}
              save={save}
              download={download}
              connection={profileId === 'live' ? connection : null}
              publication={publication}
              sending={sending}
              sendError={sendError}
              publish={publish}
              tab={actionTab}
              setTab={setActionTab}
              completed={completed}
            />
            {completed && (
              <button
                className="secondary edit-completed"
                aria-expanded={editing}
                aria-controls="completed-editor"
                onClick={() => setEditing(!editing)}
              >
                {editing ? 'Recolher edição' : 'Editar atendimento'}
              </button>
            )}
            <div id="completed-editor" hidden={!editing}>
              <div className="editor-mode">
                <p>
                  {advanced
                    ? 'Conexões avançadas: edição individual das etapas.'
                    : 'Cada escolha mostra o que acontece em seguida.'}
                </p>
                <button
                  className="text-button"
                  onClick={() => {
                    setAdvanced(!advanced);
                    setPreviewFrom('');
                  }}
                >
                  {advanced
                    ? 'Voltar à edição por caminhos'
                    : 'Editar conexões avançadas'}
                </button>
              </div>
              {!advanced && (
                <div
                  className="mobile-workspace-tabs"
                  aria-label="Visualização do construtor"
                >
                  <button
                    className={!mobileChat ? 'primary' : 'secondary'}
                    aria-pressed={!mobileChat}
                    onClick={() => setMobileChat(false)}
                  >
                    Montar roteiro
                  </button>
                  <button
                    className={mobileChat ? 'primary' : 'secondary'}
                    aria-pressed={mobileChat}
                    onClick={() => setMobileChat(true)}
                  >
                    Testar conversa
                  </button>
                </div>
              )}
              <div
                className={
                  advanced
                    ? 'builder'
                    : `builder paths-builder${mobileChat ? ' mobile-chat-open' : ''}`
                }
              >
                {!advanced ? (
                  <FlowEditor
                    key={draft.id}
                    draft={draft}
                    catalog={catalog}
                    onChange={update}
                    onPreview={(id, open) => {
                      setPreviewFrom(id);
                      if (open) setMobileChat(true);
                    }}
                  />
                ) : (
                  <>
                    <section
                      className="steps-panel"
                      aria-label="Etapas do roteiro"
                    >
                      <div className="panel-title">
                        <h2>Etapas</h2>
                        <span>{draft.nodes.length}</span>
                      </div>
                      <p className="panel-description">
                        Selecione uma etapa para editar.
                      </p>
                      <ol className="step-list">
                        {draft.nodes.map((node, index) => (
                          <li key={node.id}>
                            <button
                              className={
                                selectedId === node.id
                                  ? 'step-item selected'
                                  : 'step-item'
                              }
                              aria-pressed={selectedId === node.id}
                              onClick={() => {
                                setSelectedId(node.id);
                                editorRef.current?.focus();
                              }}
                            >
                              <span className="step-symbol">
                                <Icon name={node.kind} />
                              </span>
                              <span className="step-copy">
                                <strong>{stepName(node, index)}</strong>
                                <span
                                  className={
                                    node.name?.trim()
                                      ? 'step-subtitle'
                                      : undefined
                                  }
                                >
                                  {node.name?.trim() ||
                                    shortText(node, catalog)}
                                </span>
                                {draft.entryNodeId === node.id && (
                                  <small>Início do atendimento</small>
                                )}
                              </span>
                            </button>
                          </li>
                        ))}
                      </ol>
                      <div className="add-step">
                        <label htmlFor="new-kind">Nova etapa</label>
                        <select
                          id="new-kind"
                          value={newKind}
                          onChange={(e) =>
                            setNewKind(e.target.value as Step['kind'])
                          }
                        >
                          {Object.entries(kindName).map(([key, value]) => (
                            <option key={key} value={key}>
                              {value}
                            </option>
                          ))}
                        </select>
                        <button
                          className="secondary full-width"
                          onClick={addNode}
                          disabled={draft.nodes.length >= 200}
                        >
                          <Icon name="plus" />
                          Adicionar etapa
                        </button>
                      </div>
                    </section>
                    <section
                      className="editor-panel"
                      id="editor"
                      aria-label="Editor da etapa"
                    >
                      {selected ? (
                        <>
                          <div className="editor-title">
                            <div>
                              <span className="editor-step-number">
                                Etapa {selectedIndex + 1}
                              </span>
                              <h2 ref={editorRef} tabIndex={-1}>
                                {kindName[selected.kind]}
                              </h2>
                              {selected.name?.trim() && (
                                <p className="editor-subtitle">
                                  {selected.name.trim()}
                                </p>
                              )}
                            </div>
                            <span className="editor-type-symbol">
                              <Icon name={selected.kind} size={25} />
                            </span>
                          </div>
                          <p className="editor-description">
                            {selected.kind === 'menu'
                              ? 'Ajude o contato a encontrar o caminho certo.'
                              : selected.kind === 'transfer'
                                ? 'Defina quem dará continuidade ao atendimento.'
                                : selected.kind === 'message'
                                  ? 'Escreva o que o contato receberá nesta etapa.'
                                  : 'O robô para aqui. O chamado permanece aberto.'}
                          </p>
                          <div className="step-name-field">
                            <label htmlFor="step-name">
                              Nome da etapa{' '}
                              <span className="optional">opcional</span>
                            </label>
                            <input
                              id="step-name"
                              maxLength={80}
                              value={selected.name ?? ''}
                              placeholder="Ex.: Boas-vindas ou Transferência comercial"
                              aria-describedby="step-name-help"
                              onChange={(e) =>
                                updateNode({
                                  ...selected,
                                  name: e.target.value,
                                })
                              }
                            />
                            <p id="step-name-help" className="field-help">
                              O nome aparece como subtítulo para identificar
                              esta etapa no roteiro.
                            </p>
                          </div>
                          {selected.kind === 'menu' && (
                            <ReturnToEntry
                              draft={draft}
                              menuId={selected.id}
                              onChange={update}
                            />
                          )}
                          <StepEditor
                            node={selected}
                            nodes={draft.nodes}
                            catalog={catalog}
                            onChange={updateNode}
                          />
                          <div className="editor-footer">
                            <label className="checkbox-label">
                              <input
                                type="checkbox"
                                checked={draft.entryNodeId === selected.id}
                                onChange={() => {
                                  if (draft.entryNodeId !== selected.id)
                                    update({
                                      ...draft,
                                      entryNodeId: selected.id,
                                    });
                                }}
                              />
                              Começar o atendimento nesta etapa
                            </label>
                            <button
                              className="danger-link"
                              disabled={draft.nodes.length === 1}
                              onClick={() => {
                                setRemoved({
                                  node: selected,
                                  index: selectedIndex,
                                });
                                const nodes = draft.nodes.filter(
                                  (n) => n.id !== selected.id,
                                );
                                update({ ...draft, nodes });
                                setSelectedId(nodes[0]?.id ?? '');
                                setNotice(
                                  'Etapa removida. Confira as conexões do roteiro.',
                                );
                              }}
                            >
                              <Icon name="trash" size={15} />
                              Remover etapa
                            </button>
                          </div>
                        </>
                      ) : (
                        <p>Selecione uma etapa para começar a edição.</p>
                      )}
                    </section>
                  </>
                )}
                <Conversation
                  key={JSON.stringify(draft) + previewFrom}
                  draft={draft}
                  catalog={catalog}
                  previewFrom={advanced ? '' : previewFrom}
                  onRestart={() => setPreviewFrom('')}
                />
              </div>
            </div>
            <Review
              diagnostics={displayedDiagnostics}
              onSelect={(path) => {
                if (path.startsWith('behavior')) {
                  setConfiguringBehavior({
                    rule: behaviorRules.find((rule) =>
                      path.startsWith(`behavior.${rule.id}`),
                    )?.id,
                  });
                  return;
                }
                setEditing(true);
                setAdvanced(true);
                const index = Number(path.match(/^nodes\[(\d+)\]/)?.[1]);
                if (draft.nodes[index]) setSelectedId(draft.nodes[index].id);
                document
                  .getElementById('editor')
                  ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }}
            />
          </>
        )}
        {publication && (
          <section
            className="publication-result"
            role="status"
            aria-label="Resultado do envio"
          >
            <h2>
              {publication.status === 'sent'
                ? 'A Digisac aceitou o robô'
                : 'Não foi possível confirmar o envio'}
            </h2>
            <p>
              <strong>{publication.name}</strong> · {publication.origin}
            </p>
            {publication.botId && (
              <p>
                ID do robô: <code>{publication.botId}</code>
              </p>
            )}
            <p>
              {publication.status === 'sent'
                ? 'Abra o robô na plataforma e confira seu funcionamento. O envio não ativa canais de atendimento.'
                : 'A conexão terminou sem uma confirmação. O robô pode ter sido criado: verifique na Digisac antes de tentar outro envio. Não houve repetição automática.'}
            </p>
          </section>
        )}
        <footer className="page-footer">
          <span>Criação estruturada. Geração sem IA.</span>
          <span>V3 · Primeira versão local</span>
        </footer>
      </main>
    </div>
  );
}

function Destination({
  nodes,
  value,
  onChange,
  label = 'Próxima etapa',
  id,
}: {
  nodes: Step[];
  value: string;
  onChange: (v: string) => void;
  label?: string;
  id: string;
}) {
  return (
    <label htmlFor={id}>
      {label}
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Selecione uma etapa</option>
        {!nodes.some((n) => n.id === value) && value && (
          <option value={value}>Etapa removida</option>
        )}
        {nodes.map((n, i) => (
          <option key={n.id} value={n.id}>
            {stepName(n, i)}
            {n.name?.trim() ? ` — ${n.name.trim()}` : ''}
          </option>
        ))}
      </select>
    </label>
  );
}
function StepEditor({
  node,
  nodes,
  catalog,
  onChange,
}: {
  node: Step;
  nodes: Step[];
  catalog: Catalog;
  onChange: (n: Step) => void;
}) {
  if (node.kind === 'stop')
    return (
      <div className="stop-explanation">
        <Icon name="stop" size={32} />
        <strong>A conversa segue com sua equipe</strong>
        <p>
          Esta etapa encerra apenas a execução do robô. Ela não envia mensagem
          nem fecha o chamado.
        </p>
      </div>
    );
  if (node.kind === 'transfer') {
    const users = catalog.users.filter(
      (u) => u.active && u.departmentIds.includes(node.departmentId),
    );
    return (
      <div className="form-stack">
        <label htmlFor="department">
          Departamento
          <select
            id="department"
            value={node.departmentId}
            onChange={(e) => {
              const departmentId = e.target.value;
              const user = catalog.users.find((u) => u.id === node.userId);
              onChange({
                ...node,
                departmentId,
                userId:
                  user?.active && user.departmentIds.includes(departmentId)
                    ? node.userId
                    : null,
              });
            }}
          >
            <option value="">Selecione o departamento</option>
            {node.departmentId &&
              !catalog.departments.some(
                (d) => d.id === node.departmentId && d.active,
              ) && (
                <option value={node.departmentId}>
                  Departamento indisponível
                </option>
              )}
            {catalog.departments
              .filter((d) => d.active)
              .map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
          </select>
        </label>
        <label htmlFor="attendant">
          Atendente <span className="optional">opcional</span>
          <select
            id="attendant"
            value={node.userId ?? ''}
            disabled={!node.departmentId}
            onChange={(e) =>
              onChange({ ...node, userId: e.target.value || null })
            }
          >
            <option value="">Encaminhar ao departamento</option>
            {node.userId && !users.some((u) => u.id === node.userId) && (
              <option value={node.userId}>
                Atendente indisponível neste departamento
              </option>
            )}
            {users.map((u, i) => (
              <option key={u.id} value={u.id}>
                {u.name}
                {users.filter((x) => x.name === u.name).length > 1
                  ? ` · cadastro ${i + 1}`
                  : ''}
              </option>
            ))}
          </select>
        </label>
        <p className="field-help">
          A lista mostra os atendentes ativos vinculados ao departamento. Os
          vínculos são guardados por ID.
        </p>
        <Destination
          nodes={nodes}
          value={node.next}
          onChange={(next) => onChange({ ...node, next })}
          id="next-step"
        />
      </div>
    );
  }
  return (
    <div className="form-stack">
      <label htmlFor="message-text">
        Mensagem para o contato
        <textarea
          id="message-text"
          rows={5}
          maxLength={4000}
          value={node.kind === 'menu' ? node.message : node.text}
          onChange={(e) =>
            onChange(
              node.kind === 'menu'
                ? { ...node, message: e.target.value }
                : { ...node, text: e.target.value },
            )
          }
        />
      </label>
      <p className="field-help">
        Você pode usar <code>{'{{contact_name}}'}</code> para o nome do contato.
      </p>
      {node.kind === 'message' ? (
        <Destination
          nodes={nodes}
          value={node.next}
          onChange={(next) => onChange({ ...node, next })}
          id="next-step"
        />
      ) : (
        <>
          <div className="section-label">
            <h3>Opções de resposta</h3>
            <span>{node.options.length} de 20</span>
          </div>
          <div className="options-list">
            {node.options.map((option, i) => (
              <div className="option-editor" key={option.id}>
                <div className="option-top">
                  <label htmlFor={`value-${option.id}`}>
                    Resposta
                    <input
                      id={`value-${option.id}`}
                      maxLength={20}
                      value={option.value}
                      onChange={(e) =>
                        onChange({
                          ...node,
                          options: node.options.map((o, oi) =>
                            oi === i ? { ...o, value: e.target.value } : o,
                          ),
                        })
                      }
                    />
                  </label>
                  <label htmlFor={`label-${option.id}`}>
                    Texto da opção
                    <input
                      id={`label-${option.id}`}
                      maxLength={200}
                      value={option.label}
                      onChange={(e) =>
                        onChange({
                          ...node,
                          options: node.options.map((o, oi) =>
                            oi === i ? { ...o, label: e.target.value } : o,
                          ),
                        })
                      }
                    />
                  </label>
                  <button
                    className="icon-button remove-option"
                    aria-label={`Remover opção ${option.value || i + 1}`}
                    onClick={() =>
                      onChange({
                        ...node,
                        options: node.options.filter((_, oi) => oi !== i),
                      })
                    }
                  >
                    <Icon name="trash" size={16} />
                  </button>
                </div>
                <Destination
                  id={`target-${option.id}`}
                  label="Ao escolher, ir para"
                  nodes={nodes}
                  value={option.target}
                  onChange={(target) =>
                    onChange({
                      ...node,
                      options: node.options.map((o, oi) =>
                        oi === i ? { ...o, target } : o,
                      ),
                    })
                  }
                />
              </div>
            ))}
          </div>
          <button
            className="text-button add-option"
            disabled={node.options.length >= 20}
            onClick={() => {
              let number = 1;
              while (node.options.some((o) => o.value === String(number)))
                number++;
              onChange({
                ...node,
                options: [
                  ...node.options,
                  {
                    id: `option-${crypto.randomUUID()}`,
                    value: String(number),
                    label: '',
                    target: '',
                  },
                ],
              });
            }}
          >
            <Icon name="plus" size={16} />
            Adicionar opção
          </button>
        </>
      )}
    </div>
  );
}

interface ChatItem {
  kind: 'bot' | 'user' | 'note';
  text: string;
}
function follow(
  draft: Draft,
  catalog: Catalog,
  id: string,
): {
  items: ChatItem[];
  menu: Extract<Step, { kind: 'menu' }> | null;
  ticketClosed?: boolean;
} {
  const items: ChatItem[] = [];
  const visited = new Set<string>();
  while (!visited.has(id)) {
    visited.add(id);
    const node = draft.nodes.find((n) => n.id === id);
    if (!node) {
      items.push({
        kind: 'note',
        text: 'Escolha uma etapa de destino para continuar.',
      });
      break;
    }
    if (node.kind === 'menu') {
      items.push({ kind: 'bot', text: menuText(node) });
      return { items, menu: node };
    }
    if (node.kind === 'stop') {
      items.push({
        kind: 'note',
        text: 'O robô parou. O chamado continua aberto.',
      });
      return { items, menu: null };
    }
    if (node.kind === 'message') items.push({ kind: 'bot', text: node.text });
    if (node.kind === 'transfer') {
      const d = catalog.departments.find((d) => d.id === node.departmentId);
      const u = catalog.users.find((u) => u.id === node.userId);
      items.push({
        kind: 'note',
        text: `Encaminhamento: ${d?.name ?? 'departamento não definido'}${u ? ` · ${u.name}` : ''}`,
      });
    }
    id = node.next;
  }
  if (visited.has(id) && draft.nodes.some((n) => n.id === id))
    items.push({
      kind: 'note',
      text: 'Revise este caminho: há um ciclo automático.',
    });
  return { items, menu: null };
}
function SimulationSettings({
  compact,
  children,
}: {
  compact: boolean;
  children: ReactNode;
}) {
  return compact ? (
    <details className="guided-details">
      <summary>Testar regras do atendimento</summary>
      {children}
    </details>
  ) : (
    <>{children}</>
  );
}
function Conversation({
  draft,
  catalog,
  previewFrom = '',
  onRestart,
  compact = false,
}: {
  draft: Draft;
  catalog: Catalog;
  previewFrom?: string;
  onRestart?: () => void;
  compact?: boolean;
}) {
  const [firstMessage, setFirstMessage] = useState(true);
  const [holiday, setHoliday] = useState(false);
  const [companyOpen, setCompanyOpen] = useState(true);
  const [inactivityFromAttendant, setInactivityFromAttendant] = useState(true);
  const [reply, setReply] = useState('');
  const previewNode = draft.nodes.find((n) => n.id === previewFrom);
  function afterClosing(): ChatItem[] {
    const closing = draft.behavior?.afterTicketClosed;
    const evaluation = draft.behavior?.afterTicketClosedEvaluation;
    if (!closing?.enabled && !evaluation?.enabled) return [];
    const items: ChatItem[] = [
      { kind: 'note', text: 'Evento Após fechamento de chamado simulado.' },
    ];
    if (closing?.enabled)
      items.push(
        closing.message.trim()
          ? { kind: 'bot', text: closing.message }
          : {
              kind: 'note',
              text: 'Preencha a mensagem após fechar o chamado. A exportação está bloqueada.',
            },
      );
    if (evaluation?.enabled) {
      const question =
        catalog.questions?.state === 'ready'
          ? catalog.questions.items.find(
              (q) => q.id === evaluation.questionId && q.active,
            )
          : undefined;
      if (question)
        items.push(
          {
            kind: 'note',
            text: `Avaliação ${question.name}: última ação. Respostas, prazo e tentativas são tratados pela Digisac; esta prévia mostra a pergunta.`,
          },
          { kind: 'bot', text: question.questionMessage },
        );
      else
        items.push({
          kind: 'note',
          text: 'Selecione uma avaliação disponível nesta conta. A exportação está bloqueada.',
        });
    }
    return items;
  }
  function begin(
    first: boolean,
    isHoliday = holiday,
    isOpen = companyOpen,
  ): ReturnType<typeof follow> {
    if (!previewNode || previewNode.id === draft.entryNodeId) {
      const outcome = entryOutcome(draft, {
        firstMessage: first,
        holiday: isHoliday,
        companyOpen: isOpen,
      });
      if (outcome === 'not-first')
        return {
          menu: null,
          items: [
            {
              kind: 'note',
              text: 'Não é a primeira mensagem do chamado. O robô parou sem iniciar o menu nem enviar avisos.',
            },
          ],
        };
      if (outcome === 'holiday')
        return {
          menu: null,
          items: [
            {
              kind: 'note',
              text: 'Feriado simulado: a Digisac envia a mensagem de feriado configurada na conta. O conteúdo não está disponível nesta prévia. O robô parou e o chamado continua aberto.',
            },
          ],
        };
      if (outcome === 'closed')
        return {
          menu: null,
          items: [
            { kind: 'note', text: 'Fora do horário simulado.' },
            ...(draft.behavior!.businessHours!.closedMessage.trim()
              ? [
                  {
                    kind: 'bot' as const,
                    text: draft.behavior!.businessHours!.closedMessage,
                  },
                ]
              : [
                  {
                    kind: 'note' as const,
                    text: 'Preencha a mensagem fora do horário. A exportação está bloqueada.',
                  },
                ]),
            { kind: 'note', text: 'O robô parou. O chamado continua aberto.' },
          ],
        };
    }
    return follow(draft, catalog, previewNode?.id ?? draft.entryNodeId);
  }
  const [chat, setChat] = useState(() => begin(true));
  const transcript = useRef<HTMLDivElement>(null);
  const previousItemCount = useRef(0);
  useEffect(() => {
    const container = transcript.current;
    const previous = previousItemCount.current;
    if (container) {
      const exchange = container.querySelector<HTMLElement>(
        `[data-chat-index="${previous}"]`,
      );
      if (previous > 0 && chat.items.length > previous && exchange) {
        container.scrollTop +=
          exchange.getBoundingClientRect().top -
          container.getBoundingClientRect().top -
          12;
      } else {
        container.scrollTop = 0;
      }
    }
    previousItemCount.current = chat.items.length;
  }, [chat.items]);
  function answer(value: string) {
    if (!chat.menu) return;
    const option = chat.menu.options.find((o) => o.value === value);
    const invalidReply = draft.behavior?.invalidReply;
    const next = option
      ? follow(draft, catalog, option.target)
      : {
          menu: chat.menu,
          items: [
            ...(invalidReply?.enabled
              ? invalidReply.message.trim()
                ? [
                    { kind: 'bot' as const, text: invalidReply.message },
                    { kind: 'bot' as const, text: menuText(chat.menu) },
                  ]
                : [
                    {
                      kind: 'note' as const,
                      text: 'Preencha a mensagem para resposta inválida. A exportação está bloqueada.',
                    },
                  ]
              : [
                  {
                    kind: 'note' as const,
                    text: 'Resposta sem correspondência. Neste roteiro, o menu continua aguardando uma opção válida.',
                  },
                ]),
          ],
        };
    setChat({
      menu: next.menu,
      items: [...chat.items, { kind: 'user', text: value }, ...next.items],
    });
    setReply('');
  }
  return (
    <aside className="conversation-panel" aria-label="Simulação da conversa">
      <div className="panel-title">
        <h2>Prévia da conversa</h2>
        <button
          className={compact ? 'secondary' : 'icon-button'}
          aria-label={
            compact ? 'Testar fluxo novamente' : 'Reiniciar simulação'
          }
          onClick={() => {
            setChat(begin(firstMessage));
            setReply('');
          }}
        >
          <Icon name="refresh" size={17} />
          {compact && 'Testar fluxo novamente'}
        </button>
      </div>
      <p className="panel-description">
        Veja como o contato recebe e responde ao menu.
      </p>
      {previewNode && previewNode.id !== draft.entryNodeId && (
        <div className="chat-scope">
          <p>Testando: {previewNode.name || kindName[previewNode.kind]}</p>
          <button className="text-button" onClick={onRestart}>
            Testar desde o início
          </button>
        </div>
      )}
      <SimulationSettings compact={compact}>
        <div className="simulation-controls">
          <label htmlFor="simulation-entry">
            Mensagem de entrada
            <select
              id="simulation-entry"
              value={firstMessage ? 'first' : 'later'}
              onChange={(e) => {
                const first = e.target.value === 'first';
                setFirstMessage(first);
                setChat(begin(first));
              }}
            >
              <option value="first">Primeira do chamado</option>
              <option value="later">Outra mensagem do chamado</option>
            </select>
          </label>
          {draft.behavior?.respectHolidays && (
            <label>
              Dia simulado
              <select
                value={holiday ? 'holiday' : 'normal'}
                onChange={(e) => {
                  const next = e.target.value === 'holiday';
                  setHoliday(next);
                  setChat(begin(firstMessage, next, companyOpen));
                }}
              >
                <option value="normal">Dia sem feriado</option>
                <option value="holiday">Feriado</option>
              </select>
            </label>
          )}
          {draft.behavior?.businessHours?.enabled && (
            <label>
              Horário simulado
              <select
                value={companyOpen ? 'open' : 'closed'}
                onChange={(e) => {
                  const next = e.target.value === 'open';
                  setCompanyOpen(next);
                  setChat(begin(firstMessage, holiday, next));
                }}
              >
                <option value="open">Dentro do horário</option>
                <option value="closed">Fora do horário</option>
              </select>
            </label>
          )}
          <button
            className="secondary"
            disabled={!chat.menu}
            onClick={() => {
              const stop = draft.behavior?.stopOnAttendantMessage;
              setChat({
                menu: stop ? null : chat.menu,
                items: [
                  ...chat.items,
                  {
                    kind: 'note',
                    text: stop
                      ? 'Mensagem do atendente: o robô parou. O chamado continua aberto.'
                      : 'Mensagem do atendente: o robô continua, pois a regra de parada está desmarcada.',
                  },
                ],
              });
            }}
          >
            Simular mensagem do atendente
          </button>
          {draft.behavior?.ticketInactivity?.enabled && (
            <>
              <label>
                Na inatividade, mensagem foi enviada pelo atendente?
                <select
                  value={inactivityFromAttendant ? 'true' : 'false'}
                  onChange={(e) =>
                    setInactivityFromAttendant(e.target.value === 'true')
                  }
                >
                  <option value="true">
                    Verdadeiro — enviar aviso e fechar
                  </option>
                  <option value="false">Falso — sem ligação</option>
                </select>
              </label>
              <p className="field-help">
                Teste manual do evento. O prazo real é o configurado na Digisac.
              </p>
              <button
                className="secondary"
                disabled={chat.ticketClosed}
                onClick={() => {
                  const message = draft.behavior!.ticketInactivity!.message;
                  if (!message.trim()) {
                    setChat({
                      ...chat,
                      items: [
                        ...chat.items,
                        {
                          kind: 'note',
                          text: 'Preencha a mensagem de encerramento por inatividade. A exportação está bloqueada.',
                        },
                      ],
                    });
                    return;
                  }
                  setChat({
                    menu: null,
                    ticketClosed: inactivityFromAttendant,
                    items: [
                      ...chat.items,
                      {
                        kind: 'note',
                        text: 'Evento Chamado inativo simulado.',
                      },
                      ...(inactivityFromAttendant
                        ? [
                            { kind: 'bot' as const, text: message },
                            {
                              kind: 'note' as const,
                              text: 'O chamado foi fechado na simulação.',
                            },
                            ...afterClosing(),
                          ]
                        : [
                            {
                              kind: 'note' as const,
                              text: 'Condição falsa: sem envio de mensagem e sem fechamento. Este ramo não tem continuação configurada.',
                            },
                          ]),
                    ],
                  });
                  setReply('');
                }}
              >
                Simular chamado inativo
              </button>
            </>
          )}
          {(draft.behavior?.afterTicketClosed?.enabled ||
            draft.behavior?.afterTicketClosedEvaluation?.enabled) && (
            <>
              <p className="field-help">
                O teste representa o evento de fechamento. Na Digisac, confira o
                disparo após fechamento manual e automático.
              </p>
              <button
                className="secondary"
                disabled={chat.ticketClosed}
                onClick={() => {
                  setChat({
                    menu: null,
                    ticketClosed: true,
                    items: [
                      ...chat.items,
                      {
                        kind: 'note',
                        text: 'O chamado foi fechado manualmente na simulação.',
                      },
                      ...afterClosing(),
                    ],
                  });
                  setReply('');
                }}
              >
                Simular fechamento manual
              </button>
            </>
          )}
        </div>
      </SimulationSettings>
      <div className="chat-header">
        <span className="chat-avatar">
          <Icon name="flow" size={20} />
        </span>
        <div>
          <strong>{draft.name || 'Seu robô'}</strong>
          <span>Prévia de chat · contato de teste</span>
        </div>
      </div>
      <div className="chat-content" aria-live="polite" ref={transcript}>
        {chat.items.map((item, i) => (
          <div key={i} data-chat-index={i} className={`chat-item ${item.kind}`}>
            {item.kind === 'note' && <Icon name="arrow" size={14} />}
            <span>
              {item.text.replaceAll('{{contact_name}}', 'Contato de teste')}
            </span>
          </div>
        ))}
        {chat.menu && (
          <div className="chat-options">
            {chat.menu.options.map((option) => (
              <button key={option.id} onClick={() => answer(option.value)}>
                {option.value}
                <span>{option.label || 'Opção sem texto'}</span>
                <Icon name="arrow" size={14} />
              </button>
            ))}
          </div>
        )}
      </div>
      <form
        className="chat-reply"
        onSubmit={(e) => {
          e.preventDefault();
          if (reply.trim()) answer(reply);
        }}
      >
        <label htmlFor="chat-reply">Responder como contato</label>
        <div>
          <input
            id="chat-reply"
            value={reply}
            disabled={!chat.menu}
            placeholder={
              chat.menu ? 'Digite uma opção' : 'Este caminho terminou'
            }
            onChange={(e) => setReply(e.target.value)}
          />
          <button
            className="primary"
            disabled={!chat.menu || !reply.trim()}
            type="submit"
            aria-label="Enviar resposta"
          >
            <Icon name="arrow" />
          </button>
        </div>
      </form>
      <p className="simulation-note">
        Esta prévia acompanha seu roteiro. A execução na Digisac será validada
        em homologação.
      </p>
    </aside>
  );
}
function Review({
  diagnostics,
  onSelect,
}: {
  diagnostics: Diagnostic[];
  onSelect: (path: string) => void;
}) {
  return (
    <section
      className={`review-panel ${diagnostics.length ? 'has-issues' : ''}`}
      aria-label="Revisão do roteiro"
    >
      <div className="review-heading">
        <Icon name={diagnostics.length ? 'flow' : 'check'} size={20} />
        <div>
          <h2>
            {diagnostics.length
              ? 'Pontos para revisar'
              : 'As etapas estão conectadas'}
          </h2>
          <p>
            {diagnostics.length
              ? 'Você pode salvar o rascunho e resolver estes pontos antes de exportar ou enviar.'
              : 'A validação local não encontrou pendências. Os recursos são conferidos ao preparar os arquivos e antes do envio.'}
          </p>
        </div>
      </div>
      {diagnostics.length > 0 && (
        <ul>
          {diagnostics.map((d, i) => (
            <li key={`${d.path}-${d.code}-${i}`}>
              <button className="diagnostic" onClick={() => onSelect(d.path)}>
                {d.message}
                <span>
                  {d.path.startsWith('nodes[')
                    ? `Etapa ${Number(d.path.match(/^nodes\[(\d+)\]/)?.[1]) + 1}`
                    : 'Dados do roteiro'}
                  <Icon name="arrow" size={14} />
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
function CatalogView({
  catalog,
  onRefresh,
}: {
  catalog: Catalog;
  onRefresh: () => void;
}) {
  return (
    <section className="catalog-panel">
      <div className="catalog-heading">
        <div>
          <h2>Departamentos e equipe</h2>
          <p>
            {catalog.source === 'digisac'
              ? 'Escolha um departamento e, se desejar, um dos atendentes vinculados a ele.'
              : 'Seleção por ID, com vínculos explícitos entre as pessoas e os setores.'}
          </p>
        </div>
        <button className="secondary" onClick={onRefresh}>
          <Icon name="refresh" />
          Atualizar catálogo
        </button>
      </div>
      <div className="table-wrap">
        <table>
          <caption>
            {catalog.source === 'digisac'
              ? 'Departamentos da conta conectada'
              : catalog.source === 'snapshot'
                ? 'Catálogo fictício de demonstração'
                : 'Catálogo fictício da conta de demonstração'}
          </caption>
          <thead>
            <tr>
              <th>Departamento</th>
              <th>Atendentes vinculados</th>
              <th>Situação</th>
            </tr>
          </thead>
          <tbody>
            {catalog.departments.map((d) => (
              <tr key={d.id}>
                <th scope="row">{d.name}</th>
                <td>
                  {catalog.users
                    .filter((u) => u.departmentIds.includes(d.id))
                    .map((u) => `${u.name}${u.active ? '' : ' (indisponível)'}`)
                    .join(', ') ||
                    (catalog.source === 'digisac'
                      ? 'Sem atendente vinculado'
                      : catalog.source === 'snapshot'
                        ? 'Sem seleção de atendente nesta cópia'
                        : 'Sem atendente vinculado')}
                </td>
                <td>{d.active ? 'Disponível' : 'Indisponível'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="table-wrap">
        <table>
          <caption>Usuários da equipe ({catalog.users.length})</caption>
          <thead>
            <tr>
              <th>Usuário</th>
              <th>Departamentos vinculados</th>
              <th>Situação</th>
            </tr>
          </thead>
          <tbody>
            {catalog.users.map((user) => (
              <tr key={user.id}>
                <th scope="row">{user.name}</th>
                <td>
                  {user.departmentIds
                    .map(
                      (id) =>
                        catalog.departments.find((d) => d.id === id)?.name ??
                        'Departamento indisponível',
                    )
                    .join(', ') || 'Sem departamento vinculado'}
                </td>
                <td>{user.active ? 'Disponível' : 'Indisponível'}</td>
              </tr>
            ))}
            {!catalog.users.length && (
              <tr>
                <td colSpan={3}>
                  {catalog.source === 'snapshot'
                    ? 'Esta cópia local não contém usuários.'
                    : 'Nenhum usuário neste catálogo.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="catalog-footnote">
        {catalog.source === 'digisac'
          ? 'Atualizar consulta departamentos, usuários e vínculos novamente. Apenas atendentes disponíveis e vinculados ao departamento podem receber a transferência.'
          : catalog.source === 'snapshot'
            ? 'Esta cópia contém apenas departamentos. Recarregar o catálogo lê os dados locais e não consulta a Digisac.'
            : 'A conexão automática com a conta real ainda não está habilitada.'}
      </p>
    </section>
  );
}
