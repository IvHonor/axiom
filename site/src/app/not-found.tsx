import Link from "next/link";

export default function NotFound() {
  return (
    <article className="page wrap">
      <h1>Page not found</h1>
      <p className="page-lede">That page doesn&apos;t exist, or it moved.</p>
      <p>
        <Link href="/" className="button button-secondary button-md">
          Back to the home page
        </Link>
      </p>
    </article>
  );
}
