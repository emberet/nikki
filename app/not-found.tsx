import Link from "next/link";
export default function NotFound() {
  return (
    <main className="container">
      <div className="empty-state">
        <div className="empty-symbol">[ 404 ]</div>
        <h1 style={{ fontSize: "2rem" }}>This record is not available.</h1>
        <p>
          It may not have been published yet, or the address may be incorrect.
        </p>
        <Link href="/" className="btn btn-primary">
          Return to the archive →
        </Link>
      </div>
    </main>
  );
}
