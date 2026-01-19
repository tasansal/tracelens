import { useAppStore } from '@/store.ts';
import { useTraceVisualizationStore } from '@/store/traceVisualizationStore.ts';
import { RenderedImage } from '@/types/rendering.ts';
import { DataSampleFormat, getDataSampleFormatCode } from '@/types/segy.ts';
import { invoke } from '@tauri-apps/api/core';
import { useCallback } from 'react';
import toast from 'react-hot-toast';

export function useTraceLoader() {
  const { filePath, segyData } = useAppStore();
  const {
    viewport,
    colormap,
    amplitudeScaling,
    renderMode,
    wiggleConfig,
    setCurrentImage,
    setIsRendering,
  } = useTraceVisualizationStore();

  const loadAndRenderVariableDensity = useCallback(async () => {
    if (!filePath || !segyData) {
      toast.error('No SEG-Y file loaded');
      return;
    }

    setIsRendering(true);
    const modeLabel =
      renderMode === 'variable-density' ? 'VD' : renderMode === 'wiggle' ? 'Wiggle' : 'Wiggle+VD';
    const toastId = toast.loading(`Rendering ${modeLabel} view...`);

    try {
      // Use viewport dimensions directly - don't adjust for zoom to avoid infinite loops
      const rendered = await invoke<RenderedImage>('render_variable_density', {
        filePath,
        viewport,
        colormapType: colormap,
        scaling: amplitudeScaling,
        renderMode,
        wiggleConfig: renderMode !== 'variable-density' ? wiggleConfig : null,
        segyConfig: {
          samplesPerTrace: segyData.binary_header.samples_per_trace,
          dataSampleFormat: getDataSampleFormatCode(
            segyData.binary_header.data_sample_format as DataSampleFormat
          ),
          byteOrder: segyData.byte_order,
        },
      });

      // Convert to displayable format
      const image = await createImageFromRendered(rendered);
      setCurrentImage(image);

      toast.success('Render complete', { id: toastId });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      toast.error(`Rendering failed: ${errorMsg}`, { id: toastId });
      console.error('Render error:', error);
    } finally {
      setIsRendering(false);
    }
  }, [
    filePath,
    segyData,
    viewport,
    colormap,
    amplitudeScaling,
    renderMode,
    wiggleConfig,
    setCurrentImage,
    setIsRendering,
  ]);

  return {
    loadAndRenderVariableDensity,
  };
}

async function createImageFromRendered(rendered: RenderedImage): Promise<HTMLImageElement> {
  // Create Image element from PNG bytes
  const blob = new Blob([new Uint8Array(rendered.data)], { type: 'image/png' });
  const url = URL.createObjectURL(blob);

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image'));
    };
    img.src = url;
  });
}
