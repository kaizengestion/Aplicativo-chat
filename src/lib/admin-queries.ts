import type { Tx } from "./db";

export type ConversationRow = {
  id: string;
  status: "bot" | "human" | "closed";
  needs_human: boolean;
  handoff_reason: string | null;
  last_message_at: string;
  contact_name: string;
  contact_phone: string;
  last_message: string | null;
  last_sender: string | null;
  assigned_name: string | null;
};

export function listConversations(tx: Tx, filter: string, q: string) {
  const like = `%${q}%`;
  return tx<ConversationRow[]>`
    select c.id, c.status, c.needs_human, c.handoff_reason, c.last_message_at,
           ct.name as contact_name, ct.phone as contact_phone, u.name as assigned_name,
           lm.content as last_message, lm.sender as last_sender
    from conversations c
    join contacts ct on ct.id = c.contact_id
    left join app_users u on u.id = c.assigned_user_id
    left join lateral (
      select content, sender from messages m where m.conversation_id = c.id order by m.id desc limit 1
    ) lm on true
    where true
      ${filter === "needs_human" ? tx`and c.needs_human and c.status <> 'closed'` : tx``}
      ${filter === "human" ? tx`and c.status = 'human'` : tx``}
      ${filter === "bot" ? tx`and c.status = 'bot'` : tx``}
      ${filter === "closed" ? tx`and c.status = 'closed'` : tx``}
      ${q ? tx`and (ct.name ilike ${like} or ct.phone ilike ${like})` : tx``}
    order by c.needs_human and c.status <> 'closed' desc, c.last_message_at desc
    limit 200`;
}
