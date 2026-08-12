import "./globals.css";
import "./whot.css";
import "@rainbow-me/rainbowkit/styles.css";
import type { Metadata, Viewport } from "next";
import { Providers } from "@/components/Providers";
import { Header } from "@/components/Header";
import { Toaster } from "sonner";

export const metadata: Metadata = {
  title: "WHOT",
  description:
    "African WHOT. Play the computer now, or host a table and send the number to a friend.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#efe6d4",
  interactiveWidget: "resizes-content",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html suppressHydrationWarning lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,600;12..96,700;12..96,800&family=IBM+Plex+Mono:wght@400;500&family=Source+Serif+4:opsz,wght@8..60,400;8..60,600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body suppressHydrationWarning className="min-h-screen">
        <Providers>
          <Header />
          {children}
        </Providers>
        <Toaster
          position="bottom-center"
          toastOptions={{
            style: {
              background: "var(--paper)",
              color: "var(--ink)",
              border: "1px solid var(--ink)",
              fontFamily: "var(--font-serif), Georgia, serif",
              fontSize: "15px",
            },
          }}
        />
      </body>
    </html>
  );
}
