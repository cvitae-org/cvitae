import { describe, expect, it } from 'vitest';
import {
  applyFilters,
  buildFacets,
  countActiveFilters,
  emptyFilters,
  isAnalysable,
  isAnalysed
} from './filtering';
import type { JobRecord } from './types';
import { NOT_STATED } from './types';

const record = (patch: Partial<JobRecord> = {}): JobRecord =>
  ({
    id: 'record-1',
    listId: 'manual',
    company: 'Hiring Co',
    company_type: 'Product company',
    company_size: '100',
    position: 'Frontend Developer',
    role_profile: 'Frontend Developer (React, TypeScript)',
    seniority: 'Mid',
    location: 'Warsaw',
    work_mode: 'remote',
    salary: '20 000 PLN',
    contract_type: 'B2B',
    engagement_length: 'Permanent',
    start_date: NOT_STATED,
    ideal_candidate: 'A frontend developer.',
    responsibilities: ['Build interfaces'],
    team: 'Product',
    how_to_apply: 'Form',
    required_skills: ['React'],
    requirements: [],
    source_url: 'https://example.com/1',
    source_mode: 'url',
    offer_text: 'We are looking for a React developer.',
    source_note: '',
    checked_at: new Date().toISOString(),
    locale: 'en',
    status: 'new',
    notes: '',
    ...patch
  }) as JobRecord;

/** An import fills what the board published and leaves the read fields empty. */
const imported = (patch: Partial<JobRecord> = {}) =>
  record({ id: 'imported-1', role_profile: NOT_STATED, ...patch });

describe('analysed detection', () => {
  it('reads role_profile, which only a reading of the text produces', () => {
    // company and salary arrive filled from the scrape, so neither separates an
    // analysed row from an imported one.
    expect(isAnalysed(record())).toBe(true);
    expect(isAnalysed(imported())).toBe(false);
  });

  it('treats an unanalysed row with no stored text as nothing to do', () => {
    // Rows researched one at a time keep no text; there is no gap to fill and
    // offering to fill it would be a button that cannot work.
    expect(isAnalysable(imported())).toBe(true);
    expect(isAnalysable(imported({ offer_text: '' }))).toBe(false);
    expect(isAnalysable(imported({ offer_text: '   ' }))).toBe(false);
  });

  it('never offers to analyse a row that already is', () => {
    expect(isAnalysable(record())).toBe(false);
  });
});

describe('the analysis filter', () => {
  const rows = [record({ id: 'done' }), imported({ id: 'todo' })];

  it('shows everything by default', () => {
    expect(applyFilters(rows, emptyFilters).map((row) => row.id)).toEqual([
      'done',
      'todo'
    ]);
  });

  it('narrows to what is left', () => {
    const shown = applyFilters(rows, { ...emptyFilters, analysis: 'unanalysed' });
    expect(shown.map((row) => row.id)).toEqual(['todo']);
  });

  it('narrows to what is done', () => {
    const shown = applyFilters(rows, { ...emptyFilters, analysis: 'analysed' });
    expect(shown.map((row) => row.id)).toEqual(['done']);
  });

  it('counts as an active filter only when it narrows', () => {
    expect(countActiveFilters(emptyFilters)).toBe(0);
    expect(countActiveFilters({ ...emptyFilters, analysis: 'analysed' })).toBe(1);
    expect(countActiveFilters({ ...emptyFilters, analysis: 'unanalysed' })).toBe(1);
  });

  it('combines with the other filters rather than replacing them', () => {
    const mixed = [
      record({ id: 'done-remote', work_mode: 'remote' }),
      imported({ id: 'todo-remote', work_mode: 'remote' }),
      imported({ id: 'todo-onsite', work_mode: 'onsite' })
    ];

    const shown = applyFilters(mixed, {
      ...emptyFilters,
      analysis: 'unanalysed',
      workModes: ['remote']
    });

    expect(shown.map((row) => row.id)).toEqual(['todo-remote']);
  });
});

describe('facets', () => {
  it('counts both sides, so each pill can show what it would show', () => {
    const facets = buildFacets([
      record({ id: 'a' }),
      imported({ id: 'b' }),
      imported({ id: 'c' })
    ]);

    expect(facets.analysed).toBe(1);
    expect(facets.unanalysed).toBe(2);
  });
});
