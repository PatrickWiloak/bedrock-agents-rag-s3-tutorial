/** A source document backing part of an answer. */
export interface Citation {
  index: number;
  title: string;
  source: string | null;
  category: string | null;
  excerpt: string;
  uri: string;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  citations?: Citation[];
  timestamp: Date;
}

/**
 * One line of the NDJSON stream from /api/chat.
 *
 * The Lambda emits these as generation proceeds - `session` first, then `text`
 * deltas interleaved with `citation` events, then exactly one `done` or `error`.
 */
export type StreamEvent =
  | { type: 'session'; sessionId: string }
  | { type: 'text'; delta: string }
  | { type: 'citation'; citation: Citation }
  | { type: 'done' }
  | { type: 'error'; message: string };
