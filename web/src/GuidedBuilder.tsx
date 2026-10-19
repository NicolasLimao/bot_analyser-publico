import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { Catalog, Draft, Step } from '../../src/domain/types.ts';
import { validateDraft } from '../../src/domain/validate.ts';
import {
  addGuidedOption,
  createGuidedDraft,
  guidedSteps,
  removeGuidedOption,
  replaceCompany,
} from './guided-model.ts';
import type { Template } from './guided-model.ts';
import { GuidedFlowPreview } from './GuidedFlowPreview.tsx';
import {
  BehaviorQuestion,
  BehaviorReview,
  BehaviorSummary,
} from './BehaviorSettings.tsx';
import { behaviorRules } from './behavior-model.ts';
import { ReturnToEntry } from './ReturnToEntry.tsx';
import { ThemeToggle } from './ThemeToggle.tsx';

const templates: { id: Template; title: string; description: string }[] = [
  {
    id: 'standard',
    title: 'Modelo padrão',
    description:
      'Comercial, Suporte e Financeiro, com submenu de compras e vendas.',
  },
  {
    id: 'direct',
    title: 'Atendimento direto',
    description: 'Uma saudação e o encaminhamento para sua equipe.',
  },
  {
    id: 'copy',
    title: 'Usar meu roteiro atual',
    description: 'Uma nova versão do atendimento que você já montou.',
  },
];

