import { render, screen, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NarrationPanel } from './NarrationPanel';

// Mock framer-motion to avoid animation issues in tests
vi.mock('framer-motion', () => ({
  motion: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars
    div: ({ children, layout, ...props }: any) => <div {...props}>{children}</div>,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars
    p: ({ children, layout, ...props }: any) => <p {...props}>{children}</p>,
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

describe('NarrationPanel', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders waiting state initially', () => {
    render(<NarrationPanel narrative="" />);
    expect(screen.getByText(/Waiting for stream synthesis.../i)).toBeInTheDocument();
  });

  it('types out the narrative', () => {
    render(<NarrationPanel narrative="Hello" />);

    // Initially shouldn't be full text yet
    expect(screen.queryByText('Hello')).not.toBeInTheDocument();

    // Fast-forward timers by enough time (20ms * 5 chars = 100ms)
    act(() => {
      vi.advanceTimersByTime(150);
    });

    expect(screen.getByText('Hello')).toBeInTheDocument();
  });

  it('adds previous narrative to history when a new one is provided', () => {
    const { rerender } = render(<NarrationPanel narrative="First narrative" />);

    act(() => {
      vi.advanceTimersByTime(500); // Wait for typing to finish
    });

    expect(screen.getByText('First narrative')).toBeInTheDocument();

    // Provide new narrative
    rerender(<NarrationPanel narrative="Second narrative" />);

    // History should now contain the first narrative
    // It's rendered in the history list which also has styling
    expect(screen.getAllByText('First narrative').length).toBeGreaterThan(0);
  });
});
