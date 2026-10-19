import type { Draft } from './types.ts';

export interface EntryScenario {
  firstMessage: boolean;
  holiday: boolean;
  companyOpen: boolean;
}

// Local preview only. The real calendar and clock belong to Digisac.
export function entryOutcome(draft: Draft, scenario: EntryScenario) {
  if (draft.behavior?.firstMessageOnly && !scenario.firstMessage)
    return 'not-first';
  if (draft.behavior?.respectHolidays && scenario.holiday) return 'holiday';
  if (draft.behavior?.businessHours?.enabled && !scenario.companyOpen)
    return 'closed';
  return 'continue';
}
