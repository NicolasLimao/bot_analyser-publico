import type { Catalog, Draft } from '../../src/domain/types.ts';

export type BehaviorRule = keyof NonNullable<Draft['behavior']>;

type BehaviorDefinition = {
  id: BehaviorRule;
  label: string;
  title: string;
  description: string;
  yes: string;
  no: string;
  helpTitle?: string;
  help?: string;
};

export const behaviorRules: readonly BehaviorDefinition[] = [
  {
    id: 'firstMessageOnly',
    label: 'Início do robô',
    title: 'Iniciar o robô só na primeira mensagem do chamado?',
    description: 'Escolha quando o robô pode começar o atendimento.',
    yes: 'Iniciar somente na primeira mensagem.',
    no: 'Permitir o início em outras mensagens também.',
    help: 'Essa escolha também vale para os avisos de feriado e de horário. As respostas e os retornos dos menus continuam funcionando.',
  },
  {
    id: 'respectHolidays',
    label: 'Feriados',
    title: 'Respeitar os feriados da sua empresa?',
    description:
      'Nos feriados, o robô pode avisar que sua equipe não está disponível.',
    yes: 'Enviar o aviso de feriado e parar o robô.',
    no: 'Seguir o atendimento normalmente nos feriados.',
    helpTitle: 'De onde vêm os feriados e o aviso?',
    help: 'O calendário e a mensagem são os que já estão configurados na Digisac. O chamado permanece aberto após o aviso.',
  },
  {
    id: 'businessHours',
    label: 'Horário de atendimento',
    title: 'Respeitar o horário de atendimento da sua empresa?',
    description:
      'Fora do expediente, o robô pode enviar um aviso em vez de iniciar o roteiro.',
    yes: 'Enviar uma mensagem e parar fora do horário.',
    no: 'Seguir o atendimento em qualquer horário.',
    helpTitle: 'Onde configuro o horário?',
    help: 'O horário é o que já está configurado na Digisac. Alterar o texto do aviso não muda essa agenda. O chamado permanece aberto. Se feriados também estiverem ativados, o aviso de feriado tem prioridade.',
  },
  {
    id: 'invalidReply',
    label: 'Opções inválidas',
    title: 'Ajudar quem responder com uma opção inválida?',
    description:
      'Por exemplo: o menu tem as opções 1 e 2, mas o contato responde 5.',
    yes: 'Enviar um aviso e mostrar o mesmo menu novamente.',
    no: 'Manter o menu aguardando, sem enviar um aviso.',
    helpTitle: 'Quais respostas recebem o aviso?',
    help: 'Vale para todos os menus e submenus que aguardam uma escolha. A resposta precisa ser exatamente igual à opção: 01 e 1 são diferentes. Essa regra não se aplica às avaliações nem quando o robô já parou.',
  },
  {
    id: 'stopOnAttendantMessage',
    label: 'Atendimento pela equipe',
    title: 'Parar o robô quando um atendente responder?',
    description:
      'Assim, sua equipe pode assumir a conversa sem o robô continuar respondendo.',
    yes: 'Parar o robô e manter o chamado aberto.',
    no: 'Manter o robô funcionando após a mensagem do atendente.',
  },
  {
    id: 'ticketInactivity',
    label: 'Contato sem resposta',
    title: 'Encerrar o chamado quando o contato deixar de responder?',
    description:
      'Depois de uma mensagem da sua equipe, o robô pode avisar e encerrar o chamado por inatividade.',
    yes: 'Enviar um aviso e encerrar após o prazo da empresa.',
    no: 'Não encerrar o chamado por esta regra.',
    helpTitle: 'Como funciona o prazo?',
    help: 'Na conta conectada, consulte e altere o prazo nesta etapa. Ele também fica na Digisac em Mais opções → Empresa → Atendimento → Tempo e inatividade → Tempo de inatividade de chamado (minutos). O prazo é compartilhado pela empresa. A regra só encerra se a mensagem foi enviada pelo atendente. Caso contrário, não envia o aviso nem fecha o chamado. Não é um lembrete de resposta aos menus.',
  },
  {
    id: 'afterTicketClosed',
    label: 'Mensagem de despedida',
    title: 'Enviar uma despedida após fechar o chamado?',
    description:
      'Uma mensagem para agradecer o contato e concluir o atendimento.',
    yes: 'Enviar a mensagem após o fechamento.',
    no: 'Não enviar uma mensagem de despedida.',
    help: 'A mensagem é enviada quando a Digisac informa o fechamento, inclusive nos fechamentos automáticos que gerem esse evento. Se o aviso por inatividade estiver ativo, o contato pode receber o aviso antes de fechar e a despedida depois. Se houver avaliação, a despedida vem antes dela.',
  },
  {
    id: 'afterTicketClosedEvaluation',
    label: 'Avaliação do atendimento',
    title: 'Pedir uma avaliação após fechar o chamado?',
    description:
      'Use uma avaliação da sua conta para saber como foi a experiência do contato.',
    yes: 'Enviar a avaliação por último, depois da despedida.',
    no: 'Não solicitar uma avaliação por este robô.',
    help: 'A avaliação sempre é a última ação. Se não houver despedida, ela é enviada diretamente após o fechamento. Prazo, tentativas e mensagens de resposta são configurados no cadastro da avaliação, na Digisac.',
  },
];

export function behaviorRuleEnabled(draft: Draft, rule: BehaviorRule): boolean {
  const value = draft.behavior?.[rule];
  return typeof value === 'boolean'
    ? value
    : (value?.enabled ?? rule === 'stopOnAttendantMessage');
}

export function behaviorRulePending(
  draft: Draft,
  catalog: Catalog,
  rule: BehaviorRule,
): boolean {
  if (!behaviorRuleEnabled(draft, rule)) return false;
  const value = draft.behavior?.[rule];
  if (value && typeof value === 'object') {
    if ('closedMessage' in value) return !value.closedMessage.trim();
    if ('message' in value) return !value.message.trim();
    return (
      catalog.questions?.state !== 'ready' ||
      !catalog.questions.items.some(
        (q) => q.id === value.questionId && q.active,
      )
    );
  }
  return false;
}
