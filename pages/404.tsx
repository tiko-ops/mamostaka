import Head from "next/head";
import assets from "../lib/assets.json";

export default function NotFound() {
  return (
    <>
      <Head>
        <title>Sidan finns inte – Mamosta</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="robots" content="noindex" />
        <meta name="color-scheme" content="light dark" />
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <link rel="stylesheet" href={assets.css} />
      </Head>

      <header className="site-header">
        <div className="wrap">
          <a className="logo" href="/" aria-label="Mamosta, startsida">Mamosta</a>
          <nav aria-label="Huvudmeny">
            <a href="/guider">Guider</a>
            <a href="/integritet">Integritet</a>
          </nav>
        </div>
      </header>

      <main className="wrap prose">
        <h1>Sidan finns inte</h1>
        <p>Länken kan vara fel, eller så har sidan flyttats.</p>
        <p>
          <a href="/">Rätta din text</a> eller läs våra <a href="/guider">språkguider</a>.
        </p>
      </main>
    </>
  );
}
