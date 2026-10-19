import type { Catalog, CompileResult, Draft } from '../../src/domain/types.ts';
import type {
  ConnectionSummary,
  Publication,
} from '../../src/digisac/connections.ts';
import { FlowOverview } from './FlowOverview.tsx';

export function RobotActions({
  draft,
  catalog,
  result,
  preparing,
  error,
  retry,
  saved,
  save,
  download,
  connection,
  publication,
  sending,
  sendError,
  publish,
  tab,
  setTab,
  completed,
}: {
  draft: Draft;
  catalog: Catalog;
  result: CompileResult | null;
  preparing: boolean;
  error: string;
  retry: () => void;
  saved: boolean;
  save: () => void;
  download: (botOnly?: boolean) => void;
  connection: ConnectionSummary | null;
  publication: Publication | null;
  sending: boolean;
  sendError: string;
  publish: () => void;
  tab: 'draft' | 'export';
  setTab: (tab: 'draft' | 'export') => void;
  completed: boolean;
}) {
  const ready = result?.status === 'preview' && !preparing;
  return (
    <section className="robot-actions" aria-label="Ações do robô">
      <h2 id="robot-actions-title" tabIndex={-1}>
        {completed ? 'Seu robô está montado' : 'Ações do robô'}
      </h2>
      <div
        className="robot-action-tabs"
        role="tablist"
        aria-label="Ações do robô"
      >
        {(['draft', 'export'] as const).map((value) => (
          <button
            key={value}
            id={`action-tab-${value}`}
            role="tab"
            aria-selected={tab === value}
            aria-controls={`action-panel-${value}`}
            tabIndex={tab === value ? 0 : -1}
            onClick={() => setTab(value)}
            onKeyDown={(event) => {
              if (
                !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)
              )
                return;
              event.preventDefault();
              const next =
                event.key === 'Home'
                  ? 'draft'
                  : event.key === 'End'
                    ? 'export'
                    : value === 'draft'
                      ? 'export'
                      : 'draft';
              setTab(next);
              document.getElementById(`action-tab-${next}`)?.focus();
            }}
          >
            {value === 'draft' ? 'Rascunho' : 'Exportar e enviar'}
          </button>
        ))}
      </div>
      <div
        role="tabpanel"
        id="action-panel-draft"
        aria-labelledby="action-tab-draft"
        hidden={tab !== 'draft'}
      >
        <p>
          Guarde o roteiro nesta conta, neste navegador, para continuar depois.
        </p>
        <button className="secondary" onClick={save}>
          {saved ? 'Rascunho salvo' : 'Salvar rascunho'}
        </button>
      </div>
      <div
        role="tabpanel"
        id="action-panel-export"
        aria-labelledby="action-tab-export"
        hidden={tab !== 'export'}
      >
        <p aria-live="polite">
          {preparing
            ? 'Preparando os arquivos…'
            : error ||
              (ready
                ? 'Prévia técnica disponível. Os arquivos acompanham suas alterações.'
                : result?.status === 'invalid'
                  ? 'Resolva os pontos da revisão para exportar ou enviar. Você pode salvar o rascunho.'
                  : 'Conecte novamente à Digisac para preparar os arquivos desta conta.')}
        </p>
        {error && (
          <button className="secondary" onClick={retry}>
            Tentar preparar novamente
          </button>
        )}
        <div className="export-actions">
          <button
            className="secondary"
            disabled={!ready || catalog.source === 'simulated'}
            onClick={() => download(true)}
          >
            Exportar JSON do robô
          </button>
          <button
            className="secondary"
            disabled={!ready}
            onClick={() => download()}
          >
            Baixar prévia técnica
          </button>
        </div>
        <p className="field-help">
          {catalog.source === 'simulated'
            ? 'O JSON do robô exige departamentos reais. Selecione a QA ou conecte sua conta. A prévia técnica está disponível na demonstração.'
            : 'O JSON é experimental. Baixar os arquivos não envia o robô à plataforma.'}
        </p>
        <div
          className="send-panel"
          role="region"
          aria-label="Enviar robô para a Digisac"
        >
          <div>
            <h3>Enviar para a Digisac</h3>
            <p className="connection-address">
              {connection
                ? `Destino: ${connection.origin}`
                : 'Conecte sua conta Digisac e selecione o catálogo conectado para enviar.'}
            </p>
            {connection && (
              <p className="field-help">
                Este envio cria o robô nesta conta após conferir os
                departamentos. Não ativa canais de atendimento.
              </p>
            )}
          </div>
          <button
            className="primary"
            disabled={!ready || !connection || sending || Boolean(publication)}
            onClick={publish}
          >
            {sending
              ? 'Enviando robô…'
              : publication?.status === 'sent'
                ? 'Envio concluído'
                : publication?.status === 'unknown'
                  ? 'Confira o envio na plataforma'
                  : 'Enviar robô para esta conta'}
          </button>
        </div>
        {sendError && (
          <p className="send-error" role="alert">
            {sendError}
          </p>
        )}
      </div>
      {completed && (
        <details className="flow-overview-disclosure">
          <summary>Ver fluxo completo</summary>
          <FlowOverview draft={draft} catalog={catalog} complete />
        </details>
      )}
    </section>
  );
}
