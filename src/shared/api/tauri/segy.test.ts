import { invoke } from '@tauri-apps/api/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  addCustomField,
  clearCustomSpec,
  deleteCustomField,
  getActiveSpec,
  getBinaryHeaderData,
  getBinaryHeaderSpec,
  getCustomSpec,
  getTraceHeaderData,
  getTraceHeaderSpec,
  loadCustomSpec,
  loadSegyFile,
  saveCustomSpec,
  scanAmplitudeRange,
  setActiveRevision,
  updateCustomField,
} from './segy';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

const mockedInvoke = vi.mocked(invoke);

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('loadSegyFile', () => {
  it('should call invoke with correct command name', async () => {
    mockedInvoke.mockResolvedValueOnce({} as never);
    await loadSegyFile('/path/to/file.segy');
    expect(invoke).toHaveBeenCalledWith('load_segy_file', { filePath: '/path/to/file.segy' });
  });

  it('should return response on success', async () => {
    const mockData = { filePath: '/path/to/file.segy', traceCount: 100 };
    mockedInvoke.mockResolvedValueOnce(mockData as never);
    const result = await loadSegyFile('/path/to/file.segy');
    expect(result).toEqual(mockData);
  });

  it('should throw on error', async () => {
    mockedInvoke.mockRejectedValueOnce(new Error('file not found'));
    await expect(loadSegyFile('/path/to/file.segy')).rejects.toThrow('file not found');
  });
});

describe('getBinaryHeaderSpec', () => {
  it('should call invoke with correct command name and revision', async () => {
    mockedInvoke.mockResolvedValueOnce([] as never);
    await getBinaryHeaderSpec('Rev2');
    expect(invoke).toHaveBeenCalledWith('get_binary_header_spec', { revision: 'Rev2' });
  });

  it('should pass null revision when undefined', async () => {
    mockedInvoke.mockResolvedValueOnce([] as never);
    await getBinaryHeaderSpec();
    expect(invoke).toHaveBeenCalledWith('get_binary_header_spec', { revision: null });
  });

  it('should return response on success', async () => {
    const mockSpec = [{ name: 'JobID', dataType: 'I4', byteStart: 0, byteEnd: 4 }];
    mockedInvoke.mockResolvedValueOnce(mockSpec as never);
    const result = await getBinaryHeaderSpec('Rev1');
    expect(result).toEqual(mockSpec);
  });

  it('should throw on error', async () => {
    mockedInvoke.mockRejectedValueOnce(new Error('invalid revision'));
    await expect(getBinaryHeaderSpec('Rev2' as never)).rejects.toThrow('invalid revision');
  });
});

describe('getTraceHeaderSpec', () => {
  it('should call invoke with correct command name and revision', async () => {
    mockedInvoke.mockResolvedValueOnce([] as never);
    await getTraceHeaderSpec('Rev2');
    expect(invoke).toHaveBeenCalledWith('get_trace_header_spec', { revision: 'Rev2' });
  });

  it('should pass null revision when undefined', async () => {
    mockedInvoke.mockResolvedValueOnce([] as never);
    await getTraceHeaderSpec();
    expect(invoke).toHaveBeenCalledWith('get_trace_header_spec', { revision: null });
  });

  it('should return response on success', async () => {
    const mockSpec = [{ name: 'TraceSeq', dataType: 'I4', byteStart: 0, byteEnd: 4 }];
    mockedInvoke.mockResolvedValueOnce(mockSpec as never);
    const result = await getTraceHeaderSpec('Rev0');
    expect(result).toEqual(mockSpec);
  });

  it('should throw on error', async () => {
    mockedInvoke.mockRejectedValueOnce(new Error('invalid revision'));
    await expect(getTraceHeaderSpec('Rev2' as never)).rejects.toThrow('invalid revision');
  });
});

describe('getBinaryHeaderData', () => {
  it('should call invoke with correct command name', async () => {
    mockedInvoke.mockResolvedValueOnce([] as never);
    await getBinaryHeaderData('/path/to/file.segy');
    expect(invoke).toHaveBeenCalledWith('get_binary_header_data', {
      filePath: '/path/to/file.segy',
    });
  });

  it('should return response on success', async () => {
    const mockData = [
      { name: 'JobID', value: 123, description: '', byte_start: 0, byte_end: 4, data_type: 'I4' },
    ];
    mockedInvoke.mockResolvedValueOnce(mockData as never);
    const result = await getBinaryHeaderData('/path/to/file.segy');
    expect(result).toEqual(mockData);
  });

  it('should throw on error', async () => {
    mockedInvoke.mockRejectedValueOnce(new Error('parse error'));
    await expect(getBinaryHeaderData('/path/to/file.segy')).rejects.toThrow('parse error');
  });
});

