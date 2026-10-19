import { useId, useState } from 'react';
import { TicketInactivityTime } from './TicketInactivityTime.tsx';
import type { Catalog, Draft } from '../../src/domain/types.ts';
import {
  behaviorRules,
  behaviorRuleEnabled,
  behaviorRulePending,
} from './behavior-model.ts';
import type { BehaviorRule } from './behavior-model.ts';

const outsideHoursExample = `Olá {{contact_name}}!
Seja muito bem-vindo(a) ao atendimento digital da Empresa X!

*No momento, não estamos disponíveis. Nosso horário de atendimento é de segunda a sexta-feira, das 08h00 às 18h00.*

Por favor, deixe sua mensagem e, assim que retornarmos ao atendimento, entraremos em contato.

Gratidão!`;

export type BehaviorProps = {
  connectionId?: string;
  onSavingChange?: (saving: boolean) => void;
  draft: Draft;
  catalog: Catalog;
  onRefreshCatalog: () => void;
  refreshingCatalog?: boolean;
  onChange: (draft: Draft) => void;
};

export function BehaviorSettings({
  draft,
  catalog,
  onConfigure,
}: {
  draft: Draft;
  catalog: Catalog;
  onConfigure: () => void;
}) {
  const active = behaviorRules.filter((rule) =>
    behaviorRuleEnabled(draft, rule.id),
  ).length;
  const pending = behaviorRules.filter((rule) =>
    behaviorRulePending(draft, catalog, rule.id),
  ).length;
  return (
    <section
      className="behavior-settings behavior-overview"
      aria-labelledby="behavior-title"
    >
      <div>
        <h2 id="behavior-title">Regras do atendimento</h2>
        <p>
          {active === 0
            ? 'Nenhuma regra ativada.'
            : `${active} regra${active === 1 ? '' : 's'} ativada${active === 1 ? '' : 's'}.`}{' '}
          Configure uma escolha por vez.
        </p>
        {pending > 0 && (
          <p className="behavior-pending" role="status">
            {pending} {pending === 1 ? 'regra precisa' : 'regras precisam'} de
            atenção antes de exportar.
          </p>
        )}
      </div>
      <button
        id="configure-behavior"
        className="secondary"
        onClick={onConfigure}
      >
        Configurar regras
      </button>
    </section>
  );
}

