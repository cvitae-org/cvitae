import { describe, expect, it } from 'vitest';
import { parseState, serializeState, STORAGE_VERSION } from './storage';

describe('research storage v4 migration', () => {
  it('adds requirement citations and normalizes retained posting text', () => {
    const state = parseState({
      version: 3,
      records: [
        {
          id: 'record-1',
          listId: 'manual',
          company: 'Company',
          position: 'Developer',
          status: 'new',
          required_skills: ['React'],
          responsibilities: ['Build UI'],
          offer_text: ' React\r\n\r\n\r\n Build UI '
        }
      ],
      lists: [{ id: 'manual', name: 'Manual', createdAt: '1970-01-01T00:00:00.000Z' }],
      activeListId: 'manual'
    });
    expect(state.records[0].offer_text).toBe('React\n\nBuild UI');
    expect(state.records[0].requirements).toHaveLength(2);
    expect(serializeState(state).version).toBe(STORAGE_VERSION);
  });
});