describe('getTraceHeaderData', () => {
  it('should call invoke with correct command name and params', async () => {
    mockedInvoke.mockResolvedValueOnce([] as never);
    await getTraceHeaderData('/path/to/file.segy', 10);
    expect(invoke).toHaveBeenCalledWith('get_trace_header_data', {
      filePath: '/path/to/file.segy',
      traceIndex: 10,
    });
  });

  it('should return response on success', async () => {
    const mockData = [
      { name: 'TraceSeq', value: 1, description: '', byte_start: 0, byte_end: 4, data_type: 'I4' },
    ];
    mockedInvoke.mockResolvedValueOnce(mockData as never);
    const result = await getTraceHeaderData('/path/to/file.segy', 0);
    expect(result).toEqual(mockData);
  });

  it('should throw on error', async () => {
    mockedInvoke.mockRejectedValueOnce(new Error('trace not found'));
    await expect(getTraceHeaderData('/path/to/file.segy', 999)).rejects.toThrow('trace not found');
  });
});

describe('setActiveRevision', () => {
  it('should call invoke with correct command name', async () => {
    mockedInvoke.mockResolvedValueOnce(undefined as never);
    await setActiveRevision('/path/to/file.segy', 'Rev2');
    expect(invoke).toHaveBeenCalledWith('set_active_revision', {
      filePath: '/path/to/file.segy',
      revision: 'Rev2',
    });
  });

  it('should resolve on success', async () => {
    mockedInvoke.mockResolvedValueOnce(undefined as never);
    await expect(setActiveRevision('/path/to/file.segy', 'Rev1')).resolves.toBeUndefined();
  });

  it('should throw on error', async () => {
    mockedInvoke.mockRejectedValueOnce(new Error('invalid revision'));
    await expect(setActiveRevision('/path/to/file.segy', 'Rev2' as never)).rejects.toThrow(
      'invalid revision'
    );
  });
});

describe('scanAmplitudeRange', () => {
  it('should call invoke with correct command name and percentile', async () => {
    mockedInvoke.mockResolvedValueOnce({} as never);
    await scanAmplitudeRange('/path/to/file.segy', 0.95);
    expect(invoke).toHaveBeenCalledWith('scan_amplitude_range', {
      filePath: '/path/to/file.segy',
      percentile: 0.95,
    });
  });

  it('should pass null percentile when undefined', async () => {
    mockedInvoke.mockResolvedValueOnce({} as never);
    await scanAmplitudeRange('/path/to/file.segy');
    expect(invoke).toHaveBeenCalledWith('scan_amplitude_range', {
      filePath: '/path/to/file.segy',
      percentile: null,
    });
  });

  it('should return response on success', async () => {
    const mockStats = {
      maxAmplitude: 123.4,
      percentileClip: 95,
      percentileUsed: 0.99,
      tracesSampled: 500,
      histogram: {
        binEdges: [-100, -50, 0, 50, 100],
        counts: [10, 120, 300, 80, 15],
      },
    };
    mockedInvoke.mockResolvedValueOnce(mockStats as never);
    const result = await scanAmplitudeRange('/path/to/file.segy', 0.99);
    expect(result).toEqual(mockStats);
  });

  it('should throw on error', async () => {
    mockedInvoke.mockRejectedValueOnce(new Error('scan failed'));
    await expect(scanAmplitudeRange('/path/to/file.segy')).rejects.toThrow('scan failed');
  });
});

