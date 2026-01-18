// TypeScript types matching Rust SEG-Y structures

export interface TextualHeader {
  lines: string[];
}

// Dynamic header types - fields are determined by backend spec
export type BinaryHeader = Record<string, unknown>;
export type TraceHeader = Record<string, unknown>;

export interface SegyData {
  textual_header: TextualHeader;
  binary_header: BinaryHeader;
  total_traces: number | null;
  file_size: number;
  text_encoding: TextEncoding;
  byte_order: ByteOrder;
}

// Enums
export type DataSampleFormat =
  | { IbmFloat32: null }
  | { Int32: null }
  | { Int16: null }
  | { FixedPointWithGain: null };

export type TraceSortingCode =
  | { AsRecorded: null }
  | { CdpEnsemble: null }
  | { SingleFold: null }
  | { HorizontallyStacked: null };

export type MeasurementSystem = { Meters: null } | { Feet: null };

export type TextEncoding = 'Ebcdic' | 'Ascii';

export type ByteOrder = 'BigEndian' | 'LittleEndian';

// Helper functions for enum display
export function formatTextEncoding(encoding: TextEncoding): string {
  return encoding === 'Ebcdic' ? 'EBCDIC' : 'ASCII';
}

export function formatByteOrder(order: ByteOrder): string {
  return order === 'BigEndian' ? 'Big Endian' : 'Little Endian';
}
export function formatDataSampleFormat(format: DataSampleFormat): string {
  if (typeof format === 'string') {
    // Handle string variant from Rust
    if (format === 'IbmFloat32') return 'IBM Float32';
    if (format === 'Int32') return '32-bit Integer';
    if (format === 'Int16') return '16-bit Integer';
    if (format === 'FixedPointWithGain') return 'Fixed Point (Obsolete)';
  } else if (typeof format === 'object' && format !== null) {
    // Handle object variant
    if ('IbmFloat32' in format) return 'IBM Float32';
    if ('Int32' in format) return '32-bit Integer';
    if ('Int16' in format) return '16-bit Integer';
    if ('FixedPointWithGain' in format) return 'Fixed Point (Obsolete)';
  }
  return 'Unknown';
}

export function getDataSampleFormatCode(format: DataSampleFormat): number {
  if (typeof format === 'string') {
    if (format === 'IbmFloat32') return 1;
    if (format === 'Int32') return 2;
    if (format === 'Int16') return 3;
    if (format === 'FixedPointWithGain') return 4;
    if (format === 'IeeeFloat32') return 5;
    if (format === 'Int8') return 8;
  } else if (typeof format === 'object' && format !== null) {
    if ('IbmFloat32' in format) return 1;
    if ('Int32' in format) return 2;
    if ('Int16' in format) return 3;
    if ('FixedPointWithGain' in format) return 4;
    if ('IeeeFloat32' in format) return 5;
    if ('Int8' in format) return 8;
  }
  return 1; // Default to IBM Float32
}
