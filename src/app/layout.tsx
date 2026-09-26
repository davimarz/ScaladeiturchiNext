import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Scala dei Turchi | Offerte Amazon",
  description: "Prodotti e offerte selezionati da Scala dei Turchi."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="it">
      <body>{children}</body>
    </html>
  );
}
