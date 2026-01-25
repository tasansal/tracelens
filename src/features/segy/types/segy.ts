/**
 * TypeScript structures that mirror Rust SEG-Y data returned from the backend.
 */

/**
 * Textual header is exposed as an array of 40 lines.
 */
export interface TextualHeader {
  lines: string[];
}

/**
 * Dynamic header maps keyed by backend field specs.
 */
export type BinaryHeader = Record<string, unknown>;
export type TraceHeader = Record<string, unknown>;

/**
 * Aggregate SEG-Y metadata loaded from the backend.
 */
export interface SegyData {
  textual_header: TextualHeader;
  binary_header: BinaryHeader;
  total_traces: number | null;
  file_size: number;
  text_encoding: TextEncoding;
  byte_order: ByteOrder;
}

/**
 * Data sample format variants used in SEG-Y binary headers.
 */
export type DataSampleFormat =
  | { IbmFloat32: null }
  | { Int32: null }
  | { Int16: null }
  | { FixedPointWithGain: null };

/**
 * Text header encoding reported by the backend.
 */
export type TextEncoding = 'Ebcdic' | 'Ascii';

/**
 * Byte order reported by the backend parser.
 */
export type ByteOrder = 'BigEndian' | 'LittleEndian';

/**
 * Convert SEG-Y revision code to a UI-friendly label.
 */
export function formatSegyRevision(revision: number | null | undefined): string {
  if (revision === null || revision === undefined) return 'Auto';
  if (revision === 0) return 'Rev 0 (1975)';
  if (revision === 0x0100) return 'Rev 1.0 (2002)';
  if (revision === 0x0200) return 'Rev 2.0 (2017)';
  if (revision === 0x0201) return 'Rev 2.1 (2023)';
  const major = revision >> 8;
  const minor = revision & 0xff;
  return `Rev ${major}.${minor}`;
}

/**
 * Convert encoding enum to a UI-friendly label.
 */
export function formatTextEncoding(encoding: TextEncoding): string {
  return encoding === 'Ebcdic' ? 'EBCDIC' : 'ASCII';
}

/**
 * Convert byte order enum to a UI-friendly label.
 */
export function formatByteOrder(order: ByteOrder): string {
  return order === 'BigEndian' ? 'Big Endian' : 'Little Endian';
}

/**
 * Map a data sample format enum to its SEG-Y numeric code.
 */
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
