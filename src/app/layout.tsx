import type { Metadata } from "next";
import { Chakra_Petch, Instrument_Sans } from "next/font/google";
import { Nav } from "@/components/Nav";
import "./globals.css";

const display = Chakra_Petch({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const body = Instrument_Sans({
  variable: "--font-body",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Radar Legislativo",
  description: "Câmara e Senado em tempo real: composição, votações, tramitação e agenda.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className={`${display.variable} ${body.variable} antialiased`}>
      <body className="min-h-dvh">
        <div className="mx-auto flex min-h-dvh max-w-[1500px] flex-col lg:flex-row">
          <Nav />
          <main className="min-w-0 flex-1 px-4 pb-16 pt-4 sm:px-6 lg:px-10 lg:pt-8">{children}</main>
        </div>
      </body>
    </html>
  );
}
