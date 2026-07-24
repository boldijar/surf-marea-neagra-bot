import "./globals.css";

export const metadata = {
  title: "Marea Neagră — Telegram surf bot",
  description: "Telegram surf reports for the Black Sea.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="ro">
      <body>{children}</body>
    </html>
  );
}
