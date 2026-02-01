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
 * Loads trace data and triggers backend rendering based on the current store state.
 * Handles conversion of backend-rendered images to displayable formats.
 *
 * @returns Object containing render functions
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
      toast.error('Cannot render: No SEG-Y file loaded');
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
      toast.error(`Rendering failed for ${modeLabel}: ${errorMsg}`, { id: toastId });
      console.error(`Render error (${modeLabel} mode):`, error);
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
 * Converts a backend-rendered PNG payload into an HTMLImageElement.
 * Creates a blob from the image data and loads it as an image element.
 *
 * @param rendered - The rendered image data from the backend
 * @returns Promise resolving to an HTML image element
 * @throws Error if the image fails to load
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
      reject(new Error('Failed to load rendered image from backend data'));
    };
    img.src = url;
  });
}
