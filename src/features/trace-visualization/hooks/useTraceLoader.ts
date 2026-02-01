/**
 * Hook for invoking backend render commands and converting results to images.
 */
import { useTraceVisualizationStore } from '@/features/trace-visualization/store/traceVisualizationStore';
import type { RenderedImage } from '@/features/trace-visualization/types/rendering';
import { renderVariableDensity } from '@/shared/api/tauri/segy';
import { useAppStore } from '@/shared/store/appStore';
import { useCallback } from 'react';
import toast from 'react-hot-toast';

/**
 * Load trace data and trigger backend rendering based on the current store state.
 */
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
      const rendered = await renderVariableDensity({
        filePath,
        viewport,
        colormapType: colormap,
        scaling: amplitudeScaling,
        renderMode,
        wiggleConfig,
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

/**
 * Convert a backend-rendered PNG payload into an HTMLImageElement.
 */
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
