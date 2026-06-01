/**
 * Feature-local store for the active SEG-Y custom spec.
 *
 * Lives outside the global appStore because only the schema tab and the
 * header tables read from it; pulling it into the app-wide store caused
 * unrelated components to re-render whenever a custom field was edited.
 */
import type { SegyFormatSpec } from '@/features/segy/types/headerSpec';
import { create } from 'zustand';

interface CustomSpecState {
  customSpec: SegyFormatSpec | null;
  customSpecModified: boolean;
  setCustomSpec: (spec: SegyFormatSpec | null) => void;
  setCustomSpecModified: (modified: boolean) => void;
  clearCustomSpec: () => void;
}

export const useCustomSpecStore = create<CustomSpecState>(set => ({
  customSpec: null,
  customSpecModified: false,
  setCustomSpec: spec => set({ customSpec: spec }),
  setCustomSpecModified: modified => set({ customSpecModified: modified }),
  clearCustomSpec: () => set({ customSpec: null, customSpecModified: false }),
}));
