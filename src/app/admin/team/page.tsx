import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { withTenant } from "@/lib/db";
import TeamManager from "./TeamManager";

export default async function Team() {
  const s = (await getSession())!;
  if (s.role !== "admin") redirect("/admin");
  const members = await withTenant(s.tenantId, (tx) => tx<{
    id: string; name: string; email: string; role: "admin" | "agent"; conversations: number;
  }[]>`
    select u.id, u.name, u.email, u.role,
           (select count(*)::int from conversations c where c.assigned_user_id = u.id and c.status = 'human') as conversations
    from app_users u order by u.created_at`);
  return <TeamManager members={members} me={s.userId} />;
}