describe('Custom Spec API', () => {
  const mockCustomSpec = {
    version: 'Custom',
    reference: 'user-defined',
    binary_header: { size: 400, byte_offset: 0, fields: [] },
    trace_header: { size: 240, fields: [] },
  };

  describe('loadCustomSpec', () => {
    it('should call invoke with filePath and uri', async () => {
      mockedInvoke.mockResolvedValueOnce(mockCustomSpec as never);
      const result = await loadCustomSpec('/path/to/file.segy', '/path/to/spec.json');
      expect(invoke).toHaveBeenCalledWith('load_custom_spec', {
        filePath: '/path/to/file.segy',
        uri: '/path/to/spec.json',
      });
      expect(result).toEqual(mockCustomSpec);
    });

    it('should throw on error', async () => {
      mockedInvoke.mockRejectedValueOnce(new Error('spec file not found'));
      await expect(loadCustomSpec('/path/to/file.segy', '/bad/path.json')).rejects.toThrow(
        'spec file not found'
      );
    });
  });

  describe('saveCustomSpec', () => {
    it('should call invoke to save spec', async () => {
      mockedInvoke.mockResolvedValueOnce(undefined as never);
      await saveCustomSpec('/path/to/file.segy', '/path/to/output.json');
      expect(invoke).toHaveBeenCalledWith('save_custom_spec', {
        filePath: '/path/to/file.segy',
        uri: '/path/to/output.json',
      });
    });

    it('should throw on error', async () => {
      mockedInvoke.mockRejectedValueOnce(new Error('write failed'));
      await expect(saveCustomSpec('/path/to/file.segy', '/bad/output.json')).rejects.toThrow(
        'write failed'
      );
    });
  });

  describe('getCustomSpec', () => {
    it('should return custom spec when exists', async () => {
      mockedInvoke.mockResolvedValueOnce(mockCustomSpec as never);
      const result = await getCustomSpec('/path/to/file.segy');
      expect(invoke).toHaveBeenCalledWith('get_custom_spec', {
        filePath: '/path/to/file.segy',
      });
      expect(result).toEqual(mockCustomSpec);
    });

    it('should return null when no custom spec', async () => {
      mockedInvoke.mockResolvedValueOnce(null as never);
      const result = await getCustomSpec('/path/to/file.segy');
      expect(result).toBeNull();
    });
  });

  describe('clearCustomSpec', () => {
    it('should call invoke to clear spec', async () => {
      mockedInvoke.mockResolvedValueOnce(undefined as never);
      await clearCustomSpec('/path/to/file.segy');
      expect(invoke).toHaveBeenCalledWith('clear_custom_spec', {
        filePath: '/path/to/file.segy',
      });
    });
  });

  describe('addCustomField', () => {
    it('should call invoke with field data', async () => {
      const field = {
        name: 'CustomField',
        field_key: 'custom_field',
        byte_start: 350,
        byte_end: 354,
        data_type: 'I4',
        description: 'User defined field',
        required: false,
      };
      mockedInvoke.mockResolvedValueOnce(mockCustomSpec as never);
      await addCustomField('/path/to/file.segy', 'binary', field);
      expect(invoke).toHaveBeenCalledWith('add_custom_field', {
        filePath: '/path/to/file.segy',
        headerType: 'binary',
        field,
      });
    });
  });

  describe('updateCustomField', () => {
    it('should call invoke with field key and data', async () => {
      const field = {
        name: 'UpdatedField',
        field_key: 'custom_field',
        byte_start: 350,
        byte_end: 354,
        data_type: 'I4',
        description: 'Updated description',
        required: false,
      };
      mockedInvoke.mockResolvedValueOnce(mockCustomSpec as never);
      await updateCustomField('/path/to/file.segy', 'binary', 'custom_field', field);
      expect(invoke).toHaveBeenCalledWith('update_custom_field', {
        filePath: '/path/to/file.segy',
        headerType: 'binary',
        fieldKey: 'custom_field',
        field,
      });
    });
  });

  describe('deleteCustomField', () => {
    it('should call invoke with field key', async () => {
      mockedInvoke.mockResolvedValueOnce(mockCustomSpec as never);
      await deleteCustomField('/path/to/file.segy', 'trace', 'custom_field');
      expect(invoke).toHaveBeenCalledWith('delete_custom_field', {
        filePath: '/path/to/file.segy',
        headerType: 'trace',
        fieldKey: 'custom_field',
      });
    });
  });

  describe('getActiveSpec', () => {
    it('should return merged spec', async () => {
      mockedInvoke.mockResolvedValueOnce(mockCustomSpec as never);
      const result = await getActiveSpec('/path/to/file.segy');
      expect(invoke).toHaveBeenCalledWith('get_active_spec', {
        filePath: '/path/to/file.segy',
      });
      expect(result).toEqual(mockCustomSpec);
    });
  });
});
