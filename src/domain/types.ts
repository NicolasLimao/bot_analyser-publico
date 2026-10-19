export interface Option {
  id: string;
  value: string;
  label: string;
  target: string;
}
export type Step = { name?: string } & (
  | { id: string; kind: 'menu'; message: string; options: Option[] }
  | { id: string; kind: 'message'; text: string; next: string }
  | {
      id: string;
      kind: 'transfer';
      departmentId: string;
      userId: string | null;
      next: string;
    }
  | { id: string; kind: 'stop' }
);
export interface Draft {
  schemaVersion: 1;
  id: string;
  name: string;
  accountId: string;
  entryNodeId: string;
  behavior?: {
    firstMessageOnly: boolean;
    stopOnAttendantMessage: boolean;
    respectHolidays?: boolean;
    businessHours?: { enabled: boolean; closedMessage: string };
    ticketInactivity?: { enabled: boolean; message: string };
    afterTicketClosed?: { enabled: boolean; message: string };
    invalidReply?: { enabled: boolean; message: string };
    afterTicketClosedEvaluation?: {
      enabled: boolean;
      questionId: string | null;
    };
  };
  nodes: Step[];
}
export interface Department {
  id: string;
  name: string;
  active: boolean;
}
export interface User extends Department {
  departmentIds: string[];
}
export interface Question extends Department {
  accountId: string;
  type: 'csat' | 'nps';
  questionMessage: string;
  duration: number;
  tries: number;
  successMessage: string;
  invalidMessage: string;
  reasonMessage: string;
}
export interface Catalog {
  accountId: string;
  source: 'simulated' | 'digisac' | 'snapshot';
  fetchedAt: string;
  complete: boolean;
  departments: Department[];
  users: User[];
  questions?: { state: 'ready' | 'unavailable'; items: Question[] };
}
export interface Diagnostic {
  code: string;
  path: string;
  message: string;
}
export interface Action {
  type: { value: string; name: string };
  data: Record<string, unknown>;
}
export interface FieldCondition {
  variable: { value: string; name: string };
  operator: { value: string; name: string };
  target: string;
}
export type Condition = FieldCondition | { $and: FieldCondition[] };
export interface Rule {
  title: string;
  actions: Action[];
  fallbackActions: Action[];
  conditions: Condition[];
}
export interface Context {
  id: string;
  name: string;
  triggers: { trigger: { type: string; name: string }; rules: Rule[] }[];
}
export interface FlowNode {
  id: string;
  type: string;
  data: Record<string, unknown>;
  position: { x: number; y: number };
}
export interface FlowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle: string;
  targetHandle: string;
}
export interface BotPreview {
  id: string;
  name: string;
  accountId: string;
  data: { currentDefaultTerm: null };
  settings: {
    botCreatedVersion: 'v3';
    sequentialRuleExecution: true;
    limitations: Record<string, never>;
  };
  flowJson: { version: 3; nodes: FlowNode[]; edges: FlowEdge[] };
  contexts: Context[];
  defaultContexts: string;
}
export type CompileResult =
  | {
      status: 'invalid';
      importReady: false;
      diagnostics: Diagnostic[];
      warnings: string[];
    }
  | {
      status: 'preview';
      importReady: false;
      profile: string;
      catalogSource: Catalog['source'];
      catalogFetchedAt: string;
      diagnostics: Diagnostic[];
      warnings: string[];
      bot: BotPreview;
    };
