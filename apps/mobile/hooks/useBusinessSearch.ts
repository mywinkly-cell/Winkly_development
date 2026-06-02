import { useCallback, useEffect, useMemo, useState } from "react";

export type BusinessChipFilter = {
  label: string;
  roleType?: string;
  goal?: string;
};

type Options = {
  debounceMs?: number;
  initialQuery?: string;
  initialChip?: BusinessChipFilter | null;
};

export function useBusinessSearch(opts: Options = {}) {
  const debounceMs = opts.debounceMs ?? 300;
  const [searchValue, setSearchValue] = useState(opts.initialQuery ?? "");
  const [debouncedQuery, setDebouncedQuery] = useState(opts.initialQuery ?? "");
  const [activeChip, setActiveChip] = useState<BusinessChipFilter | null>(
    opts.initialChip ?? null
  );

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(searchValue.trim()), debounceMs);
    return () => clearTimeout(t);
  }, [searchValue, debounceMs]);

  const hasActiveFilter = useMemo(
    () => debouncedQuery.length > 0 || !!(activeChip?.roleType || activeChip?.goal),
    [debouncedQuery, activeChip]
  );

  const feedParams = useMemo(
    () => ({
      query: debouncedQuery || undefined,
      roleType: activeChip?.roleType ?? null,
      networkingGoal: activeChip?.goal ?? null,
    }),
    [debouncedQuery, activeChip]
  );

  const clearAll = useCallback(() => {
    setSearchValue("");
    setDebouncedQuery("");
    setActiveChip(null);
  }, []);

  const selectChip = useCallback((chip: BusinessChipFilter | null) => {
    if (!chip || chip.label === "All") {
      setActiveChip(null);
      return;
    }
    setActiveChip(chip);
  }, []);

  return {
    searchValue,
    setSearchValue,
    debouncedQuery,
    activeChip,
    selectChip,
    hasActiveFilter,
    feedParams,
    clearAll,
  };
}
