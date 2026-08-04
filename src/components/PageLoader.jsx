import React from 'react';

const PageLoader = () => (
  <main className="app-loading" role="status" aria-live="polite">
    <div className="app-loading__content">
      <span className="brand-mark">C</span>
      <span className="app-loading__spinner" aria-hidden="true" />
      <strong>Opening Chatspace</strong>
      <span>Connecting to your workspace…</span>
    </div>
  </main>
);

export default PageLoader;
