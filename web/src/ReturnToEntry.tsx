import { useId } from 'react';
import type { Draft } from '../../src/domain/types.ts';
import { addReturnToEntry, returnToEntryIssue } from './flow-model.ts';

export function ReturnToEntry({
  draft,
  menuId,
  onChange,
}: {
  draft: Draft;
  menuId: string;
  onChange: (draft: Draft) => void;
}) {
  const id = useId();
  if (menuId === draft.entryNodeId) return null;
  const issue = returnToEntryIssue(draft, menuId);
  return (
    <div className="return-to-entry">
      <button
        type="button"
        className="secondary"
        disabled={!!issue}
        aria-describedby={id}
        onClick={() => onChange(addReturnToEntry(draft, menuId))}
      >
        Adicionar retorno 0 ao menu inicial
      </button>
      <p id={id} className="field-help">
        {issue ??
          'Adiciona texto e destino juntos. Funciona somente neste menu e não repete os avisos de entrada.'}
      </p>
    </div>
  );
}
