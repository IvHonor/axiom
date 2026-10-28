import { Component, type ReactNode } from "react";

/**
 * Keeps a view's crash inside its tab: the rest of Axiom carries on, with a
 * way to try again. Give it a `key` per view so switching tabs resets it.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error("A view crashed:", error);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="view-crash" role="alert">
        <strong>This page ran into a problem.</strong>
        <p>{this.state.error.message}</p>
        <button className="btn btn-sm" onClick={() => this.setState({ error: null })}>
          Try again
        </button>
      </div>
    );
  }
}
