import { LivePresentation } from "./presentation";

export const metadata = {
  title: "Presentación del intercambio · Amigo Secreto",
  description: "Pantalla de presentación para el intercambio presencial.",
  robots: { index: false, follow: false },
};

export default function PresentationPage() {
  return <LivePresentation previewProtected={process.env.VERCEL_ENV === "preview"} />;
}
