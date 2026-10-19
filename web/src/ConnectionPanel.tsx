import { useEffect, useRef, useState } from 'react';
import type { ConnectionSummary } from '../../src/digisac/connections.ts';
import type { InstanceResolution } from '../../src/digisac/instance.ts';
import { api } from './api.ts';

export function ConnectionPanel({
  connection,
  disabled,
  reconnect,
  beforeChange,
  onConnected,
  onDisconnected,
  standalone = false,
}: {
  connection: ConnectionSummary | null;
  disabled: boolean;
  reconnect: boolean;
  beforeChange: () => void;
  onConnected: (connection: ConnectionSummary) => void;
  onDisconnected: () => void;
  standalone?: boolean;
}) {
  const [open, setOpen] = useState(reconnect);
  const [origin, setOrigin] = useState(() => {
    try {
      return localStorage.getItem('bot-analyser:instance') || '';
    } catch {
      return '';
    }
  });
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [instanceError, setInstanceError] = useState('');
  const [checking, setChecking] = useState(false);
  const [verified, setVerified] = useState<
    (InstanceResolution & { input: string }) | null
  >(null);
  const [selectedOrigin, setSelectedOrigin] = useState('');
  const lookupSequence = useRef(0);
  const lookup = useRef<{
    input: string;
    promise: Promise<InstanceResolution | null>;
  } | null>(null);
  useEffect(
    () => () => {
      lookupSequence.current++;
    },
    [],
  );
  async function verifyInstance(): Promise<InstanceResolution | null> {
    const input = origin.trim();
    if (!input) return null;
    if (verified?.input === input) return verified;
    if (lookup.current?.input === input) return lookup.current.promise;
    const attempt = ++lookupSequence.current;
    setChecking(true);
    setInstanceError('');
    setVerified(null);
    setSelectedOrigin('');
    const promise = (async () => {
      try {
        const result: InstanceResolution = await api(
          '/api/connection/resolve',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ origin: input }),
          },
        );
        if (attempt !== lookupSequence.current) return null;
        setVerified({ ...result, input });
        setSelectedOrigin(result.origins.length === 1 ? result.origins[0] : '');
        return result;
      } catch (error) {
        if (attempt === lookupSequence.current)
          setInstanceError(
            error instanceof Error
              ? error.message
              : 'Não foi possível verificar a instância.',
          );
        return null;
      } finally {
        if (attempt === lookupSequence.current) {
          setChecking(false);
          lookup.current = null;
        }
      }
    })();
    lookup.current = { input, promise };
    return promise;
  }
  useEffect(() => {
    if (reconnect) setOpen(true);
  }, [reconnect]);
  if (connection)
    return (
      <section className="connection-panel" aria-label="Conexão com a Digisac">
        <div className="connection-heading">
          <div>
            <h2>Digisac conectada</h2>
            <p className="connection-address">{connection.origin}</p>
            <p>{connection.username}</p>
          </div>
          <button
            className="secondary"
            disabled={disabled || pending}
            onClick={async () => {
              setError('');
              try {
                beforeChange();
                setPending(true);
                await api('/api/disconnect', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: '{}',
                });
                onDisconnected();
                setOpen(true);
              } catch (e) {
                setError(
                  e instanceof Error
                    ? e.message
                    : 'Não foi possível desconectar.',
                );
              } finally {
                setPending(false);
              }
            }}
          >
            {pending ? 'Desconectando…' : 'Desconectar'}
          </button>
        </div>
        <p className="field-help">
          Departamentos e usuários consultados na plataforma.
        </p>
        {error && (
          <p className="connection-error" role="alert">
            {error}
          </p>
        )}
      </section>
    );
  const contents = (
    <>
      {!standalone && (
        <p>
          Entre na conta de destino para consultar departamentos, usuários e
          enviar o robô.
        </p>
      )}
      <form
        className="connection-form"
        onSubmit={async (e) => {
          e.preventDefault();
          setError('');
          if (pending || disabled) return;
          try {
            beforeChange();
            setPending(true);
            const resolution = await verifyInstance();
            if (!resolution) return;
            const destination =
              resolution.origins.length === 1
                ? resolution.origins[0]
                : selectedOrigin;
            if (!destination || !resolution.origins.includes(destination)) {
              setInstanceError(
                'Escolha o endereço da sua instância para continuar.',
              );
              return;
            }
            const body = JSON.stringify({
              origin: destination,
              username,
              password,
            });
            setPassword('');
            setPasswordVisible(false);
            const result = await api('/api/connection', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body,
            });
            try {
              localStorage.setItem(
                'bot-analyser:instance',
                result.connection.origin,
              );
            } catch {
              /* The connection works without local storage. */
            }
            onConnected(result.connection);
          } catch (reason) {
            setError(
              reason instanceof Error
                ? reason.message
                : 'Não foi possível conectar.',
            );
          } finally {
            setPending(false);
          }
        }}
      >
        <div className="connection-address-field">
          <label htmlFor="digisac-origin">
            URL da instância
            <input
              id="digisac-origin"
              type="text"
              inputMode="url"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="empresa-exemplo ou https://empresa-exemplo.digisac.io"
              autoComplete="url"
              value={origin}
              maxLength={300}
              required
              disabled={disabled || pending}
              aria-describedby="digisac-origin-help digisac-origin-status"
              aria-invalid={Boolean(instanceError)}
              onBlur={() => void verifyInstance()}
              onChange={(e) => {
                setOrigin(e.target.value);
                lookupSequence.current++;
                lookup.current = null;
                setVerified(null);
                setSelectedOrigin('');
                setChecking(false);
                setInstanceError('');
                setError('');
              }}
            />
          </label>
          <p className="field-help" id="digisac-origin-help">
            Informe o nome da instância ou cole o endereço completo.
          </p>
          <div id="digisac-origin-status" aria-live="polite">
            {checking && (
              <p className="field-help" role="status">
                Verificando instância…
              </p>
            )}
            {verified?.origins.length === 1 && (
              <p className="field-help connection-address" role="status">
                Instância encontrada:{' '}
                <strong>{new URL(verified.origins[0]).hostname}</strong>
              </p>
            )}
            {verified && verified.origins.length > 1 && (
              <>
                <label htmlFor="digisac-instance-choice">
                  Encontramos mais de um endereço. Qual é sua instância?
                </label>
                <select
                  id="digisac-instance-choice"
                  value={selectedOrigin}
                  disabled={disabled || pending}
                  onChange={(event) => {
                    setSelectedOrigin(event.target.value);
                    setInstanceError('');
                  }}
                >
                  <option value="">Selecione o endereço</option>
                  {verified.origins.map((value) => (
                    <option key={value} value={value}>
                      {new URL(value).hostname}
                    </option>
                  ))}
                </select>
              </>
            )}
          </div>
          {instanceError && (
            <p className="connection-error" role="alert">
              {instanceError}
            </p>
          )}
        </div>
        <label htmlFor="digisac-username">
          Usuário Digisac
          <input
            id="digisac-username"
            autoComplete="username"
            value={username}
            maxLength={254}
            required
            disabled={disabled || pending}
            onChange={(e) => setUsername(e.target.value)}
          />
        </label>
        <div className="connection-password-field">
          <label htmlFor="digisac-password">Senha Digisac</label>
          <div className="password-input">
            <input
              id="digisac-password"
              type={passwordVisible ? 'text' : 'password'}
              autoComplete="current-password"
              value={password}
              maxLength={1024}
              required
              disabled={disabled || pending}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button
              type="button"
              className="password-toggle"
              aria-label={passwordVisible ? 'Ocultar senha' : 'Mostrar senha'}
              aria-controls="digisac-password"
              title={passwordVisible ? 'Ocultar senha' : 'Mostrar senha'}
              disabled={disabled || pending}
              onClick={() => setPasswordVisible((visible) => !visible)}
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.65"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
                <circle cx="12" cy="12" r="3" />
                {passwordVisible && <path d="m3 3 18 18" />}
              </svg>
            </button>
          </div>
        </div>
        <button
          className="primary"
          type="submit"
          disabled={
            disabled ||
            pending ||
            checking ||
            Boolean(verified && verified.origins.length > 1 && !selectedOrigin)
          }
        >
          {checking
            ? 'Verificando instância…'
            : pending
              ? 'Conectando…'
              : standalone
                ? 'Conectar à Digisac'
                : 'Conectar e carregar departamentos'}
        </button>
      </form>
      <p className="field-help">
        Sua senha é usada apenas para conectar à Digisac.
      </p>
      {error && (
        <p className="connection-error" role="alert">
          {error}
        </p>
      )}
    </>
  );
  return standalone ? (
    <section
      className="connection-panel connection-standalone"
      aria-label="Conexão com a Digisac"
    >
      {contents}
    </section>
  ) : (
    <details
      className="connection-panel"
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary>Conectar à Digisac</summary>
      {contents}
    </details>
  );
}
