import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import Home from './page';

// Mock inner components so they don't break tests trying to use browser APIs
vi.mock('@/components/StreamController', () => ({
  StreamController: () => <div data-testid="stream-controller" />
}));

vi.mock('@/components/NarrationPanel', () => ({
  NarrationPanel: () => <div data-testid="narration-panel" />
}));

describe('Home Page', () => {
  it('renders the header title', () => {
    render(<Home />);
    const title = screen.getByText(/AETHER VISION RAG/i);
    expect(title).toBeInTheDocument();
  });

  it('renders the stream controller', () => {
    render(<Home />);
    const streamController = screen.getByTestId('stream-controller');
    expect(streamController).toBeInTheDocument();
  });

  it('renders the narration panel', () => {
    render(<Home />);
    const narrationPanel = screen.getByTestId('narration-panel');
    expect(narrationPanel).toBeInTheDocument();
  });
});
