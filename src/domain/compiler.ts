import { createHash } from 'node:crypto';
import type {
  Action,
  BotPreview,
  Catalog,
  CompileResult,
  Condition,
  Context,
  Draft,
  FlowEdge,
  FlowNode,
  Rule,
} from './types.ts';
import { validateDraft } from './validate.ts';
import { menuText } from './presentation.ts';
import { serializeContexts } from './serialize-contexts.ts';

export const PROFILE = 'digisac-v3-observed-triage-0.8';
const TYPE = {
  menu: 'MESSAGE_NODE',
  message: 'MESSAGE_NODE',
  transfer: 'TRANSFER_TICKET_NODE',
  stop: 'DEAD_END_NODE',
} as const;
const EVENT_NAMES: Record<string, string> = {
  ENTER_CONTEXT: 'Entrar no contexto',
  MESSAGE_RECEIVED: 'Recebimento de mensagem',
  USER_MESSAGE_SENT: 'Envio de mensagem pelo atendente',
  TICKET_INACTIVE: 'Chamado inativo',
  TICKET_CLOSED: 'Após fechamento de chamado',
};
const ACTION_NAMES: Record<string, string> = {
  SET_CONTEXT: 'Definir contexto',
  SEND_MESSAGE: 'Enviar mensagem',
  TRANSFER_TICKET: 'Transferir chamado',
  CLOSE_TICKET: 'Fechar chamado',
  SEND_QUESTION: 'Avaliação',
};

