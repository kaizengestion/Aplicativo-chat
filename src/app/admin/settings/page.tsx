import { headers } from "next/headers";
import { getSession } from "@/lib/auth";
import { withTenant } from "@/lib/db";
import SettingsForm from "./SettingsForm";

export default async function Settings() {
  const s = (await getSession())!;
  const [tenant] = await withTenant(s.tenantId, (tx) => tx<{
    slug: string; name: string; bot_name: string; welcome_message: string; knowledge_base: string;
  }[]>`select slug, name, bot_name, welcome_message, knowledge_base from tenants where id = ${s.tenantId}`);
  const h = await headers();
  const base = process.env.NEXT_PUBLIC_APP_URL || `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
  const link = `${base}/c/${tenant.slug}`;
  return <SettingsForm tenant={tenant} link={link} canEdit={s.role === "admin"} />;
}
