/**
 * Reading server-sent events off a fetch body.
 *
 * Used from both ends of the same relay: the API route reads the runtime's
 * stream, and the browser reads the route's. Nothing here touches `process` or
 * `window`, so one implementation serves both — which matters more than the few
 * lines it saves, because a batch that is parsed two different ways is a batch
 * with two different sets of edge cases.
 *
 * `EventSource` would be the obvious alternative and cannot be used: it is
 * GET-only, and a batch is a POST carrying the offers.
 */

export type SseFrame = { event: string; data: string };

/**
 * Splits a byte stream into frames.
 *
 * The buffer is the whole point. A chunk boundary falls wherever the network
 * put it — routinely mid-JSON, and for a long offer routinely mid-frame — so
 * anything that parses each chunk as it arrives works until an offer is big
 * enough to be split, which is exactly the case a batch is for.
 */
export const readSseStream = async (
  body: ReadableStream<Uint8Array>,
  onFrame: (frame: SseFrame) => void | Promise<void>
): Promise<void> => {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  const flush = async (raw: string) => {
    const frame = parseFrame(raw);
    if (frame) await onFrame(frame);
  };

  try {
    for (;;) {
      const { done, value } = await reader.read();

      if (done) break;

      // `stream: true` so a multi-byte character split across chunks is held
      // rather than turned into a replacement character. Offer text is Polish
      // often enough for this to be load-bearing rather than theoretical.
      buffer += decoder.decode(value, { stream: true });

      let boundary = buffer.indexOf('\n\n');

      while (boundary !== -1) {
        await flush(buffer.slice(0, boundary));
        buffer = buffer.slice(boundary + 2);
        boundary = buffer.indexOf('\n\n');
      }
    }

    // A final frame with no trailing blank line. Well-behaved senders do not
    // produce one, but a stream cut mid-flight can, and discarding a complete
    // frame because its terminator never arrived would lose a finished offer.
    if (buffer.trim()) await flush(buffer);
  } finally {
    reader.releaseLock();
  }
};

const parseFrame = (raw: string): SseFrame | null => {
  let event = 'message';
  const data: string[] = [];

  for (const line of raw.split('\n')) {
    if (line.startsWith(':')) continue; // comment / keep-alive
    if (line.startsWith('event:')) event = line.slice(6).trim();
    else if (line.startsWith('data:')) data.push(line.slice(5).trimStart());
  }

  return data.length > 0 ? { event, data: data.join('\n') } : null;
};

/** Formats one frame for sending. The inverse of `parseFrame`. */
export const sseFrame = (event: string, payload: unknown): string =>
  `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