export function GuidedBuilder({
  current,
  catalog,
  onRefreshCatalog,
  refreshingCatalog,
  onCancel,
  onCreate,
  renderConversation,
  connectionId,
}: {
  current: Draft;
  catalog: Catalog;
  onRefreshCatalog: () => void;
  refreshingCatalog: boolean;
  onCancel: () => void;
  onCreate: (draft: Draft) => void;
  renderConversation: (draft: Draft) => ReactNode;
  connectionId?: string;
}) {
  const [template, setTemplate] = useState<Template>('standard');
  const [drafts, setDrafts] = useState<Partial<Record<Template, Draft>>>(
    () => ({ standard: createGuidedDraft('standard', current) }),
  );
  const draft = drafts[template]!;
  const steps = guidedSteps(draft);
  const [stage, setStage] = useState(0);
  const [savingCompany, setSavingCompany] = useState(false);
  const [mobileFlow, setMobileFlow] = useState(false);
  const step = steps[stage];
  const node =
    'nodeId' in step
      ? draft.nodes.find((n) => n.id === step.nodeId)
      : undefined;
  const [returnToReview, setReturnToReview] = useState(false);
  const [companies, setCompanies] = useState({
    standard: 'Empresa X',
    direct: 'Empresa X',
    copy: '',
  });
  const [companyValues, setCompanyValues] = useState({
    standard: 'Empresa X',
    direct: 'Empresa X',
    copy: '',
  });
  const companyValue = companyValues[template];
  function setCompanyValue(value: string) {
    setCompanyValues((all) => ({ ...all, [template]: value }));
  }
  const [error, setError] = useState('');
  const title = useRef<HTMLHeadingElement>(null);
  const [optionFocus, setOptionFocus] = useState<string | null>(null);
  useEffect(() => {
    if (!optionFocus) return;
    document.getElementById(`guided-option-${optionFocus}`)?.focus();
    setOptionFocus(null);
  }, [optionFocus]);
  useEffect(() => {
    title.current?.focus();
    window.scrollTo(0, 0);
  }, [stage]);
  function update(next: Draft) {
    setDrafts((all) => ({ ...all, [template]: next }));
  }
  function edit(next: Step) {
    update({
      ...draft,
      nodes: draft.nodes.map((n) => (n.id === next.id ? next : n)),
    });
  }
  function updateOptions(next: Draft) {
    update(next);
    if (step.kind === 'options') {
      setStage(
        guidedSteps(next).findIndex(
          (item) => item.kind === 'options' && item.nodeId === step.nodeId,
        ),
      );
    }
  }
  function select(next: Template) {
    if (!drafts[next])
      setDrafts((all) => ({
        ...all,
        [next]: createGuidedDraft(next, current),
      }));
    setTemplate(next);
  }
  function move(next: number) {
    setError('');
    setMobileFlow(false);
    setStage(next);
  }
  function advance() {
    if (step.kind === 'identity' && template !== 'copy') {
      const company = companyValue.trim();
      if (!company) {
        setError(
          'Informe o nome da empresa ou mantenha o exemplo para continuar.',
        );
        return;
      }
      update(replaceCompany(draft, companies[template], company));
      setCompanies((all) => ({ ...all, [template]: company }));
      setCompanyValue(company);
    }
    if (step.kind === 'test') {
      try {
        onCreate(draft);
      } catch {
        setError(
          'Não foi possível guardar o roteiro atual. Sua edição continua aqui; tente novamente quando o armazenamento estiver disponível.',
        );
      }
    } else {
      move(returnToReview ? steps.length - 2 : stage + 1);
      setReturnToReview(false);
    }
  }
  const diagnostics = validateDraft(draft, catalog);
  const previewDraft =
    step.kind === 'identity' && template !== 'copy' && companyValue.trim()
      ? replaceCompany(draft, companies[template], companyValue.trim())
      : draft;
  const behaviorRule =
    step.kind === 'behavior'
      ? behaviorRules.find((rule) => rule.id === step.rule)
      : undefined;
  const headings = {
    template: 'Qual modelo combina com seu atendimento?',
    identity: 'Como vamos chamar seu atendimento?',
    message: 'O que o contato vai receber?',
    options: 'Quais opções o contato pode escolher?',
    department: 'Quem recebe este atendimento?',
    behavior: behaviorRule?.title ?? 'Regras do atendimento',
    review: 'Tudo pronto para testar?',
    test: 'Experimente seu atendimento.',
  };
  const descriptions = {
    template: 'Escolha uma base com textos e opções prontos.',
    identity: 'Troque os exemplos pelas suas informações.',
    message: `${step.label}. Mantenha a sugestão ou escreva do seu jeito.`,
    options:
      'Edite, adicione ou remova opções deste menu. Escolha os departamentos nas próximas etapas.',
    department: `${step.label}. Escolha o departamento de destino.`,
    behavior: behaviorRule?.description ?? '',
    review: 'Confira suas escolhas. Você pode voltar a qualquer resposta.',
    test: 'Responda como um contato e percorra os caminhos.',
  };
  const primaryLabel = returnToReview
    ? 'Voltar à revisão'
    : step.kind === 'template'
      ? 'Personalizar este modelo'
      : step.kind === 'review'
        ? 'Testar conversa'
        : step.kind === 'test'
          ? 'Criar meu rascunho'
          : steps[stage + 1]?.kind === 'review'
            ? 'Conferir meu fluxo'
            : 'Continuar';
  return (
    <main className="guided-builder">
      <header className="guided-topbar">
        <strong>bot_analyser</strong>
        <ThemeToggle />
        <button
          className="text-button"
          onClick={onCancel}
          disabled={savingCompany}
        >
          Voltar ao roteiro atual
        </button>
      </header>
      {step.kind !== 'behavior' && (
        <div
          className="guided-view-switch"
          aria-label="Visualização do assistente"
        >
          <button
            className={!mobileFlow ? 'primary' : 'secondary'}
            aria-pressed={!mobileFlow}
            onClick={() => setMobileFlow(false)}
          >
            Preencher etapa
          </button>
          <button
            className={mobileFlow ? 'primary' : 'secondary'}
            aria-pressed={mobileFlow}
            onClick={() => setMobileFlow(true)}
          >
            Ver fluxo
          </button>
        </div>
      )}
      <div
        className={`guided-workspace${mobileFlow ? ' flow-visible' : ''}${step.kind === 'behavior' ? ' rules-workspace' : ''}`}
      >
        <div className="guided-focus">
          <div className="guided-progress">
            <span>
              Etapa {stage + 1} de {steps.length}
            </span>
            <progress
              aria-label="Progresso da criação"
              value={stage + 1}
              max={steps.length}
            />
          </div>
          <div className="guided-heading">
            {step.kind === 'behavior' && (
              <p className="behavior-eyebrow">
                Regras do atendimento ·{' '}
                {behaviorRules.findIndex((rule) => rule.id === step.rule) + 1}{' '}
                de {behaviorRules.length}
              </p>
            )}
            <h1 ref={title} tabIndex={-1}>
              {headings[step.kind]}
            </h1>
            <p>{descriptions[step.kind]}</p>
          </div>
          <section
            className="guided-fields"
            aria-label={step.label}
            key={`${template}-${stage}`}
          >
            {step.kind === 'template' && (
              <>
                <div
                  className="template-list"
                  aria-label="Modelos de atendimento"
                >
                  {templates.map((item) => (
                    <button
                      key={item.id}
                      className="template-choice"
                      aria-pressed={template === item.id}
                      onClick={() => select(item.id)}
                    >
                      <span className="template-radio" aria-hidden="true" />
                      <span>
                        <strong>{item.title}</strong>
                        <span>{item.description}</span>
                      </span>
                    </button>
                  ))}
                </div>
                <details className="guided-details">
                  <summary>O que está incluído?</summary>
                  <p>
                    Mensagens, menus, transferências e regras do atendimento.
                    Você configura cada escolha em uma etapa e testa a conversa
                    antes de concluir.
                  </p>
                </details>
              </>
            )}
            {step.kind === 'identity' && (
              <>
                {template !== 'copy' && (
                  <>
                    <label htmlFor="guided-company">Nome da empresa</label>
                    <input
                      id="guided-company"
                      value={companyValue}
                      maxLength={120}
                      onChange={(e) => setCompanyValue(e.target.value)}
                      aria-describedby="company-help"
                    />
                    <p className="field-help" id="company-help">
                      Ao continuar, substituímos “{companies[template]}” nos
                      textos do modelo.
                    </p>
                  </>
                )}
                <label htmlFor="guided-name">Nome do robô</label>
                <input
                  id="guided-name"
                  value={draft.name}
                  maxLength={200}
                  onChange={(e) => update({ ...draft, name: e.target.value })}
                />
              </>
            )}
            {step.kind === 'message' &&
              node &&
              (node.kind === 'menu' || node.kind === 'message') && (
                <>
                  <label htmlFor="guided-message">
                    Mensagem de {step.label}
                  </label>
                  <textarea
                    id="guided-message"
                    rows={5}
                    maxLength={4000}
                    value={node.kind === 'menu' ? node.message : node.text}
                    onChange={(e) =>
                      edit(
                        node.kind === 'menu'
                          ? { ...node, message: e.target.value }
                          : { ...node, text: e.target.value },
                      )
                    }
                  />
                  <details className="guided-details">
                    <summary>Como usar o nome do contato?</summary>
                    <p>
                      Mantenha {'{{contact_name}}'} na mensagem. O robô
                      substitui essa variável pelo nome do contato.
                    </p>
                  </details>
                </>
              )}
            {step.kind === 'options' && node?.kind === 'menu' && (
              <>
                {node.options.map((option, index) => (
                  <div className="guided-option" key={option.id}>
                    <div className="guided-option-heading">
                      <label htmlFor={`guided-option-${option.id}`}>
                        Opção {option.value}
                      </label>
                      <button
                        type="button"
                        className="danger-link"
                        aria-label={`Remover opção ${option.value}`}
                        disabled={node.options.length <= 1}
                        onClick={() => {
                          updateOptions(
                            removeGuidedOption(draft, node.id, option.id),
                          );
                          setOptionFocus(
                            node.options[index + 1]?.id ??
                              node.options[index - 1]?.id ??
                              null,
                          );
                        }}
                      >
                        Remover
                      </button>
                    </div>
                    <input
                      id={`guided-option-${option.id}`}
                      aria-label={`Opção ${option.value} de ${node.name || step.label}`}
                      maxLength={200}
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
                ))}
                <button
                  type="button"
                  className="secondary guided-add-option"
                  disabled={
                    node.options.length >= 20 ||
                    draft.nodes.length +
                      (draft.nodes.some((item) => item.kind === 'stop')
                        ? 1
                        : 2) >
                      200
                  }
                  onClick={() => {
                    const next = addGuidedOption(draft, node.id);
                    updateOptions(next);
                    const menu = next.nodes.find((item) => item.id === node.id);
                    if (menu?.kind === 'menu')
                      setOptionFocus(menu.options.at(-1)!.id);
                  }}
                >
                  Adicionar opção
                </button>
                <ReturnToEntry
                  draft={draft}
                  menuId={node.id}
                  onChange={updateOptions}
                />
                <p className="field-help">
                  Mantenha de 1 a 20 opções por menu.
                </p>
              </>
            )}
            {step.kind === 'department' && node?.kind === 'transfer' && (
              <>
                <label htmlFor="guided-department">Departamento</label>
                <select
                  id="guided-department"
                  value={node.departmentId}
                  onChange={(e) =>
                    edit({
                      ...node,
                      departmentId: e.target.value,
                      userId: null,
                    })
                  }
                >
                  <option value="">Escolher depois</option>
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
                <p className="field-help">
                  {catalog.departments.some((d) => d.active)
                    ? 'Você pode usar a mesma equipe em mais de um caminho.'
                    : 'Não há departamentos ativos neste catálogo. Você pode escolher depois de conectar sua conta.'}
                </p>
                <label htmlFor="guided-user">Atendente opcional</label>
                <select
                  id="guided-user"
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
                <p className="field-help">
                  {!node.departmentId
                    ? 'Escolha o departamento para ver os atendentes.'
                    : catalog.users.some(
                          (u) =>
                            u.active &&
                            u.departmentIds.includes(node.departmentId),
                        )
                      ? 'Deixe sem atendente para encaminhar à equipe do departamento.'
                      : 'Não há atendentes disponíveis vinculados a este departamento. A transferência pode seguir para a equipe.'}
                </p>
              </>
            )}
            {step.kind === 'behavior' && (
              <BehaviorQuestion
                connectionId={connectionId}
                onSavingChange={setSavingCompany}
                rule={step.rule}
                draft={draft}
                catalog={catalog}
                onRefreshCatalog={onRefreshCatalog}
                refreshingCatalog={refreshingCatalog}
                onChange={update}
              />
            )}
            {step.kind === 'review' && (
              <div className="guided-summary" aria-label="Revisão do roteiro">
                <h2>{draft.name || 'Seu atendimento'}</h2>
                <details className="guided-details">
                  <summary>Ver funções ativadas</summary>
                  <BehaviorSummary draft={draft} catalog={catalog} />
                </details>
                <p>
                  {diagnostics.length
                    ? `${diagnostics.length} pendência${diagnostics.length === 1 ? '' : 's'} para resolver antes de exportar ou enviar.`
                    : 'Roteiro conectado e pronto para testar.'}
                </p>
                {diagnostics.length > 0 && (
                  <details className="guided-details">
                    <summary>Ver pendências</summary>
                    <ul>
                      {diagnostics.map((d, i) => (
                        <li key={i}>{d.message}</li>
                      ))}
                    </ul>
                    <p>Você pode criar o rascunho e completar depois.</p>
                  </details>
                )}
                <details className="guided-details">
                  <summary>Revisar regras do atendimento</summary>
                  <BehaviorReview
                    draft={draft}
                    catalog={catalog}
                    onEdit={(rule) => {
                      setReturnToReview(true);
                      move(
                        steps.findIndex(
                          (item) =>
                            item.kind === 'behavior' && item.rule === rule,
                        ),
                      );
                    }}
                  />
                </details>
                <details className="guided-details">
                  <summary>Revisar minhas respostas</summary>
                  <ul className="guided-answer-list">
                    {steps.slice(1, -2).map((item, index) =>
                      item.kind === 'behavior' ? null : (
                        <li key={index}>
                          <span>
                            {item.kind === 'message'
                              ? 'Mensagem · '
                              : item.kind === 'department'
                                ? 'Destino · '
                                : ''}
                            {item.label}
                          </span>
                          <button
                            className="text-button"
                            aria-label={`Editar ${item.label}`}
                            onClick={() => {
                              setReturnToReview(true);
                              move(index + 1);
                            }}
                          >
                            Editar
                          </button>
                        </li>
                      ),
                    )}
                  </ul>
                </details>
              </div>
            )}
            {step.kind === 'test' && (
              <div className="guided-test">{renderConversation(draft)}</div>
            )}
          </section>
          {error && (
            <p className="guided-error" role="alert">
              {error}
            </p>
          )}
          <footer className="guided-footer">
            <div>
              {stage > 0 && (
                <button
                  className="secondary"
                  disabled={savingCompany}
                  onClick={() => {
                    move(returnToReview ? steps.length - 2 : stage - 1);
                    setReturnToReview(false);
                  }}
                >
                  Voltar
                </button>
              )}
              <button
                className="primary"
                onClick={advance}
                disabled={savingCompany}
              >
                {primaryLabel}
              </button>
            </div>
          </footer>
          {step.kind === 'test' && (
            <p className="field-help guided-save-note">
              Seu roteiro anterior fica guardado até você salvar o novo.
            </p>
          )}
        </div>
        <GuidedFlowPreview
          draft={previewDraft}
          catalog={catalog}
          activeNodeId={node?.id}
          mobileVisible={mobileFlow}
        />
      </div>
    </main>
  );
}
