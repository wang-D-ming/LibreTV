import { create } from 'zustand';

/** In-memory search state shared with the header; never encoded in navigation URLs. */
export const useSearchSession = create<{
  query: string;
  mode: 'smart' | 'title';
  setQuery: (query: string) => void;
  setMode: (mode: 'smart' | 'title') => void;
}>((set) => ({
  query: '', mode: 'smart',
  setQuery: (query) => set({ query }),
  setMode: (mode) => set({ mode }),
}));
