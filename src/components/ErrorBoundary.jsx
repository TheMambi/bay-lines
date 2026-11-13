import { Component } from 'react';

// Without a boundary, an error thrown while rendering unmounts the whole app and leaves a blank page.
export class ErrorBoundary extends Component {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) {
      return this.props.children;
    }
    return (
      <main className="crash">
        <div role="alert">
          <h1 className="card-title">Something went wrong</h1>
          <p>Bay Lines hit a problem and had to stop. Reloading the page usually fixes it.</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>
          Reload the page
        </button>
      </main>
    );
  }
}