export function BehaviorQuestion({
  draft,
  catalog,
  onRefreshCatalog,
  refreshingCatalog = false,
  onChange,
  rule,
  connectionId,
  onSavingChange,
}: BehaviorProps & { rule: BehaviorRule }) {
  const id = useId();
  const [saving, setSaving] = useState(false);
  const behavior = draft.behavior ?? {
    firstMessageOnly: false,
    stopOnAttendantMessage: true,
  };
  const hours = behavior.businessHours ?? {
    enabled: false,
    closedMessage: outsideHoursExample,
  };
  const inactivity = behavior.ticketInactivity ?? {
    enabled: false,
    message:
      'Olá {{contact_name}}! Estamos encerrando este chamado por falta de interação. Se precisar de ajuda, entre em contato novamente. Agradecemos seu contato!',
  };
  const closing = behavior.afterTicketClosed ?? {
    enabled: false,
    message:
      'Agradecemos seu contato, {{contact_name}}! Seu atendimento foi encerrado. Se precisar de ajuda, fale conosco novamente.',
  };
  const invalidReply = behavior.invalidReply ?? {
    enabled: false,
    message:
      'Não reconheci essa opção. Por favor, escolha uma das opções do menu abaixo.',
  };
  const evaluation = behavior.afterTicketClosedEvaluation ?? {
    enabled: false,
    questionId: null,
  };
  const questions = catalog.questions;
  const selectedQuestion = questions?.items.find(
    (q) => q.id === evaluation.questionId && q.active,
  );
  function update(changes: Partial<NonNullable<Draft['behavior']>>) {
    onChange({ ...draft, behavior: { ...behavior, ...changes } });
  }
  const enabled = behaviorRuleEnabled(draft, rule);
  function setEnabled(value: boolean) {
    switch (rule) {
      case 'firstMessageOnly':
        update({ firstMessageOnly: value });
        break;
      case 'respectHolidays':
        update({ respectHolidays: value });
        break;
      case 'businessHours':
        update({ businessHours: { ...hours, enabled: value } });
        break;
      case 'invalidReply':
        update({ invalidReply: { ...invalidReply, enabled: value } });
        break;
      case 'stopOnAttendantMessage':
        update({ stopOnAttendantMessage: value });
        break;
      case 'ticketInactivity':
        update({ ticketInactivity: { ...inactivity, enabled: value } });
        break;
      case 'afterTicketClosed':
        update({ afterTicketClosed: { ...closing, enabled: value } });
        break;
      case 'afterTicketClosedEvaluation':
        update({
          afterTicketClosedEvaluation: { ...evaluation, enabled: value },
        });
        break;
    }
  }
  const message =
    rule === 'businessHours'
      ? {
          label: 'Mensagem fora do horário',
          value: hours.closedMessage,
          onChange: (value: string) =>
            update({ businessHours: { ...hours, closedMessage: value } }),
        }
      : rule === 'invalidReply'
        ? {
            label: 'Mensagem para resposta inválida',
            value: invalidReply.message,
            onChange: (value: string) =>
              update({ invalidReply: { ...invalidReply, message: value } }),
          }
        : rule === 'ticketInactivity'
          ? {
              label: 'Mensagem de encerramento por inatividade',
              value: inactivity.message,
              onChange: (value: string) =>
                update({ ticketInactivity: { ...inactivity, message: value } }),
            }
          : rule === 'afterTicketClosed'
            ? {
                label: 'Mensagem após fechar o chamado',
                value: closing.message,
                onChange: (value: string) =>
                  update({ afterTicketClosed: { ...closing, message: value } }),
              }
            : undefined;
  const definition = behaviorRules.find((item) => item.id === rule)!;
  return (
    <div className="behavior-question" data-behavior-rule={rule}>
      <fieldset className="behavior-choices" disabled={saving}>
        <legend className="sr-only">{definition.title}</legend>
        {[true, false].map((value) => (
          <label className="behavior-choice" key={String(value)}>
            <input
              type="radio"
              name={`${id}-enabled`}
              value={String(value)}
              checked={enabled === value}
              onChange={() => setEnabled(value)}
            />
            <span>
              <strong>{value ? 'Sim' : 'Não'}</strong>
              <small>{value ? definition.yes : definition.no}</small>
            </span>
          </label>
        ))}
      </fieldset>
      {enabled && rule === 'ticketInactivity' && (
        <TicketInactivityTime
          connectionId={catalog.source === 'digisac' ? connectionId : undefined}
          onSavingChange={(value) => {
            setSaving(value);
            onSavingChange?.(value);
          }}
        />
      )}
      {enabled && message && (
        <div className="behavior-message">
          <label htmlFor={`${id}-message`}>{message.label}</label>
          <textarea
            id={`${id}-message`}
            rows={4}
            maxLength={4000}
            value={message.value}
            aria-invalid={!message.value.trim()}
            aria-describedby={`${id}-message-help`}
            onChange={(event) => message.onChange(event.target.value)}
          />
          <p id={`${id}-message-help`} className="field-help">
            {!message.value.trim()
              ? 'Escreva a mensagem antes de exportar. Você pode continuar e completar depois.'
              : 'Edite a sugestão como preferir. Use {{contact_name}} para incluir o nome do contato.'}
          </p>
        </div>
      )}
      {enabled && rule === 'afterTicketClosedEvaluation' && (
        <div className="behavior-message" aria-busy={refreshingCatalog}>
          <label htmlFor={`${id}-evaluation`}>Avaliação do atendimento</label>
          <select
            id={`${id}-evaluation`}
            value={evaluation.questionId ?? ''}
            disabled={refreshingCatalog || questions?.state !== 'ready'}
            aria-invalid={!selectedQuestion}
            aria-describedby={`${id}-evaluation-help`}
            onChange={(e) =>
              update({
                afterTicketClosedEvaluation: {
                  ...evaluation,
                  questionId: e.target.value || null,
                },
              })
            }
          >
            <option value="">Selecione uma avaliação</option>
            {evaluation.questionId && !selectedQuestion && (
              <option value={evaluation.questionId}>
                Avaliação selecionada indisponível
              </option>
            )}
            {questions?.items
              .filter((q) => q.active)
              .map((q) => (
                <option key={q.id} value={q.id}>
                  {q.name} · {q.type.toUpperCase()}
                </option>
              ))}
          </select>
          <p id={`${id}-evaluation-help`} className="field-help" role="status">
            {refreshingCatalog
              ? 'Consultando avaliações…'
              : questions?.state !== 'ready'
                ? catalog.source === 'snapshot'
                  ? 'Esta cópia local não contém avaliações. Conecte à conta Digisac para consultar.'
                  : 'Não foi possível carregar as avaliações. Atualize o catálogo para tentar novamente.'
                : !questions.items.some((q) => q.active)
                  ? 'Não há avaliações disponíveis. Cadastre uma em Mais opções → Avaliações na Digisac e atualize o catálogo.'
                  : evaluation.questionId && !selectedQuestion
                    ? 'A avaliação selecionada não está disponível nesta conta. Escolha outra; seu rascunho foi preservado.'
                    : !selectedQuestion
                      ? 'Selecione uma avaliação para exportar ou enviar. Você pode salvar o rascunho e completar depois.'
                      : 'Esta escolha vale para este robô. Desativar preserva a seleção. A avaliação sempre será a última ação.'}
          </p>
          {catalog.source === 'digisac' && (
            <button
              type="button"
              className="secondary"
              onClick={onRefreshCatalog}
              disabled={refreshingCatalog}
            >
              Atualizar avaliações
            </button>
          )}
          {selectedQuestion && (
            <div className="evaluation-preview">
              <strong>Pergunta da avaliação</strong>
              <p className="evaluation-question">
                {selectedQuestion.questionMessage}
              </p>
              <p className="field-help">
                Prazo, tentativas e mensagens de resposta são configurados nessa
                avaliação, na Digisac.
              </p>
            </div>
          )}
          {catalog.source === 'simulated' && (
            <p className="field-help">
              Avaliações fictícias para demonstração.
            </p>
          )}
        </div>
      )}
      {definition.help && (
        <details className="guided-details behavior-help">
          <summary>{definition.helpTitle ?? 'Como funciona?'}</summary>
          <p>{definition.help}</p>
        </details>
      )}
    </div>
  );
}

