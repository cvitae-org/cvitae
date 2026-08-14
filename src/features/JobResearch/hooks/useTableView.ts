"use client";

import { useCallback, useMemo, useState } from 'react';
import type { JobRecord } from '../types';
import type { Filters, Sort } from '../filtering';
import {
  applyFilters,
  buildFacets,
  countActiveFilters,
  defaultSort,
  emptyFilters,
  sortRecords
} from '../filtering';

/**
 * The table's view state: what is filtered out, and in what order.
 *
 * Held in component state rather than the persisted store. A filter is a way of
 * looking at the offers, not a fact about them, and a saved one would greet the
 * user with a near-empty table on the next visit and no memory of why.
 *
 * It deliberately survives a tab switch. The facets are rebuilt per tab, but
 * "remote, B2B, salary stated" is exactly the comparison worth carrying from
 * the frontend tab to the AI one, and the count badge keeps it visible.
 */
export const useTableView = (records: JobRecord[]) => {
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [sort, setSort] = useState<Sort>(defaultSort);

  // Built from the unfiltered tab, so a pill's count is how many rows it would
  // show rather than how many survive the filters already applied — and so
  // selecting one never makes the others vanish from the panel.
  const facets = useMemo(() => buildFacets(records), [records]);

  const visible = useMemo(
    () => sortRecords(applyFilters(records, filters), sort),
    [records, filters, sort]
  );

  const activeFilters = useMemo(() => countActiveFilters(filters), [filters]);

  const reset = useCallback(() => setFilters(emptyFilters), []);

  return {
    filters,
    setFilters,
    sort,
    setSort,
    facets,
    visible,
    activeFilters,
    reset
  };
};
