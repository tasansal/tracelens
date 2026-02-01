/**
 * Table view for the SEG-Y binary file header with spec-driven fields.
 */
import type { BinaryHeader } from '@/features/segy/types/segy';
import { getBinaryHeaderSpec } from '@/shared/api/tauri/segy';
import { HeaderSpecTable } from './HeaderSpecTable';

/**
 * Props for BinaryHeaderTable component.
 */
interface BinaryHeaderTableProps {
  /** SEG-Y binary file header data */
  header: BinaryHeader;
}

/**
 * Renders a spec-backed table for the SEG-Y binary file header.
 * Displays structured field information from the header specification.
 *
 * @param props - Component props
 * @returns Binary header table component
 */
export const BinaryHeaderTable = ({ header }: BinaryHeaderTableProps) => {
  return (
    <HeaderSpecTable
      title="Binary File Header"
      header={header as Record<string, unknown>}
      loadSpec={getBinaryHeaderSpec}
    />
  );
};
