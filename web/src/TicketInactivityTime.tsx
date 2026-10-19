import { useEffect, useId, useRef, useState } from 'react';
import type { InactivityTime } from '../../src/digisac/connections.ts';
import { api } from './api.ts';

export function TicketInactivityTime({
  connectionId,
  onSavingChange,
}: {
  connectionId?: string;
  onSavingChange: (saving: boolean) => void;
}) {
  const id = useId();
  const [current, setCurrent] = useState<InactivityTime | null>(null);
  const [value, setValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const sequence = useRef(0);
  const savingRef = useRef(false);
  const valid =
    /^\d+$/.test(value) &&
    Number.isSafeInteger(Number(value)) &&
    Number(value) > 0;
  async function load(preserveValue = false) {
    if (!connectionId || savingRef.current) return;
    const attempt = ++sequence.current;
    setLoading(true);
    setCurrent(null);
    setError('');
    setNotice('');
    try {
      const data: InactivityTime = await api('/api/company/inactivity-time', {
        headers: { 'X-Connection-Id': connectionId },
      });
      if (attempt !== sequence.current) return;
      setCurrent(data);
      if (!preserveValue) setValue(String(data.ticketInactiveTime));
    } catch (error) {
      if (attempt === sequence.current)
        setError(
          error instanceof Error
            ? error.message
            : 'Não foi possível consultar o prazo.',
        );
    } finally {
      if (attempt === sequence.current) setLoading(false);
    }
  }
  useEffect(() => {
    void load();
    return () => {
      sequence.current++;
    };
  }, [connectionId]);
  async function save() {
    if (!valid || !current || !connectionId || loading || savingRef.current)
      return;
    savingRef.current = true;
    setSaving(true);
    onSavingChange(true);
    setError('');
    setNotice('');
    const attempt = ++sequence.current;
    try {
      const data: InactivityTime = await api('/api/company/inactivity-time', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          connectionId,
          ticketInactiveTime: Number(value),
          revision: current.revision,
        }),
      });
      if (attempt !== sequence.current) return;
      setCurrent(data);
      setValue(String(data.ticketInactiveTime));
      setNotice(`Prazo atualizado para ${data.ticketInactiveTime} minutos.`);
    } catch (error) {
      if (attempt !== sequence.current) return;
      setCurrent(null);
      setError(
        error instanceof Error
          ? error.message
          : 'Não foi possível confirmar a alteração. Consulte o prazo novamente.',
      );
    } finally {
      savingRef.current = false;
      if (attempt === sequence.current) {
        setSaving(false);
        onSavingChange(false);
      }
    }
  }
  if (!connectionId)
    return (
      <p className="field-help">
        Conecte à Digisac para consultar e alterar o prazo de inatividade da
        empresa.
      </p>
    );
  return (
    <section
      className="inactivity-time behavior-message"
      aria-label="Prazo de inatividade da empresa"
      aria-busy={loading || saving}
    >
      {loading && (
        <p className="field-help" role="status">
          Consultando o prazo da empresa…
        </p>
      )}
      {current && (
        <>
          <p className="field-help">
            Prazo atual da empresa:{' '}
            <strong>{current.ticketInactiveTime} minutos</strong>.
          </p>
          <label htmlFor={`${id}-minutes`}>
            Tempo de inatividade (minutos)
          </label>
          <input
            id={`${id}-minutes`}
            type="number"
            min="1"
            step="1"
            value={value}
            disabled={saving || loading}
            aria-invalid={!valid}
            aria-describedby={`${id}-scope ${id}-validation`}
            onChange={(event) => {
              setValue(event.target.value);
              setNotice('');
            }}
          />
          <p id={`${id}-validation`} className="field-help">
            {!valid
              ? 'Informe um número inteiro de minutos, maior que zero.'
              : 'O novo prazo será aplicado ao clicar em Atualizar prazo da empresa.'}
          </p>
          <p id={`${id}-scope`} className="field-help">
            Essa alteração vale para a empresa e pode afetar outros robôs e
            atendimentos desta conta.
          </p>
          <button
            type="button"
            className="secondary"
            disabled={
              saving ||
              loading ||
              !valid ||
              Number(value) === current.ticketInactiveTime
            }
            onClick={() => void save()}
          >
            {saving ? 'Atualizando prazo…' : 'Atualizar prazo da empresa'}
          </button>
        </>
      )}
      {error && (
        <p className="connection-error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="field-help" role="status">
          {notice}
        </p>
      )}
      <button
        type="button"
        className="text-button"
        disabled={loading || saving}
        onClick={() => void load(value !== '')}
      >
        Consultar prazo novamente
      </button>
    </section>
  );
}
