import { useEffect, useRef, useState } from 'react';
import type { Catalog, Draft } from '../../src/domain/types.ts';
import { menuText } from '../../src/domain/presentation.ts';
import { FlowOverview } from './FlowOverview.tsx';

export function GuidedFlowPreview({
  draft,
  catalog,
  activeNodeId,
  mobileVisible,
}: {
  draft: Draft;
  catalog: Catalog;
  activeNodeId?: string;
  mobileVisible: boolean;
}) {
  const [view, setView] = useState<'flow' | 'chat'>('chat');
  const node = draft.nodes.find(
    (item) => item.id === (activeNodeId ?? draft.entryNodeId),
  );
  const department =
    node?.kind === 'transfer'
      ? catalog.departments.find((item) => item.id === node.departmentId)
      : undefined;
  const user =
    node?.kind === 'transfer'
      ? catalog.users.find((item) => item.id === node.userId)
      : undefined;
  const message =
    node?.kind === 'menu'
      ? menuText(node)
      : node?.kind === 'message'
        ? node.text
        : '';
  const scroll = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const container = scroll.current;
    if (!container?.clientHeight) return;
    const active = container.querySelector<HTMLElement>(
      '[aria-current="step"]',
    );
    if (active) {
      // Scroll this panel only; advancing a prompt must not move keyboard focus.
      container.scrollTop +=
        active.getBoundingClientRect().top -
        container.getBoundingClientRect().top -
        12;
    } else container.scrollTop = 0;
  }, [activeNodeId, draft.id, mobileVisible, view]);
  return (
    <aside className="guided-live-flow" aria-label="Prévia do fluxo">
      <div className="guided-live-flow-heading">
        <div
          className="guided-preview-switch"
          role="group"
          aria-label="Tipo de prévia"
        >
          <button
            type="button"
            aria-pressed={view === 'chat'}
            onClick={() => setView('chat')}
          >
            Chat
          </button>
          <button
            type="button"
            aria-pressed={view === 'flow'}
            onClick={() => setView('flow')}
          >
            Seu fluxo
          </button>
        </div>
        <p>{draft.name || 'Seu atendimento'}</p>
      </div>
      <div
        className="guided-flow-scroll"
        ref={scroll}
        tabIndex={0}
        role="region"
        aria-label={
          view === 'flow' ? 'Percorrer o fluxo' : 'Chat da etapa atual'
        }
      >
        {view === 'flow' ? (
          <FlowOverview
            draft={draft}
            catalog={catalog}
            activeNodeId={activeNodeId}
          />
        ) : (
          <div className="guided-stage-chat">
            <div className="guided-stage-chat-heading">
              <h2>{node?.name || 'Etapa atual'}</h2>
              <p>Prévia ao vivo · contato de teste</p>
            </div>
            <div aria-live="polite" aria-atomic="true">
              {node?.kind === 'menu' || node?.kind === 'message' ? (
                message.trim() ? (
                  <div className="chat-item bot">
                    {message.replaceAll('{{contact_name}}', 'Contato de teste')}
                  </div>
                ) : (
                  <p className="guided-stage-chat-note">
                    Escreva a mensagem para vê-la aqui.
                  </p>
                )
              ) : (
                <p className="guided-stage-chat-note">
                  {node?.kind === 'transfer'
                    ? `Encaminhamento: ${department?.active ? department.name : node.departmentId ? 'departamento indisponível' : 'escolha um departamento'}${user ? ` · ${user.name}` : ''}`
                    : node?.kind === 'stop'
                      ? 'O robô parou. O chamado continua aberto.'
                      : 'Escolha uma etapa de início para visualizar a conversa.'}
                </p>
              )}
            </div>
            <p className="guided-stage-chat-note">
              A prévia acompanha a etapa que você está preenchendo. Para
              responder às opções, avance até “Testar conversa”.
            </p>
          </div>
        )}
      </div>
    </aside>
  );
}
