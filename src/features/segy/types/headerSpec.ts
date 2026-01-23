/**
 * Shape of header field metadata returned by the backend spec endpoints.
 */
export interface HeaderFieldSpec {
  name: string;
  field_key: string;
  byte_start: number;
  byte_end: number;
  data_type: string;
  description?: string;
}