// RFC 4122 UUID v5, fixed DNS namespace plus an application-specific name.
function uuid(...parts: string[]): string {
  const namespace = Buffer.from('6ba7b8109dad11d180b400c04fd430c8', 'hex');
  const digest = createHash('sha1')
    .update(namespace)
    .update(JSON.stringify(['bot_analyser', PROFILE, ...parts]))
    .digest()
    .subarray(0, 16);
  digest[6] = (digest[6] & 0x0f) | 0x50;
  digest[8] = (digest[8] & 0x3f) | 0x80;
  const h = digest.toString('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
function action(value: string, data: Record<string, unknown>): Action {
  return { type: { value, name: ACTION_NAMES[value] }, data };
}
function rule(actions: Action[], conditions: Condition[] = []): Rule {
  return { title: '', actions, fallbackActions: [], conditions };
}
function trigger(type: string, rules: Rule[]): Context['triggers'][number] {
  return { trigger: { type, name: EVENT_NAMES[type] }, rules };
}

export function compilePreview(
  input: unknown,
  catalogInput: unknown,
  now = Date.now(),
): CompileResult {
  const diagnostics = validateDraft(input, catalogInput, now);
  const warnings = [
    'NOT_HOMOLOGATED',
    'MINIMAL_RESOURCE_SHAPE',
    'OTHER_GLOBAL_RULES_NOT_IMPLEMENTED',
  ];
  if (diagnostics.length)
    return { status: 'invalid', importReady: false, diagnostics, warnings };
  const draft = input as Draft;
  const invalidReply = draft.behavior?.invalidReply;
  if (invalidReply?.enabled)
    warnings.push('MENU_RESPONSE_MAPPING_NOT_HOMOLOGATED');
  const catalog = catalogInput as Catalog;
  if (catalog.source === 'simulated') warnings.push('SIMULATED_CATALOG');
  if (catalog.source === 'snapshot') warnings.push('LOCAL_CATALOG_SNAPSHOT');
  const seed = [draft.accountId, draft.id];
  const nodeIds = new Map(
    draft.nodes.map((n) => [
      n.id,
      `${TYPE[n.kind]}_${uuid(...seed, 'node', n.id)}`,
    ]),
  );
  const startId = `START_NODE_${uuid(...seed, 'start')}`;
  const triggerId = `TRIGGER_NODE_${uuid(...seed, 'trigger')}`;
  const flowNodes: FlowNode[] = [
    { id: startId, type: 'START_NODE', data: {}, position: { x: 0, y: 0 } },
    {
      id: triggerId,
      type: 'TRIGGER_NODE',
      position: { x: 380, y: 0 },
      data: {
        trigger: {
          name: EVENT_NAMES.MESSAGE_RECEIVED,
          type: 'MESSAGE_RECEIVED',
        },
        timeUnit: 'minutes',
        inactivityTime: null,
        followUpMessages: [],
        continuityAttempts: 0,
        useDifferentMessages: false,
      },
    },
  ];
  const edges: FlowEdge[] = [];
  const connect = (source: string, target: string, sourceHandle = 'OUTPUT') => {
    edges.push({
      id: `reactflow__edge-${source}${sourceHandle}-${target}INPUT`,
      source,
      target,
      sourceHandle,
      targetHandle: 'INPUT',
    });
  };
  connect(startId, triggerId);
  const entryId = nodeIds.get(draft.entryNodeId)!;
  const firstOnly = draft.behavior?.firstMessageOnly ?? false;
  const holiday = draft.behavior?.respectHolidays ?? false;
  const hours = draft.behavior?.businessHours;
  const guardId = (key: string) => `CONDITION_NODE_${uuid(...seed, key)}`;
  const firstId = guardId('first-message');
  const holidayId = guardId('holiday');
  const hoursId = guardId('business-hours');
  const afterHoliday = hours?.enabled ? hoursId : entryId;
  const afterFirst = holiday ? holidayId : afterHoliday;
  const initial = firstOnly ? firstId : afterFirst;
  connect(triggerId, initial);
  const contexts: Context[] = [
    {
      id: '@INIT',
      name: 'Contexto inicial',
      triggers: [
        trigger('MESSAGE_RECEIVED', [
          rule([action('SET_CONTEXT', { context: initial })]),
        ]),
      ],
    },
    { id: '@EVERY', name: 'Contexto persistente', triggers: [] },
    { id: '@FALLBACK', name: 'Contexto de contingência', triggers: [] },
  ];
  const addStop = (id: string, x: number, y: number) => {
    flowNodes.push({ id, type: 'DEAD_END_NODE', data: {}, position: { x, y } });
    contexts.push({ id, name: id, triggers: [trigger('ENTER_CONTEXT', [])] });
  };
  let entryX = 760;
  const addGuard = (
    id: string,
    variable: string,
    name: string,
    yes: string,
    no: string | undefined,
    position?: { x: number; y: number },
  ) => {
    const condition = {
      variable: { value: variable, name },
      operator: { value: '$eq', name: 'Igual' },
      target: 'true',
    };
    flowNodes.push({
      id,
      type: 'CONDITION_NODE',
      position: position ?? { x: entryX, y: 0 },
      data: {
        conditionType: 'and',
        conditions: [
          {
            ...condition,
            variable: { ...condition.variable, type: 'boolean' },
            operator: { ...condition.operator, type: 'string' },
          },
        ],
      },
    });
    const branch = rule(
      [action('SET_CONTEXT', { context: yes })],
      [{ $and: [condition] }],
    );
    if (no) branch.fallbackActions = [action('SET_CONTEXT', { context: no })];
    contexts.push({
      id,
      name: id,
      triggers: [trigger('ENTER_CONTEXT', [branch])],
    });
    connect(id, yes, 'OUTPUT_TRUE');
    if (no) connect(id, no, 'OUTPUT_FALSE');
    if (!position) entryX += 380;
  };
  const notice = (key: string, text: string, holidayNotice = false) => {
    const type = holidayNotice ? 'SEND_HOLIDAY_MESSAGE_NODE' : 'MESSAGE_NODE';
    const id = `${type}_${uuid(...seed, key, 'notice')}`;
    const stop = `DEAD_END_NODE_${uuid(...seed, key, 'stop')}`;
    flowNodes.push({
      id,
      type,
      position: { x: entryX, y: -720 },
      data: holidayNotice
        ? {}
        : {
            file: null,
            text,
            answers: [],
            hasAnswers: false,
            waitForResponse: false,
          },
    });
    contexts.push({
      id,
      name: id,
      triggers: [
        trigger('ENTER_CONTEXT', [
          rule([
            action('SEND_MESSAGE', { text }),
            action('SET_CONTEXT', { context: stop }),
          ]),
        ]),
      ],
    });
    addStop(stop, entryX, -360);
    connect(id, stop);
    return id;
  };
  if (firstOnly) {
    const stop = `DEAD_END_NODE_${uuid(...seed, 'not-first-message')}`;
    addStop(stop, entryX, -360);
    addGuard(
      firstId,
      'is_first_ticket_message',
      'É primeira mensagem do chamado',
      afterFirst,
      stop,
    );
  }
  if (holiday) {
    const message = notice('holiday', '@botOnHoliday', true);
    addGuard(holidayId, 'is_holiday', 'É feriado', message, afterHoliday);
  }
  if (hours?.enabled) {
    const message = notice('business-hours', hours.closedMessage);
    addGuard(
      hoursId,
      'is_company_open',
      'Dentro do horário de atendimento',
      entryId,
      message,
    );
  }
  const inactivity = draft.behavior?.ticketInactivity;
  const closing = draft.behavior?.afterTicketClosed;
  const evaluation = draft.behavior?.afterTicketClosedEvaluation;
  const persistentId = `PERSISTENT_START_NODE_${uuid(...seed, 'persistent')}`;
  if (
    draft.behavior?.stopOnAttendantMessage ||
    inactivity?.enabled ||
    closing?.enabled ||
    evaluation?.enabled
  ) {
    flowNodes.push({
      id: persistentId,
      type: 'PERSISTENT_START_NODE',
      data: {},
      position: { x: 0, y: 720 },
    });
  }
  if (draft.behavior?.stopOnAttendantMessage) {
    const attendantTriggerId = `TRIGGER_NODE_${uuid(...seed, 'attendant-trigger')}`;
    const stopId = `DEAD_END_NODE_${uuid(...seed, 'attendant-stop')}`;
    flowNodes.push({
      id: attendantTriggerId,
      type: 'TRIGGER_NODE',
      position: { x: 380, y: 720 },
      data: {
        ...flowNodes[1].data,
        trigger: {
          type: 'USER_MESSAGE_SENT',
          name: EVENT_NAMES.USER_MESSAGE_SENT,
        },
      },
    });
    contexts
      .find((c) => c.id === '@EVERY')!
      .triggers.push(
        trigger('USER_MESSAGE_SENT', [
          rule([action('SET_CONTEXT', { context: stopId })]),
        ]),
      );
    addStop(stopId, 760, 720);
    connect(persistentId, attendantTriggerId);
    connect(attendantTriggerId, stopId);
  }
  if (inactivity?.enabled) {
    const eventId = `TRIGGER_NODE_${uuid(...seed, 'ticket-inactive-trigger')}`;
    const conditionId = guardId('ticket-inactive-condition');
    const messageId = `MESSAGE_NODE_${uuid(...seed, 'ticket-inactive-message')}`;
    const closeId = `CLOSE_TICKET_NODE_${uuid(...seed, 'ticket-inactive-close')}`;
    const y = Math.max(1080, Math.ceil(draft.nodes.length / 4) * 360 + 360);
    flowNodes.push({
      id: eventId,
      type: 'TRIGGER_NODE',
      position: { x: 380, y },
      data: {
        ...flowNodes[1].data,
        trigger: { type: 'TICKET_INACTIVE', name: EVENT_NAMES.TICKET_INACTIVE },
      },
    });
    contexts
      .find((c) => c.id === '@EVERY')!
      .triggers.push(
        trigger('TICKET_INACTIVE', [
          rule([action('SET_CONTEXT', { context: conditionId })]),
        ]),
      );
    connect(persistentId, eventId);
    connect(eventId, conditionId);
    addGuard(
      conditionId,
      'is_message_from_me',
      'Mensagem foi enviada pelo atendente',
      messageId,
      undefined,
      { x: 760, y },
    );
    flowNodes.push(
      {
        id: messageId,
        type: 'MESSAGE_NODE',
        position: { x: 1140, y },
        data: {
          file: null,
          text: inactivity.message,
          answers: [],
          hasAnswers: false,
          waitForResponse: false,
        },
      },
      {
        id: closeId,
        type: 'CLOSE_TICKET_NODE',
        position: { x: 1520, y },
        data: {},
      },
    );
    contexts.push(
      {
        id: messageId,
        name: messageId,
        triggers: [
          trigger('ENTER_CONTEXT', [
            rule([
              action('SEND_MESSAGE', { text: inactivity.message }),
              action('SET_CONTEXT', { context: closeId }),
            ]),
          ]),
        ],
      },
      {
        id: closeId,
        name: closeId,
        triggers: [
          trigger('ENTER_CONTEXT', [
            rule([action('CLOSE_TICKET', { ticketTopics: [] })]),
          ]),
        ],
      },
    );
    connect(messageId, closeId);
  }
  if (closing?.enabled || evaluation?.enabled) {
    const eventId = `TRIGGER_NODE_${uuid(...seed, 'ticket-closed-trigger')}`;
    const messageId = `MESSAGE_NODE_${uuid(...seed, 'ticket-closed-message')}`;
    const evaluationId = `SEND_QUESTION_NODE_${uuid(...seed, 'ticket-closed-evaluation')}`;
    const targetId = closing?.enabled ? messageId : evaluationId;
    const y = Math.max(1440, Math.ceil(draft.nodes.length / 4) * 360 + 720);
    flowNodes.push({
      id: eventId,
      type: 'TRIGGER_NODE',
      position: { x: 380, y },
      data: {
        ...flowNodes[1].data,
        trigger: { type: 'TICKET_CLOSED', name: EVENT_NAMES.TICKET_CLOSED },
      },
    });
    if (closing?.enabled) {
      flowNodes.push({
        id: messageId,
        type: 'MESSAGE_NODE',
        position: { x: 760, y },
        data: {
          file: null,
          text: closing.message,
          answers: [],
          hasAnswers: false,
          waitForResponse: false,
        },
      });
      const actions = [action('SEND_MESSAGE', { text: closing.message })];
      if (evaluation?.enabled) {
        actions.push(action('SET_CONTEXT', { context: evaluationId }));
        connect(messageId, evaluationId);
      }
      contexts.push({
        id: messageId,
        name: messageId,
        triggers: [trigger('ENTER_CONTEXT', [rule(actions)])],
      });
    }
    if (evaluation?.enabled) {
      const selected = catalog.questions!.items.find(
        (q) => q.id === evaluation.questionId,
      )!;
      const { active: _active, ...fields } = selected;
      const question = { ...fields, deletedAt: null };
      flowNodes.push({
        id: evaluationId,
        type: 'SEND_QUESTION_NODE',
        position: { x: closing?.enabled ? 1140 : 760, y },
        data: { question },
      });
      // Evaluation owns the remainder of the interaction. Never append a
      // context change or another action after SEND_QUESTION.
      contexts.push({
        id: evaluationId,
        name: evaluationId,
        triggers: [
          trigger('ENTER_CONTEXT', [
            rule([action('SEND_QUESTION', { question })]),
          ]),
        ],
      });
    }
    contexts
      .find((c) => c.id === '@EVERY')!
      .triggers.push(
        trigger('TICKET_CLOSED', [
          rule([action('SET_CONTEXT', { context: targetId })]),
        ]),
      );
    connect(persistentId, eventId);
    connect(eventId, targetId);
  }
  const departments = new Map(catalog.departments.map((d) => [d.id, d]));
  const users = new Map(catalog.users.map((u) => [u.id, u]));
  const sorted = [...draft.nodes].sort((a, b) =>
    a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
  );
  let guardedMenuIndex = 0;
  for (const [index, node] of sorted.entries()) {
    const id = nodeIds.get(node.id)!;
    const context: Context = { id, name: id, triggers: [] };
    let data: Record<string, unknown>;
    if (node.kind === 'stop') {
      data = {};
      context.triggers = [trigger('ENTER_CONTEXT', [])];
    } else if (node.kind === 'transfer') {
      const department = departments.get(node.departmentId)!;
      const user = node.userId === null ? null : users.get(node.userId)!;
      data = {
        department: {
          id: department.id,
          name: department.name,
          accountId: catalog.accountId,
        },
        user: user
          ? { id: user.id, name: user.name, accountId: catalog.accountId }
          : null,
      };
      const next = nodeIds.get(node.next)!;
      // The observed action omits user when no specific attendant was selected.
      const actionData = user ? data : { department: data.department };
      context.triggers = [
        trigger('ENTER_CONTEXT', [
          rule([
            action('TRANSFER_TICKET', actionData),
            action('SET_CONTEXT', { context: next }),
          ]),
        ]),
      ];
      connect(id, next);
    } else {
      const message = node.kind === 'menu' ? menuText(node) : node.text;
      const answers =
        node.kind === 'menu'
          ? node.options.map((o) => ({
              id: uuid(...seed, 'option', node.id, o.id),
              text: o.value,
            }))
          : [];
      data = {
        file: null,
        text: message,
        answers,
        hasAnswers: node.kind === 'menu',
        waitForResponse: false,
      };
      const actions = [action('SEND_MESSAGE', { text: message })];
      if (node.kind === 'message') {
        const next = nodeIds.get(node.next)!;
        actions.push(action('SET_CONTEXT', { context: next }));
        connect(id, next);
      }
      context.triggers.push(trigger('ENTER_CONTEXT', [rule(actions)]));
      if (node.kind === 'menu' && invalidReply?.enabled) {
        // A waiting message routes the received text through explicit equality
        // branches. Never attach a fallback to each option: that would send
        // warnings even when another option matches. This composed mapping
        // still requires a platform re-export/round-trip (SPEC-013).
        data.answers = [];
        data.hasAnswers = false;
        data.waitForResponse = true;
        const branchIds = node.options.map(
          (o) =>
            `CONDITION_NODE_${uuid(...seed, 'menu-choice', node.id, o.id)}`,
        );
        const noticeId = `MESSAGE_NODE_${uuid(...seed, 'invalid-reply', node.id)}`;
        const y = (Math.ceil(sorted.length / 4) + guardedMenuIndex++) * 360;
        context.triggers.push(
          trigger('MESSAGE_RECEIVED', [
            rule([action('SET_CONTEXT', { context: branchIds[0] })]),
          ]),
        );
        connect(id, branchIds[0]);
        node.options.forEach((option, i) => {
          const yes = nodeIds.get(option.target)!;
          const no = branchIds[i + 1] ?? noticeId;
          const condition = {
            variable: { value: 'message_text', name: 'Texto da mensagem' },
            operator: { value: '$eq', name: 'Igual' },
            target: option.value,
          };
          const branch = rule(
            [action('SET_CONTEXT', { context: yes })],
            [{ $and: [condition] }],
          );
          branch.fallbackActions = [action('SET_CONTEXT', { context: no })];
          contexts.push({
            id: branchIds[i],
            name: branchIds[i],
            triggers: [trigger('ENTER_CONTEXT', [branch])],
          });
          flowNodes.push({
            id: branchIds[i],
            type: 'CONDITION_NODE',
            position: { x: entryX + i * 380, y },
            data: {
              conditionType: 'and',
              conditions: [
                {
                  ...condition,
                  variable: { ...condition.variable, type: 'string' },
                  operator: { ...condition.operator, type: 'string' },
                },
              ],
            },
          });
          connect(branchIds[i], yes, 'OUTPUT_TRUE');
          connect(branchIds[i], no, 'OUTPUT_FALSE');
        });
        flowNodes.push({
          id: noticeId,
          type: 'MESSAGE_NODE',
          position: { x: entryX + node.options.length * 380, y },
          data: {
            file: null,
            text: invalidReply.message,
            answers: [],
            hasAnswers: false,
            waitForResponse: false,
          },
        });
        contexts.push({
          id: noticeId,
          name: noticeId,
          triggers: [
            trigger('ENTER_CONTEXT', [
              rule([
                action('SEND_MESSAGE', { text: invalidReply.message }),
                action('SET_CONTEXT', { context: id }),
              ]),
            ]),
          ],
        });
        connect(noticeId, id);
      } else if (node.kind === 'menu') {
        context.triggers.push(
          trigger(
            'MESSAGE_RECEIVED',
            node.options.map((option, i) => {
              const target = nodeIds.get(option.target)!;
              connect(id, target, `OUTPUT_${answers[i].id}`);
              return rule(
                [action('SET_CONTEXT', { context: target })],
                [
                  {
                    variable: {
                      value: 'message_text',
                      name: 'Texto da mensagem',
                    },
                    operator: { value: '$eq', name: 'Igual' },
                    target: option.value,
                  },
                ],
              );
            }),
          ),
        );
      }
    }
    contexts.push(context);
    flowNodes.push({
      id,
      type: TYPE[node.kind],
      data,
      position: {
        x: entryX + (index % 4) * 380,
        y: Math.floor(index / 4) * 360,
      },
    });
  }
  const bot: BotPreview = {
    id: uuid(...seed, 'bot'),
    name: draft.name,
    accountId: catalog.accountId,
    data: { currentDefaultTerm: null },
    settings: {
      botCreatedVersion: 'v3',
      sequentialRuleExecution: true,
      limitations: {},
    },
    contexts,
    defaultContexts: serializeContexts(contexts),
    flowJson: { version: 3, nodes: flowNodes, edges },
  };
  return {
    status: 'preview',
    importReady: false,
    profile: PROFILE,
    catalogSource: catalog.source,
    catalogFetchedAt: catalog.fetchedAt,
    diagnostics,
    warnings,
    bot,
  };
}
