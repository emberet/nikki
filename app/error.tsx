"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="container">
      <div className="empty-state">
        <h2>We couldn’t load this page.</h2>
        <p>Please try again. Your submitted records remain saved.</p>
        <button className="btn btn-primary" onClick={reset}>
          Try again ↻
        </button>
      </div>
    </main>
  );
}
