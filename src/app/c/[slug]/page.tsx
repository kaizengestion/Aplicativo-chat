import { notFound } from "next/navigation";
import { publicTenant } from "@/lib/db";
import { APP_NAME } from "@/lib/brand";
import ChatWidget from "./ChatWidget";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  try {
    const tenant = await publicTenant((await params).slug);
    return { title: tenant ? `${APP_NAME} · ${tenant.name}` : APP_NAME };
  } catch (e) {
    console.error("Error al generar metadata del chat", e);
    return { title: APP_NAME };
  }
}

export default async function PublicChat({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const tenant = await publicTenant(slug);
  if (!tenant) notFound();
  return <ChatWidget slug={slug} businessName={tenant.name} botName={tenant.bot_name} welcome={tenant.welcome_message} />;
}
