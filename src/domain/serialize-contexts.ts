import type { Action, Condition, Context, Rule } from './types.ts';

function serializedAction(a: Action) {
  const data = { ...a.data };
  // Digisac keeps resource objects in editor contexts, but IDs in runtime rules.
  if (a.type.value === 'TRANSFER_TICKET') {
    for (const key of ['department', 'user']) {
      const resource = data[key];
      if (resource && typeof resource === 'object' && 'id' in resource)
        data[key] = resource.id;
    }
  }
  if (a.type.value === 'SEND_QUESTION') {
    const question = data.question;
    if (question && typeof question === 'object' && 'id' in question)
      data.question = question.id;
  }
  return { data, name: a.type.name, value: a.type.value };
}
// Runtime rule parameters are separate from editor contexts: the external editor
// representation of BOT_INACTIVE is not confirmed by the available exports.
export function serializeContexts(
  contexts: Context[],
  ruleData: ReadonlyMap<Rule, Record<string, unknown>> = new Map(),
): string {
  const contextIds = new Set<string>();
  const rules = new Set<Rule>();
  for (const context of contexts) {
    if (contextIds.has(context.id))
      throw new Error(`Duplicate context: ${context.id}`);
    contextIds.add(context.id);
    const events = new Set<string>();
    for (const entry of context.triggers) {
      const type = entry.trigger?.type;
      if (!type?.trim())
        throw new Error(`Missing trigger type in context: ${context.id}`);
      if (events.has(type))
        throw new Error(`Duplicate trigger ${type} in context: ${context.id}`);
      events.add(type);
      for (const rule of entry.rules) rules.add(rule);
    }
  }
  for (const rule of ruleData.keys()) {
    if (!rules.has(rule))
      throw new Error('Runtime parameters reference an absent rule');
  }
  return JSON.stringify(
    Object.fromEntries(
      contexts.map((c) => [
        c.id,
        {
          name: c.name,
          triggers: Object.fromEntries(
            c.triggers.map((t) => [
              t.trigger.type,
              t.rules.map((r) => ({
                data: ruleData.get(r) ?? {},
                title: r.title,
                actions: r.actions.map(serializedAction),
                conditions: r.conditions.map(serializedCondition),
                fallbackActions: r.fallbackActions.map(serializedAction),
              })),
            ]),
          ),
        },
      ]),
    ),
  );
}
function serializedCondition(condition: Condition): Record<string, unknown> {
  if ('$and' in condition)
    return { $and: condition.$and.map(serializedCondition) };
  return {
    [`{{${condition.variable.value}}}`]: {
      [condition.operator.value]: condition.target,
    },
  };
}
