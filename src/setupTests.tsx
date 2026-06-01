import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

// Mock Radix UI Dialog primitives globally to prevent
// "Missing Description or aria-describedby" warnings in tests
// and avoid portal rendering issues in jsdom.
vi.mock('@/shared/ui/dialog', async () => {
  const actual = await vi.importActual('@/shared/ui/dialog');
  return {
    ...actual,
    Dialog: ({ children, open }: { children: React.ReactNode; open?: boolean }) =>
      open !== false ? <div data-testid="dialog-root">{children}</div> : null,
    DialogContent: ({ children }: { children: React.ReactNode }) => (
      <div data-testid="dialog-content">{children}</div>
    ),
    DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
    DialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  };
});

// jsdom does not implement matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});
