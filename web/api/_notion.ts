// Notion gateway internals — config, client, and property builders.
// Files prefixed with "_" are NOT treated as routes by Vercel.

import { Client } from '@notionhq/client';

export interface NotionTaskInput {
  title: string;
  status: string; // our enum: todo | in_progress | review | done
  priority?: string; // low | medium | high | urgent
  assigneeName?: string;
  assigneeNotionUserId?: string | null;
  dueDate?: string | null; // YYYY-MM-DD
  description?: string;
}

const env = process.env;

export const NOTION_ENABLED = Boolean(env.NOTION_TOKEN && env.NOTION_DATABASE_ID);

export const notion = NOTION_ENABLED ? new Client({ auth: env.NOTION_TOKEN }) : null;

const PROP = {
  title: env.NOTION_PROP_TITLE || 'Name',
  status: env.NOTION_PROP_STATUS || 'Status',
  assignee: env.NOTION_PROP_ASSIGNEE || 'Assignee',
  priority: env.NOTION_PROP_PRIORITY || 'Priority',
  due: env.NOTION_PROP_DUE || 'Due',
};

// Notion column kinds vary per database; make them configurable.
const STATUS_TYPE = (env.NOTION_STATUS_TYPE || 'status') as 'status' | 'select';
const ASSIGNEE_TYPE = (env.NOTION_ASSIGNEE_TYPE || 'rich_text') as 'people' | 'rich_text';
const PRIORITY_ENABLED = env.NOTION_PROP_PRIORITY !== '';
const DUE_ENABLED = env.NOTION_PROP_DUE !== '';

function parseMap(raw: string | undefined, fallback: Record<string, string>) {
  if (!raw) return fallback;
  try {
    return { ...fallback, ...JSON.parse(raw) };
  } catch {
    console.warn('Invalid JSON map in env; using defaults.');
    return fallback;
  }
}

const STATUS_MAP = parseMap(env.NOTION_STATUS_MAP, {
  todo: 'Todo',
  in_progress: 'In progress',
  review: 'Review',
  done: 'Done',
});

const PRIORITY_MAP = parseMap(env.NOTION_PRIORITY_MAP, {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  urgent: 'Urgent',
});

function statusProp(status: string) {
  const name = STATUS_MAP[status] ?? status;
  return STATUS_TYPE === 'status' ? { status: { name } } : { select: { name } };
}

function assigneeProp(input: NotionTaskInput) {
  if (ASSIGNEE_TYPE === 'people') {
    return input.assigneeNotionUserId
      ? { people: [{ id: input.assigneeNotionUserId }] }
      : { people: [] };
  }
  return { rich_text: [{ text: { content: input.assigneeName || '' } }] };
}

/** Build the Notion `properties` object for create/update from our task shape. */
export function buildProperties(input: NotionTaskInput, forCreate: boolean) {
  const props: Record<string, unknown> = {};

  if (forCreate) props[PROP.title] = { title: [{ text: { content: input.title } }] };
  props[PROP.status] = statusProp(input.status);

  if (input.assigneeName !== undefined || input.assigneeNotionUserId !== undefined) {
    props[PROP.assignee] = assigneeProp(input);
  }
  if (PRIORITY_ENABLED && input.priority) {
    props[PROP.priority] = { select: { name: PRIORITY_MAP[input.priority] ?? input.priority } };
  }
  if (DUE_ENABLED && input.dueDate !== undefined) {
    props[PROP.due] = input.dueDate ? { date: { start: input.dueDate } } : { date: null };
  }
  return props;
}

export const DATABASE_ID = env.NOTION_DATABASE_ID || '';
export const SYNC_SECRET = env.NOTION_SYNC_SECRET || '';
