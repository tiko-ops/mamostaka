import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Mamosta Grammatik-kontroll",
  description: "Enkel svensk grammatik- och stavningskontroll.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="sv">
      <body>
        <header>
          <div className="bar">
            <div style={{fontWeight:800, letterSpacing:0.2}}>Mamosta</div>
            <nav>
              <a href="/integritet">Integritet</a>
              <a href="/villkor">Villkor</a>
            </nav>
          </div>
        </header>
        {children}
        <footer>© {new Date().getFullYear()} Mamosta</footer>
      </body>
    </html>
  );
}
