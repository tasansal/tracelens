/**
 * Table view for the SEG-Y binary file header with spec-driven fields.
 */
import type { BinaryHeader } from '@/features/segy/types/segy';
import { getBinaryHeaderSpec } from '@/shared/api/tauri/segy';
import React from 'react';
import { HeaderSpecTable } from './HeaderSpecTable';

/**
 * Props for BinaryHeaderTable.
 */
interface BinaryHeaderTableProps {
  header: BinaryHeader;
}

/**
 * Render a spec-backed table for the binary file header.
 */
export const BinaryHeaderTable: React.FC<BinaryHeaderTableProps> = ({ header }) => {
  return (
    <HeaderSpecTable
      title="Binary File Header"
      header={header as Record<string, unknown>}
      loadSpec={getBinaryHeaderSpec}
    />
  );
};
