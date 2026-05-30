/** The two sections of a SEG-Y header that can have custom fields. */
export type HeaderType = 'binary' | 'trace';

/**
 * Shape of header field metadata returned by the backend spec endpoints.
 */
export interface HeaderFieldSpec {
  name: string;
  field_key: string;
  byte_start: number;
  byte_end: number;
  data_type: string;
  description: string;
  required: boolean;
  code_mapping?: Record<string, string>;
}

/**
 * Binary header specification block from the JSON spec.
 */
interface BinaryHeaderSpec {
  size: number;
  fields: HeaderFieldSpec[];
}

/**
 * Trace header specification block from the JSON spec.
 */
interface TraceHeaderSpec {
  size: number;
  fields: HeaderFieldSpec[];
}

/**
 * Complete SEG-Y format specification from JSON.
 */
export interface SegyFormatSpec {
  version: string;
  reference: string;
  binary_header: BinaryHeaderSpec;
  trace_header: TraceHeaderSpec;
}
