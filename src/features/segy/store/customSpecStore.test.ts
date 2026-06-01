import { afterEach, describe, expect, it } from 'vitest';
import { useCustomSpecStore } from './customSpecStore';

afterEach(() => {
  useCustomSpecStore.getState().clearCustomSpec();
});

describe('customSpecStore', () => {
  const mockCustomSpec = {
    version: 'Custom',
    reference: 'user-defined',
    binary_header: { size: 400, fields: [] },
    trace_header: { size: 240, fields: [] },
  };

  it('initializes empty', () => {
    const store = useCustomSpecStore.getState();
    expect(store.customSpec).toBeNull();
    expect(store.customSpecModified).toBe(false);
  });

  it('sets and clears the custom spec', () => {
    useCustomSpecStore.getState().setCustomSpec(mockCustomSpec as never);
    useCustomSpecStore.getState().setCustomSpecModified(true);
    expect(useCustomSpecStore.getState().customSpec).toEqual(mockCustomSpec);
    expect(useCustomSpecStore.getState().customSpecModified).toBe(true);

    useCustomSpecStore.getState().clearCustomSpec();
    const store = useCustomSpecStore.getState();
    expect(store.customSpec).toBeNull();
    expect(store.customSpecModified).toBe(false);
  });
});
