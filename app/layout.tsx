import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MagicResume — your evidence-first career partner",
  description:
    "MagicResume remembers your work, uncovers your impact, and turns each opportunity into a truthful application and gap-closing plan.",
};

// Webfonts used by the renderer + the canvas-based fit measurement.
// Loaded via plain <link> (React 19 hoists these to <head>) so canvas
// measureText can reference the plain family names.
const FONT_CSS =
  "https://fonts.googleapis.com/css2?" +
  [
    "family=Carlito:ital,wght@0,400;0,700;1,400",
    "family=Inter:wght@400;600;700",
    "family=Lato:ital,wght@0,400;0,700;1,400",
    "family=Open+Sans:ital,wght@0,400;0,700;1,400",
    "family=Montserrat:wght@400;600;700",
    "family=Nunito:ital,wght@0,400;0,700;1,400",
    "family=Raleway:ital,wght@0,400;0,700;1,400",
    "family=Roboto:ital,wght@0,400;0,700;1,400",
    "family=Source+Serif+4:opsz,wght@8..60,400;8..60,700",
    "family=PT+Serif:ital,wght@0,400;0,700;1,400",
    "family=EB+Garamond:ital,wght@0,400;0,700;1,400",
    "family=Roboto+Slab:wght@400;600;700",
    "display=swap",
  ].join("&");

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full bg-zinc-100 text-zinc-900 antialiased">
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link rel="stylesheet" href={FONT_CSS} />
        {children}
      </body>
    </html>
  );
}
