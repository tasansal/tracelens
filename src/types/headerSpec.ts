// Header field specification from backend
export interface HeaderFieldSpec {
  name: string;
  field_key: string;
  byte_start: number;
  byte_end: number;
  data_type: string;
  description?: string;
}