export function BehaviorReview({
  draft,
  catalog,
  onEdit,
}: {
  draft: Draft;
  catalog: Catalog;
  onEdit: (rule: BehaviorRule) => void;
}) {
  return (
    <ul className="behavior-review" aria-label="Revisão das regras">
      {behaviorRules.map((rule) => {
        const enabled = behaviorRuleEnabled(draft, rule.id);
        const pending = behaviorRulePending(draft, catalog, rule.id);
        return (
          <li key={rule.id}>
            <div>
              <strong>{rule.label}</strong>
              <span className={pending ? 'behavior-pending' : ''}>
                {pending ? 'Falta completar' : enabled ? rule.yes : rule.no}
              </span>
            </div>
            <button
              type="button"
              className="text-button"
              aria-label={`Alterar ${rule.label}`}
              onClick={() => onEdit(rule.id)}
            >
              Alterar
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export function BehaviorSummary({
  draft,
  catalog,
}: {
  draft: Draft;
  catalog?: Catalog;
}) {
  const behavior = draft.behavior;
  return (
    <section
      className="behavior-summary"
      aria-label="Resumo das regras do atendimento"
    >
      <h3>Ao iniciar o atendimento</h3>
      <ol>
        {behavior?.firstMessageOnly && (
          <li>Somente na primeira mensagem, incluindo os avisos.</li>
        )}
        {behavior?.respectHolidays && (
          <li>
            Em feriados: mensagem da Digisac e parada, mantendo o chamado
            aberto.
          </li>
        )}
        {behavior?.businessHours?.enabled && (
          <li>
            Fora do horário:{' '}
            {behavior.businessHours.closedMessage.trim() ||
              'Mensagem pendente.'}{' '}
            O robô para e o chamado permanece aberto.
          </li>
        )}
        <li>
          Seguir o roteiro. Retornos locais não repetem as regras de entrada.
        </li>
      </ol>
      {behavior?.invalidReply?.enabled && (
        <>
          <h3>Ao responder aos menus</h3>
          <p>
            Opção inválida:{' '}
            {behavior.invalidReply.message.trim() || 'Mensagem pendente.'}{' '}
            Repetir o mesmo menu e aguardar uma escolha válida. Não se aplica à
            avaliação.
          </p>
        </>
      )}
      {(behavior?.stopOnAttendantMessage ||
        behavior?.ticketInactivity?.enabled ||
        behavior?.afterTicketClosed?.enabled ||
        behavior?.afterTicketClosedEvaluation?.enabled) && (
        <>
          <h3>A qualquer momento</h3>
          {behavior?.stopOnAttendantMessage && (
            <p>
              Mensagem do atendente: parar o robô e manter o chamado aberto.
            </p>
          )}
          {behavior?.ticketInactivity?.enabled && (
            <p>
              Contato sem resposta após mensagem do atendente:{' '}
              {behavior.ticketInactivity.message.trim() || 'Mensagem pendente.'}{' '}
              Depois, fechar o chamado. O prazo é configurado na Digisac.
            </p>
          )}
          {behavior?.afterTicketClosed?.enabled && (
            <p>
              Após fechar o chamado:{' '}
              {behavior.afterTicketClosed.message.trim() ||
                'Mensagem pendente.'}{' '}
              Enviar quando a Digisac informar o fechamento.
            </p>
          )}
          {behavior?.afterTicketClosedEvaluation?.enabled && (
            <p>
              Avaliação após fechar o chamado:{' '}
              {catalog?.questions?.items.find(
                (q) =>
                  q.id === behavior.afterTicketClosedEvaluation!.questionId &&
                  q.active,
              )?.name ?? 'Seleção pendente ou indisponível.'}{' '}
              Enviar por último, após todas as mensagens de pós-fechamento.
            </p>
          )}
        </>
      )}
    </section>
  );
}
