/**
 * Shared formatting utilities for header table components
 */

/**
 * Format enum values for display in table cells
 */
export function formatValue(value: unknown): string {
  // Handle string enum variants from Rust (default serde serialization)
  if (typeof value === 'string') {
    return formatStringEnum(value);
  }

  // Handle object enum variants from Rust
  if (typeof value === 'object' && value !== null) {
    // Binary header enum types
    if (
      'IbmFloat32' in value ||
      'Int32' in value ||
      'Int16' in value ||
      'FixedPointWithGain' in value ||
      'IeeeFloat32' in value ||
      'Int8' in value
    ) {
      return formatDataSampleFormat(value);
    }
    if (
      'AsRecorded' in value ||
      'CdpEnsemble' in value ||
      'SingleFold' in value ||
      'HorizontallyStacked' in value ||
      'Unknown' in value
    ) {
      return formatTraceSorting(value);
    }
    if ('Meters' in value || 'Feet' in value) {
      return formatMeasurementSystem(value);
    }

    // Trace header enum types
    if ('SeismicData' in value) return 'Seismic Data';
    if ('Dead' in value) return 'Dead';
    if ('Dummy' in value) return 'Dummy';
    if ('TimeBreak' in value) return 'Time Break';
    if ('Uphole' in value) return 'Uphole';
    if ('Sweep' in value) return 'Sweep';
    if ('Timing' in value) return 'Timing';
    if ('WaterBreak' in value) return 'Water Break';
    if ('Optional' in value) {
      const optionalValue = value as { Optional: number };
      return `Optional (${optionalValue.Optional})`;
    }
    if ('Length' in value) return 'Length';
    if ('SecondsOfArc' in value) return 'Seconds of Arc';

    return JSON.stringify(value);
  }
  return String(value);
}

/**
 * Format string-based enum variants (simple Rust enum serialization)
 */
function formatStringEnum(value: string): string {
  // Data sample formats
  if (value === 'IbmFloat32') return 'IBM Float32';
  if (value === 'Int32') return '32-bit Integer';
  if (value === 'Int16') return '16-bit Integer';
  if (value === 'FixedPointWithGain') return 'Fixed Point (Obsolete)';
  if (value === 'IeeeFloat32') return 'IEEE Float32';
  if (value === 'Int8') return '8-bit Integer';

  // Trace sorting
  if (value === 'AsRecorded') return 'As Recorded';
  if (value === 'CdpEnsemble') return 'CDP Ensemble';
  if (value === 'SingleFold') return 'Single Fold';
  if (value === 'HorizontallyStacked') return 'Horizontally Stacked';
  if (value === 'Unknown') return 'Unknown';

  // Measurement system
  if (value === 'Meters') return 'Meters';
  if (value === 'Feet') return 'Feet';

  // Trace identification
  if (value === 'SeismicData') return 'Seismic Data';
  if (value === 'Dead') return 'Dead';
  if (value === 'Dummy') return 'Dummy';
  if (value === 'TimeBreak') return 'Time Break';
  if (value === 'Uphole') return 'Uphole';
  if (value === 'Sweep') return 'Sweep';
  if (value === 'Timing') return 'Timing';
  if (value === 'WaterBreak') return 'Water Break';

  // Coordinate units
  if (value === 'Length') return 'Length';
  if (value === 'SecondsOfArc') return 'Seconds of Arc';

  // Return as-is if not recognized
  return value;
}

/**
 * Extract raw enum code for the tooltip display
 */
export function getRawCode(value: unknown): string | null {
  // Handle string enum variants
  if (typeof value === 'string') {
    return getStringEnumCode(value);
  }

  // Handle object enum variants
  if (typeof value === 'object' && value !== null) {
    // Data sample format codes
    if ('IbmFloat32' in value) return '1';
    if ('Int32' in value) return '2';
    if ('Int16' in value) return '3';
    if ('FixedPointWithGain' in value) return '4';
    if ('IeeeFloat32' in value) return '5';
    if ('Int8' in value) return '8';

    // Trace sorting codes
    if ('Unknown' in value) return '0';
    if ('AsRecorded' in value) return '1';
    if ('CdpEnsemble' in value) return '2';
    if ('SingleFold' in value) return '3';
    if ('HorizontallyStacked' in value) return '4';

    // Measurement system codes
    if ('Meters' in value) return '1';
    if ('Feet' in value) return '2';

    // Trace identification codes
    if ('SeismicData' in value) return '1';
    if ('Dead' in value) return '2';
    if ('Dummy' in value) return '3';
    if ('TimeBreak' in value) return '4';
    if ('Uphole' in value) return '5';
    if ('Sweep' in value) return '6';
    if ('Timing' in value) return '7';
    if ('WaterBreak' in value) return '8';
    if ('Optional' in value) {
      const optionalValue = value as { Optional: number };
      return String(optionalValue.Optional);
    }

    // Coordinate units codes
    if ('Length' in value) return '1';
    if ('SecondsOfArc' in value) return '2';
  }
  return null;
}

/**
 * Get raw enum code from string variant
 */
function getStringEnumCode(value: string): string | null {
  // Data sample format codes
  if (value === 'IbmFloat32') return '1';
  if (value === 'Int32') return '2';
  if (value === 'Int16') return '3';
  if (value === 'FixedPointWithGain') return '4';
  if (value === 'IeeeFloat32') return '5';
  if (value === 'Int8') return '8';

  // Trace sorting codes
  if (value === 'Unknown') return '0';
  if (value === 'AsRecorded') return '1';
  if (value === 'CdpEnsemble') return '2';
  if (value === 'SingleFold') return '3';
  if (value === 'HorizontallyStacked') return '4';

  // Measurement system codes
  if (value === 'Meters') return '1';
  if (value === 'Feet') return '2';

  // Trace identification codes
  if (value === 'SeismicData') return '1';
  if (value === 'Dead') return '2';
  if (value === 'Dummy') return '3';
  if (value === 'TimeBreak') return '4';
  if (value === 'Uphole') return '5';
  if (value === 'Sweep') return '6';
  if (value === 'Timing') return '7';
  if (value === 'WaterBreak') return '8';

  // Coordinate units codes
  if (value === 'Length') return '1';
  if (value === 'SecondsOfArc') return '2';

  return null;
}

function formatDataSampleFormat(format: Record<string, unknown>): string {
  if ('IbmFloat32' in format) return 'IBM Float32';
  if ('Int32' in format) return '32-bit Integer';
  if ('Int16' in format) return '16-bit Integer';
  if ('FixedPointWithGain' in format) return 'Fixed Point (Obsolete)';
  if ('IeeeFloat32' in format) return 'IEEE Float32';
  if ('Int8' in format) return '8-bit Integer';
  return 'Unknown';
}

function formatTraceSorting(sorting: Record<string, unknown>): string {
  if ('AsRecorded' in sorting) return 'As Recorded';
  if ('CdpEnsemble' in sorting) return 'CDP Ensemble';
  if ('SingleFold' in sorting) return 'Single Fold';
  if ('HorizontallyStacked' in sorting) return 'Horizontally Stacked';
  if ('Unknown' in sorting) return 'Unknown';
  return 'Unknown';
}

function formatMeasurementSystem(system: Record<string, unknown>): string {
  if ('Meters' in system) return 'Meters';
  if ('Feet' in system) return 'Feet';
  return 'Unknown';
}
