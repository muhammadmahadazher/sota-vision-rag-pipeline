import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Aether Vision RAG — Real-time visual intelligence",
  description: "An open-source, privacy-first Vision RAG workspace for live detection, temporal memory, and grounded scene narration.",
  applicationName: "Aether Vision RAG",
  keywords: ["Vision RAG", "computer vision", "YOLO-World", "Qdrant", "Gemini", "multimodal AI"],
  authors: [{ name: "Muhammad Mahad Azher" }],
  openGraph: {
    title: "Aether Vision RAG",
    description: "Turn live video into searchable context.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#07090d",
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
