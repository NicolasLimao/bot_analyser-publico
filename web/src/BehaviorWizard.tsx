import { useEffect, useRef, useState } from 'react';
import { BehaviorQuestion, BehaviorReview } from './BehaviorSettings.tsx';
import type { BehaviorProps } from './BehaviorSettings.tsx';
import { behaviorRules } from './behavior-model.ts';
import type { BehaviorRule } from './behavior-model.ts';
import { ThemeToggle } from './ThemeToggle.tsx';

export function BehaviorWizard({
  initialRule,
  onClose,
  ...props
}: BehaviorProps & {
  initialRule?: BehaviorRule;
  onClose: () => void;
}) {
  const [stage, setStage] = useState(() =>
    Math.max(
      0,
      behaviorRules.findIndex((rule) => rule.id === initialRule),
    ),
  );
  const [reviewing, setReviewing] = useState(false);
  const [saving, setSaving] = useState(false);
  const title = useRef<HTMLHeadingElement>(null);
  const rule = behaviorRules[stage];
  useEffect(() => {
    title.current?.focus();
    window.scrollTo(0, 0);
  }, [stage]);
  return (
    <main className="guided-builder behavior-wizard">
      <header className="guided-topbar">
        <strong>Regras do atendimento</strong>
        <ThemeToggle />
        <button
          type="button"
          className="text-button"
          onClick={onClose}
          disabled={saving}
        >
          Voltar ao robô
        </button>
      </header>
      <div className="behavior-wizard-content">
        <div className="guided-progress">
          <span>
            {rule
              ? `Regra ${stage + 1} de ${behaviorRules.length}`
              : 'Revisão das regras'}
          </span>
          <progress
            aria-label="Progresso das regras"
            value={stage + 1}
            max={behaviorRules.length + 1}
          />
        </div>
        <div className="guided-heading">
          <h1 ref={title} tabIndex={-1}>
            {rule?.title ?? 'Confira as regras do seu atendimento'}
          </h1>
          <p>
            {rule?.description ??
              'Você pode alterar qualquer escolha antes de voltar ao robô.'}
          </p>
        </div>
        {rule ? (
          <BehaviorQuestion
            {...props}
            rule={rule.id}
            onSavingChange={setSaving}
          />
        ) : (
          <BehaviorReview
            {...props}
            onEdit={(id) => {
              setReviewing(true);
              setStage(behaviorRules.findIndex((item) => item.id === id));
            }}
          />
        )}
        <footer className="guided-footer">
          <div>
            <button
              type="button"
              className="secondary"
              disabled={saving}
              onClick={() => {
                if (reviewing) {
                  setStage(behaviorRules.length);
                  setReviewing(false);
                } else if (stage > 0) setStage(stage - 1);
                else onClose();
              }}
            >
              Voltar
            </button>
            <button
              type="button"
              className="primary"
              disabled={saving}
              onClick={() => {
                if (!rule) onClose();
                else if (reviewing) {
                  setStage(behaviorRules.length);
                  setReviewing(false);
                } else setStage(stage + 1);
              }}
            >
              {!rule
                ? 'Concluir configuração'
                : reviewing
                  ? 'Voltar à revisão'
                  : stage === behaviorRules.length - 1
                    ? 'Revisar regras'
                    : 'Continuar'}
            </button>
          </div>
        </footer>
        <p className="field-help behavior-save-note">
          Suas escolhas são mantidas ao voltar ao robô. Salve o rascunho para
          continuar depois.
        </p>
      </div>
    </main>
  );
}
