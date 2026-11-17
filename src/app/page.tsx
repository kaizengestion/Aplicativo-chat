import { notFound } from "next/navigation";
import { publicTenant } from "@/lib/db";
import { APP_NAME } from "@/lib/brand";
import KaizenBackdrop from "@/components/KaizenBackdrop";
import ChatWidget from "./c/[slug]/ChatWidget";

export const dynamic = "force-dynamic";

/** Negocio cuyo chat se muestra en la portada (por defecto, el de Kaizen). */
const HOME_SLUG = process.env.HOME_CHAT_SLUG || "kaizen-gestion";

export const metadata = { title: APP_NAME };

/** Portada: el cliente deja sus datos y chatea; el equipo entra al panel con el botón Admin. */
export default async function Home() {
  const tenant = await publicTenant(HOME_SLUG);
  if (!tenant) notFound();
  return (
    <>
      <KaizenBackdrop />
      <ChatWidget slug={HOME_SLUG} businessName={tenant.name} botName={tenant.bot_name} welcome={tenant.welcome_message} showAdmin />
    </>
  );
}
