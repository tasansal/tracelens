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
 * Text header encoding reported by the backend.
 */
export type TextEncoding = 'Ebcdic' | 'Ascii';

/**
 * Byte order reported by the backend parser.
 */
export type ByteOrder = 'BigEndian' | 'LittleEndian';

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
