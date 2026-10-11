import { Html, Head, Main, NextScript } from "next/document";

// Används bara av 404-sidan – övriga sidor är statisk HTML i public/
export default function Document() {
  return (
    <Html lang="sv">
      <Head />
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
