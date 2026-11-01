import { Component, type ErrorInfo, type ReactNode } from "react";
import { EmptyState } from "./settings";

export interface ErrorBoundaryProps {
  children: ReactNode;
  /** Called once per caught error. Defaults to console.error. */
  onError?: (error: Error, info: ErrorInfo) => void;
  /** Called by the Reload button. Defaults to reloading the page. */
  onReload?: () => void;
}

/** Root-level fallback: a "Something went wrong" panel with a Reload button instead of a blank window. */
export class ErrorBoundary extends Component<ErrorBoundaryProps, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    (this.props.onError ?? ((e, i) => console.error(e, i.componentStack)))(error, info);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <EmptyState icon="alert-triangle" title="Something went wrong" primary={{ label: "Reload", onClick: this.props.onReload ?? (() => window.location.reload()) }}>
        Speak Kit hit an unexpected error. Reload to continue.
      </EmptyState>
    );
  }
}
