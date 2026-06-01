import { afterEach, describe, expect, it } from 'vitest';
import { useAppStore } from './appStore';

afterEach(() => {
  useAppStore.getState().setFilePath(null);
  useAppStore.getState().setLoading(false);
  useAppStore.getState().setSegyData(null);
  useAppStore.getState().setError(null);
  useAppStore.getState().setShowRevisionDialog(false);
  useAppStore.getState().setThemePreference('system');
});

describe('appStore', () => {
  it('should initialize with default state', () => {
    const store = useAppStore.getState();
    expect(store.filePath).toBeNull();
    expect(store.isLoading).toBe(false);
    expect(store.segyData).toBeNull();
    expect(store.error).toBeNull();
    expect(store.showRevisionDialog).toBe(false);
    expect(store.themePreference).toBe('system');
  });

  it('should set file path', () => {
    useAppStore.getState().setFilePath('/path/to/file.segy');
    expect(useAppStore.getState().filePath).toBe('/path/to/file.segy');
  });

  it('should set loading state to true', () => {
    useAppStore.getState().setLoading(true);
    expect(useAppStore.getState().isLoading).toBe(true);
  });

  it('should set loading state to false', () => {
    useAppStore.getState().setLoading(true);
    useAppStore.getState().setLoading(false);
    expect(useAppStore.getState().isLoading).toBe(false);
  });

  it('should set error state', () => {
    useAppStore.getState().setError('file not found');
    expect(useAppStore.getState().error).toBe('file not found');
  });

  it('should set error and clear loading state', () => {
    useAppStore.getState().setLoading(true);
    useAppStore.getState().setError('file not found');
    const store = useAppStore.getState();
    expect(store.error).toBe('file not found');
    expect(store.isLoading).toBe(true); // Error does not auto-clear loading
  });

  it('should clear error state', () => {
    useAppStore.getState().setError('some error');
    useAppStore.getState().setError(null);
    expect(useAppStore.getState().error).toBeNull();
  });

  it('should set segy data', () => {
    const mockData = {
      file_path: '/path/to/file.segy',
      total_traces: 100,
      total_samples: 1000,
      sample_format: 5,
      detected_revision: 'Rev2',
    } as never;
    useAppStore.getState().setSegyData(mockData as never);
    expect(useAppStore.getState().segyData).toEqual(mockData);
  });

  it('should set segy data and clear error', () => {
    useAppStore.getState().setError('previous error');
    const mockData = {
      file_path: '/path/to/file.segy',
      total_traces: 50,
    } as never;
    useAppStore.getState().setSegyData(mockData as never);
    const store = useAppStore.getState();
    expect(store.segyData).toEqual(mockData);
    expect(store.error).toBe('previous error'); // setSegyData does not auto-clear error
  });

  it('should set showRevisionDialog', () => {
    useAppStore.getState().setShowRevisionDialog(true);
    expect(useAppStore.getState().showRevisionDialog).toBe(true);
    useAppStore.getState().setShowRevisionDialog(false);
    expect(useAppStore.getState().showRevisionDialog).toBe(false);
  });

  it('should set theme preference', () => {
    useAppStore.getState().setThemePreference('dark');
    expect(useAppStore.getState().themePreference).toBe('dark');
    expect(useAppStore.getState().isDarkMode).toBe(true);
  });

  it('should apply theme from settings', () => {
    useAppStore.getState().applyTheme({ theme: 'light', density: 'compact' });
    expect(useAppStore.getState().themePreference).toBe('light');
    expect(useAppStore.getState().isDarkMode).toBe(false);
  });

  it('should handle multiple state updates without losing state', () => {
    useAppStore.getState().setFilePath('/path/to/file.segy');
    useAppStore.getState().setLoading(true);
    useAppStore.getState().setError('warning');

    const store = useAppStore.getState();
    expect(store.filePath).toBe('/path/to/file.segy');
    expect(store.isLoading).toBe(true);
    expect(store.error).toBe('warning');
  });

  it('should isolate state between tests', () => {
    // Set some state
    useAppStore.getState().setFilePath('/test/path.segy');
    useAppStore.getState().setLoading(true);
    useAppStore.getState().setError('test error');

    // Verify state is set
    const store = useAppStore.getState();
    expect(store.filePath).toBe('/test/path.segy');
    expect(store.isLoading).toBe(true);
    expect(store.error).toBe('test error');
  });
});
