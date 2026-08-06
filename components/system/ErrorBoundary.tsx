'use client';

import { Component, type ReactNode } from 'react';

type Props = {
  children: ReactNode;
  fallback: ReactNode;
};

type State = {
  hasError: boolean;
};

/**
 * React only supports catching render/lifecycle errors from a class
 * component - there is no hooks equivalent. Use this to isolate a single
 * widget (e.g. a third-party client component that makes its own network
 * calls) so its failure degrades to a local fallback instead of taking
 * down the whole page via the nearest route-level error.tsx.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.error('[error-boundary] widget failed', error);
  }

  render() {
    if (this.state.hasError) return this.props.fallback;
    return this.props.children;
  }
}
