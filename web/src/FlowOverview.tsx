import { BehaviorSummary } from './BehaviorSettings.tsx';
import type { Catalog, Draft, Step } from '../../src/domain/types.ts';

export function FlowOverview({
  draft,
  catalog,
  onOpen,
  activeNodeId,
  complete = false,
}: {
  draft: Draft;
  catalog: Catalog;
  onOpen?: (id: string) => void;
  activeNodeId?: string;
  complete?: boolean;
}) {
  const seen = new Set<string>();
  const names = {
    menu: 'Menu',
    message: 'Mensagem',
    transfer: 'Transferência',
    stop: 'Parar o robô',
  };
  function describe(node: Step) {
    if (node.kind === 'menu') return node.message;
    if (node.kind === 'message') return node.text;
    if (node.kind === 'transfer') {
      const department = catalog.departments.find(
        (d) => d.id === node.departmentId && d.active,
      );
      const user = catalog.users.find(
        (u) =>
          u.id === node.userId &&
          u.active &&
          u.departmentIds.includes(node.departmentId),
      );
      return `${department?.name ?? 'Departamento a escolher'}${node.userId ? ` · ${user?.name ?? 'Atendente indisponível'}` : ''}`;
    }
    return 'O chamado continua aberto para a equipe.';
  }
  function visit(id: string, path: string[], depth: number) {
    const node = draft.nodes.find((n) => n.id === id);
    if (!node) return <p className="flow-map-reference">Destino a escolher</p>;
    const repeated = path.includes(id);
    if (seen.has(id) || depth >= 6)
      return (
        <p
          className="flow-map-reference"
          aria-current={id === activeNodeId ? 'step' : undefined}
        >
          {repeated ? 'Retorna para' : 'Continua em'}{' '}
          <strong>{node.name || names[node.kind]}</strong>
          {onOpen && node.kind !== 'stop' && (
            <button className="text-button" onClick={() => onOpen(id)}>
              Abrir etapa
            </button>
          )}
        </p>
      );
    seen.add(id);
    return (
      <>
        <div
          className={`flow-map-node flow-map-${node.kind}`}
          aria-current={id === activeNodeId ? 'step' : undefined}
        >
          {id === activeNodeId && (
            <span className="flow-map-current-label">Etapa em edição</span>
          )}
          {onOpen && node.kind !== 'stop' ? (
            <button className="text-button" onClick={() => onOpen(id)}>
              {node.name || names[node.kind]}
            </button>
          ) : (
            <strong>{node.name || names[node.kind]}</strong>
          )}
          <p>{describe(node)}</p>
        </div>
        {node.kind === 'menu' ? (
          <ul>
            {node.options.map((option) => (
              <li key={option.id}>
                <span className="flow-map-choice">
                  Se escolher {option.value} ·{' '}
                  {option.label || 'Opção sem texto'}
                </span>
                {visit(option.target, [...path, id], depth + 1)}
              </li>
            ))}
          </ul>
        ) : (
          node.kind !== 'stop' && (
            <ul>
              <li>{visit(node.next, [...path, id], depth + 1)}</li>
            </ul>
          )
        )}
      </>
    );
  }
  return (
    <div className="flow-map" aria-label="Mapa do atendimento">
      <BehaviorSummary draft={draft} catalog={catalog} />
      {visit(draft.entryNodeId, [], 0)}
      {complete &&
        draft.nodes.map((node) =>
          seen.has(node.id) ? null : (
            <section key={node.id} className="flow-map-continuation">
              <h3>{node.name || names[node.kind]} · continuação</h3>
              {visit(node.id, [], 0)}
            </section>
          ),
        )}
    </div>
  );
}
