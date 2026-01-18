import { invoke } from '@tauri-apps/api/core';
import React from 'react';
import { useAppStore } from '../store';
import { HeaderFieldSpec } from '../types/headerSpec';
import { BinaryHeader } from '../types/segy';
import { formatValue, getRawCode } from '../utils/formatters';

interface BinaryHeaderTableProps {
  header: BinaryHeader;
}

export const BinaryHeaderTable: React.FC<BinaryHeaderTableProps> = ({ header }) => {
  const { isDarkMode } = useAppStore();
  const [fieldSpecs, setFieldSpecs] = React.useState<HeaderFieldSpec[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    invoke<HeaderFieldSpec[]>('get_binary_header_spec')
      .then(setFieldSpecs)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div
        className={`flex h-full items-center justify-center ${isDarkMode ? 'bg-gray-900' : 'bg-white'}`}
      >
        <div className={`text-xs ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
          Loading...
        </div>
      </div>
    );
  }

  return (
    <div className={`flex h-full flex-col ${isDarkMode ? 'bg-gray-900' : 'bg-white'}`}>
      <div
        className={`border-b px-4 py-3 ${isDarkMode ? 'border-gray-800 bg-gray-950' : 'border-gray-200 bg-gray-50'}`}
      >
        <h2
          className={`text-sm font-semibold tracking-tight ${isDarkMode ? 'text-gray-200' : 'text-gray-900'}`}
        >
          BINARY FILE HEADER
        </h2>
      </div>

      <div
        className={`scrollbar-thin flex-1 overflow-x-auto overflow-y-auto scroll-smooth ${isDarkMode ? 'scrollbar-track-gray-900 scrollbar-thumb-gray-600 hover:scrollbar-thumb-gray-500' : 'scrollbar-track-gray-100 scrollbar-thumb-gray-400 hover:scrollbar-thumb-gray-500'}`}
      >
        <table className="w-full min-w-full text-xs">
          <thead
            className={`sticky top-0 ${isDarkMode ? 'border-b border-gray-800 bg-gray-950' : 'border-b border-gray-200 bg-gray-50'}`}
          >
            <tr>
              <th
                className={`px-3 py-2 text-left font-semibold ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}
              >
                FIELD
              </th>
              <th
                className={`px-3 py-2 text-left font-semibold ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}
              >
                BYTES
              </th>
              <th
                className={`px-3 py-2 text-left font-semibold ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}
              >
                TYPE
              </th>
              <th
                className={`px-3 py-2 text-right font-semibold ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}
              >
                VALUE
              </th>
            </tr>
          </thead>
          <tbody className={isDarkMode ? 'divide-y divide-gray-800' : 'divide-y divide-gray-100'}>
            {fieldSpecs.map((field, idx) => {
              const value = (header as Record<string, unknown>)[field.field_key];
              const rawCode = getRawCode(value);

              return (
                <tr
                  key={idx}
                  className={isDarkMode ? 'hover:bg-gray-800/50' : 'hover:bg-gray-50'}
                  title={field.description}
                >
                  <td
                    className={`px-3 py-2 font-medium ${isDarkMode ? 'text-gray-300' : 'text-gray-900'}`}
                  >
                    {field.name}
                  </td>
                  <td
                    className={`px-3 py-2 font-mono ${isDarkMode ? 'text-gray-500' : 'text-gray-500'}`}
                  >
                    {field.byte_start}-{field.byte_end}
                  </td>
                  <td
                    className={`px-3 py-2 font-mono ${isDarkMode ? 'text-blue-400' : 'text-blue-600'}`}
                  >
                    {field.data_type}
                  </td>
                  <td
                    className={`px-3 py-2 text-right font-mono ${isDarkMode ? 'text-gray-200' : 'text-gray-900'} ${
                      rawCode ? 'cursor-help' : ''
                    }`}
                    title={rawCode ? `Raw code: ${rawCode}` : undefined}
                  >
                    {formatValue(value)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
