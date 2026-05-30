/**
 * Tests for BinaryHeaderTable component - binary header display.
 */
import { getBinaryHeaderData } from '@/shared/api/tauri/segy';
import { TooltipProvider } from '@/shared/ui/tooltip';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BinaryHeaderTable } from './BinaryHeaderTable';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

vi.mock('@/shared/api/tauri/segy', () => ({
  getBinaryHeaderData: vi.fn(),
  listScalarTypes: vi.fn().mockResolvedValue([]),
}));

const mockGetBinaryHeaderData = vi.mocked(getBinaryHeaderData);

const renderWithTooltip = (ui: React.ReactElement) => {
  return render(<TooltipProvider>{ui}</TooltipProvider>);
};

describe('BinaryHeaderTable', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders loading state initially', () => {
    mockGetBinaryHeaderData.mockImplementation(
      () => new Promise(() => {}) // Never resolves to keep loading
    );

    renderWithTooltip(<BinaryHeaderTable filePath="/test/file.segy" />);

    expect(screen.getByText('Loading…')).toBeInTheDocument();
  });

  it('renders error state on failure', async () => {
    mockGetBinaryHeaderData.mockRejectedValueOnce(new Error('file not found'));

    renderWithTooltip(<BinaryHeaderTable filePath="/test/file.segy" />);

    await waitFor(() => {
      expect(screen.getByText(/Error/)).toBeInTheDocument();
    });
    expect(screen.getByText(/file not found/)).toBeInTheDocument();
  });

  it('renders data when loaded successfully', async () => {
    const mockData = [
      {
        name: 'JobID',
        value: 12345,
        description: 'Job identification number',
        byte_start: 0,
        byte_end: 4,
        data_type: 'I4',
      },
      {
        name: 'LineSeq',
        value: 1,
        description: 'Line sequence number',
        byte_start: 4,
        byte_end: 8,
        data_type: 'I4',
      },
    ];
    mockGetBinaryHeaderData.mockResolvedValueOnce(mockData);

    renderWithTooltip(<BinaryHeaderTable filePath="/test/file.segy" />);

    await waitFor(() => {
      expect(screen.getByText('JobID')).toBeInTheDocument();
    });
    expect(screen.getByText('12345')).toBeInTheDocument();
  });

  it('calls getBinaryHeaderData with correct filePath', async () => {
    mockGetBinaryHeaderData.mockResolvedValueOnce([]);

    renderWithTooltip(<BinaryHeaderTable filePath="/specific/path/file.segy" />);

    await waitFor(() => {
      expect(mockGetBinaryHeaderData).toHaveBeenCalledWith('/specific/path/file.segy');
    });
  });

  it('refetches data when revisionKey changes', async () => {
    mockGetBinaryHeaderData.mockResolvedValue([]);

    const { rerender } = renderWithTooltip(
      <BinaryHeaderTable filePath="/test/file.segy" revisionKey={0} />
    );

    await waitFor(() => {
      expect(mockGetBinaryHeaderData).toHaveBeenCalledTimes(1);
    });

    // Rerender with different revisionKey
    rerender(
      <TooltipProvider>
        <BinaryHeaderTable filePath="/test/file.segy" revisionKey={1} />
      </TooltipProvider>
    );

    await waitFor(() => {
      expect(mockGetBinaryHeaderData).toHaveBeenCalledTimes(2);
    });
  });

  it('handles empty data array', async () => {
    mockGetBinaryHeaderData.mockResolvedValueOnce([]);

    renderWithTooltip(<BinaryHeaderTable filePath="/test/file.segy" />);

    await waitFor(() => {
      expect(mockGetBinaryHeaderData).toHaveBeenCalledWith('/test/file.segy');
    });
  });

  it('handles numeric field values correctly', async () => {
    const mockData = [
      {
        name: 'JobID',
        value: 0,
        description: '',
        byte_start: 0,
        byte_end: 4,
        data_type: 'I4',
      },
    ];
    mockGetBinaryHeaderData.mockResolvedValueOnce(mockData);

    renderWithTooltip(<BinaryHeaderTable filePath="/test/file.segy" />);

    await waitFor(() => {
      expect(screen.getByText('0')).toBeInTheDocument();
    });
  });

  it('handles negative numeric values', async () => {
    const mockData = [
      {
        name: 'CoordScale',
        value: -100,
        description: 'Coordinate scaler',
        byte_start: 68,
        byte_end: 72,
        data_type: 'I4',
      },
    ];
    mockGetBinaryHeaderData.mockResolvedValueOnce(mockData);

    renderWithTooltip(<BinaryHeaderTable filePath="/test/file.segy" />);

    await waitFor(() => {
      expect(screen.getByText('-100')).toBeInTheDocument();
    });
  });

  it('cleans up on unmount', async () => {
    mockGetBinaryHeaderData.mockResolvedValueOnce([]);

    const { unmount } = renderWithTooltip(<BinaryHeaderTable filePath="/test/file.segy" />);

    // Unmount should not cause errors even if request is pending
    unmount();

    // The component uses isMounted flag so no errors should occur
  });
});
