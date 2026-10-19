import { useState } from 'react';
import type { Catalog, Draft, Step } from '../../src/domain/types.ts';
import {
  branchTarget,
  changeBranch,
  pruneBranch,
  targets,
} from './flow-model.ts';
import type { Branch } from './flow-model.ts';
import { ReturnToEntry } from './ReturnToEntry.tsx';
import { FlowOverview } from './FlowOverview.tsx';

const labels = {
  menu: 'Abrir um menu',
  message: 'Enviar uma mensagem',
  transfer: 'Transferir atendimento',
  stop: 'Parar o robô aqui',
};

export function FlowEditor({
  draft,
  catalog,
  onChange,
  onPreview,
}: {
  draft: Draft;
  catalog: Catalog;
  onChange: (draft: Draft) => void;
  onPreview: (id: string, open?: boolean) => void;
}) {
  const [history, setHistory] = useState<{ before: Draft; after: Draft }[]>([]);
  const [root, setRoot] = useState(draft.entryNodeId);
  const currentRoot = draft.nodes.some((n) => n.id === root)
    ? root
    : draft.entryNodeId;
  const last = history.at(-1);
  const rendered = new Set<string>();
  function commit(next: Draft) {
    if (next === draft) return;
    setHistory((h) =>
      [
        ...(h.at(-1)?.after === draft ? h : []),
        { before: draft, after: next },
      ].slice(-40),
    );
    onChange(next);
  }
  function edit(node: Step) {
    commit({
      ...draft,
      nodes: draft.nodes.map((n) => (n.id === node.id ? node : n)),
    });
  }
  function next(branch: Branch, path: string[], depth: number, key: string) {
    const target = branchTarget(draft, branch);
    const node = draft.nodes.find((n) => n.id === target);
    const repeated = path.includes(target);
    const selectValue = repeated ? `existing:${target}` : (node?.kind ?? '');
    return (
      <div className="branch-next" key={key}>
        <label htmlFor={`action-${key}`}>
          {!branch
            ? 'Como começa este atendimento?'
            : draft.nodes.find((n) => n.id === branch.owner)?.kind ===
                'transfer'
              ? 'Depois da transferência'
              : draft.nodes.find((n) => n.id === branch.owner)?.kind ===
                  'message'
                ? 'Depois da mensagem'
                : 'Depois desta escolha'}
        </label>
        <select
          id={`action-${key}`}
          value={selectValue}
          onChange={(e) => commit(changeBranch(draft, branch, e.target.value))}
        >
          {!node && <option value="">Escolha o próximo passo</option>}
          {Object.entries(labels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
          <optgroup label="Ir para uma etapa existente">
            {draft.nodes
              .filter((n) => n.kind !== 'stop')
              .map((n, i) => (
                <option key={n.id} value={`existing:${n.id}`}>
                  {n.name?.trim() || `${labels[n.kind]} ${i + 1}`}
                  {n.id === draft.entryNodeId ? ' (início)' : ''}
                </option>
              ))}
          </optgroup>
        </select>
        {node?.kind === 'stop' && (
          <p className="branch-ending">
            O robô termina este caminho. O chamado permanece aberto.
          </p>
        )}
        {node &&
          node.kind !== 'stop' &&
          (repeated || rendered.has(target) || depth >= 4 ? (
            <div className="branch-reference">
              <p>
                {repeated ? 'Retorna para' : 'Continua em'}{' '}
                <strong>{node.name?.trim() || labels[node.kind]}</strong>.
              </p>
              <button
                className="text-button"
                onClick={() => {
                  setRoot(node.id);
                  onPreview(node.id);
                }}
              >
                Abrir esta etapa
              </button>
            </div>
          ) : (
            content(node, [...path, target], depth, `${key}-${target}`)
          ))}
      </div>
    );
  }
  function content(node: Step, path: string[], depth: number, key: string) {
    rendered.add(node.id);
    const shared =
      draft.nodes.flatMap(targets).filter((id) => id === node.id).length > 1;
    return (
      <section
        className="inline-step"
        aria-label={node.name?.trim() || labels[node.kind]}
      >
        <div className="inline-step-heading">
          <h3>
            {node.kind === 'menu' ? 'Menu de atendimento' : labels[node.kind]}
          </h3>
          <button
            className="text-button"
            onClick={() => onPreview(node.id, true)}
          >
            Testar {node.kind === 'menu' ? 'este menu' : 'esta etapa'}
          </button>
        </div>
        {shared && (
          <p className="field-help">
            Esta etapa é usada em mais de um caminho. A edição vale para todos
            eles.
          </p>
        )}
        <label htmlFor={`name-${key}`}>Nome da etapa</label>
        <input
          id={`name-${key}`}
          value={node.name ?? ''}
          maxLength={80}
          placeholder="Ex.: Etapa comercial"
          onChange={(e) => edit({ ...node, name: e.target.value })}
        />
        {(node.kind === 'menu' || node.kind === 'message') && (
          <>
            <label htmlFor={`message-${key}`}>
              Mensagem enviada ao contato
            </label>
            <textarea
              id={`message-${key}`}
              rows={3}
              maxLength={4000}
              placeholder="Escreva a mensagem que o contato receberá."
              value={node.kind === 'menu' ? node.message : node.text}
              onFocus={() => onPreview(node.id)}
              onChange={(e) => {
                edit(
                  node.kind === 'menu'
                    ? { ...node, message: e.target.value }
                    : { ...node, text: e.target.value },
                );
                onPreview(node.id);
              }}
            />
          </>
        )}
        {node.kind === 'transfer' && (
          <>
            <label htmlFor={`department-${key}`}>Departamento</label>
            <select
              id={`department-${key}`}
              value={node.departmentId}
              onChange={(e) =>
                edit({ ...node, departmentId: e.target.value, userId: null })
              }
            >
              <option value="">Selecione o departamento</option>
              {node.departmentId &&
                !catalog.departments.some(
                  (d) => d.active && d.id === node.departmentId,
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
            {
              <>
                <label htmlFor={`user-${key}`}>Atendente opcional</label>
                <select
                  id={`user-${key}`}
                  value={node.userId ?? ''}
                  disabled={!node.departmentId}
                  onChange={(e) =>
                    edit({ ...node, userId: e.target.value || null })
                  }
                >
                  <option value="">Encaminhar ao departamento</option>
                  {node.userId &&
                    !catalog.users.some(
                      (u) =>
                        u.id === node.userId &&
                        u.active &&
                        u.departmentIds.includes(node.departmentId),
                    ) && (
                      <option value={node.userId}>
                        Atendente indisponível
                      </option>
                    )}
                  {catalog.users
                    .filter(
                      (u) =>
                        u.active && u.departmentIds.includes(node.departmentId),
                    )
                    .map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                </select>
                {node.departmentId &&
                  !catalog.users.some(
                    (u) =>
                      u.active && u.departmentIds.includes(node.departmentId),
                  ) && (
                    <p className="field-help">
                      Não há atendentes disponíveis vinculados a este
                      departamento. A transferência pode seguir para a equipe.
                    </p>
                  )}
              </>
            }
          </>
        )}
        {node.kind === 'menu' && (
          <div className="inline-options">
            <h4>Opções e próximos passos</h4>
            <ReturnToEntry draft={draft} menuId={node.id} onChange={commit} />
            {node.options.map((option, index) => (
              <fieldset className="inline-option" key={option.id}>
                <legend>Opção {index + 1}</legend>
                <div
                  className="inline-option-fields"
                  onFocusCapture={() => onPreview(node.id)}
                >
                  <div>
                    <label htmlFor={`value-${key}-${option.id}`}>
                      Resposta
                    </label>
                    <input
                      id={`value-${key}-${option.id}`}
                      maxLength={40}
                      value={option.value}
                      onChange={(e) =>
                        edit({
                          ...node,
                          options: node.options.map((o) =>
                            o.id === option.id
                              ? { ...o, value: e.target.value }
                              : o,
                          ),
                        })
                      }
                    />
                  </div>
                  <div>
                    <label htmlFor={`label-${key}-${option.id}`}>
                      Texto da opção
                    </label>
                    <input
                      id={`label-${key}-${option.id}`}
                      maxLength={200}
                      placeholder="Ex.: Comprar"
                      value={option.label}
                      onChange={(e) =>
                        edit({
                          ...node,
                          options: node.options.map((o) =>
                            o.id === option.id
                              ? { ...o, label: e.target.value }
                              : o,
                          ),
                        })
                      }
                    />
                  </div>
                </div>
                {next(
                  { owner: node.id, option: option.id },
                  path,
                  depth + 1,
                  `${key}-${option.id}`,
                )}
                <button
                  className="danger-link"
                  disabled={node.options.length <= 1}
                  onClick={() => {
                    const updated = {
                      ...draft,
                      nodes: draft.nodes.map((n) =>
                        n.id === node.id
                          ? {
                              ...node,
                              options: node.options.filter(
                                (o) => o.id !== option.id,
                              ),
                            }
                          : n,
                      ),
                    };
                    commit(pruneBranch(draft, updated, option.target));
                  }}
                >
                  Remover opção {index + 1}
                </button>
              </fieldset>
            ))}
            <button
              className="secondary"
              disabled={node.options.length >= 20 || draft.nodes.length >= 200}
              onClick={() => {
                let stop = draft.nodes.find((n) => n.kind === 'stop')?.id;
                const nodes = [...draft.nodes];
                if (!stop) {
                  stop = `step-${crypto.randomUUID()}`;
                  nodes.push({ id: stop, kind: 'stop' });
                }
                let value = 1;
                while (node.options.some((o) => o.value === String(value)))
                  value++;
                commit({
                  ...draft,
                  nodes: nodes.map((n) =>
                    n.id === node.id
                      ? {
                          ...node,
                          options: [
                            ...node.options,
                            {
                              id: crypto.randomUUID(),
                              value: String(value),
                              label: `Nova opção ${value}`,
                              target: stop!,
                            },
                          ],
                        }
                      : n,
                  ),
                });
              }}
            >
              Adicionar opção
            </button>
          </div>
        )}
        {(node.kind === 'message' || node.kind === 'transfer') &&
          next({ owner: node.id }, path, depth + 1, `${key}-next`)}
      </section>
    );
  }
  return (
    <section
      className="flow-editor"
      id="editor"
      aria-label="Roteiro por caminhos"
    >
      <div className="flow-editor-heading">
        <div>
          <h2>Monte o atendimento</h2>
          <p>
            Adapte os textos prontos e escolha o que acontece em cada caminho.
          </p>
        </div>
        <button
          className="text-button"
          disabled={last?.after !== draft}
          onClick={() => {
            if (last?.after === draft) {
              onChange(last.before);
              setHistory((h) => h.slice(0, -1));
            }
          }}
        >
          Desfazer alteração
        </button>
      </div>
      <details className="flow-overview-disclosure">
        <summary>Ver mapa do fluxo</summary>
        <p className="field-help">
          Acompanhe as escolhas do contato. Clique em uma etapa para editar e
          testar.
        </p>
        <FlowOverview
          draft={draft}
          catalog={catalog}
          onOpen={(id) => {
            setRoot(id);
            onPreview(id);
          }}
        />
      </details>
      {currentRoot !== draft.entryNodeId && (
        <button
          className="secondary"
          onClick={() => {
            setRoot(draft.entryNodeId);
            onPreview(draft.entryNodeId);
          }}
        >
          Voltar ao início do roteiro
        </button>
      )}
      {currentRoot === draft.entryNodeId
        ? next(null, [], 0, 'entry')
        : content(
            draft.nodes.find((n) => n.id === currentRoot)!,
            [currentRoot],
            0,
            'opened',
          )}
    </section>
  );
}
