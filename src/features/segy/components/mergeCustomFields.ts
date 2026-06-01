import type { HeaderFieldSpec } from '@/features/segy/types/headerSpec';
import type { HeaderFieldData } from '@/shared/api/tauri/segy';

/**
 * Build display rows for custom spec fields by joining the spec definitions
 * (names/descriptions/byte ranges) with the parsed values returned by the
 * backend, matched on `byte_start`. Shared by the binary and trace header
 * tables so the join/fallback stays identical for both.
 */
export function mergeCustomFields(
  specFields: HeaderFieldSpec[] | undefined,
  fieldData: HeaderFieldData[] | null | undefined
): HeaderFieldData[] {
  if (!specFields || !fieldData) return [];
  const byByteStart = new Map(fieldData.map(f => [f.byte_start, f]));
  return specFields.map((specF): HeaderFieldData => {
    const parsed = byByteStart.get(specF.byte_start);
    return {
      name: specF.name,
      description: specF.description,
      value: parsed?.value ?? 0,
      resolved: parsed?.resolved,
      byte_start: specF.byte_start,
      byte_end: specF.byte_end,
      data_type: specF.data_type,
    };
  });
}
