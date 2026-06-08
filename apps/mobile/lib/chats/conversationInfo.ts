import { supabase } from "@/lib/supabase";
import { getReadReceiptsPreference } from "@/lib/chats/api";

export type ConversationMemberInfo = {
  userId: string;
  role: string;
  firstName: string | null;
  lastName: string | null;
  photoUrl: string | null;
};

export type ConversationDetails = {
  conversationId: string;
  conversationType: string;
  conversationName: string | null;
  mode: string;
  groupId: string | null;
  groupName: string | null;
  groupDescription: string | null;
  groupAvatarUrl: string | null;
  groupCreatedBy: string | null;
  members: ConversationMemberInfo[];
  muted: boolean;
  readReceiptsOn: boolean;
  meId: string;
};

function memberDisplayName(firstName: string | null, lastName: string | null, fallback = "Member") {
  const name = `${firstName ?? ""} ${lastName ?? ""}`.trim();
  return name || fallback;
}

export function formatConversationMemberName(member: ConversationMemberInfo, meId?: string | null) {
  const base = memberDisplayName(member.firstName, member.lastName);
  if (meId && member.userId === meId) return `${base} (You)`;
  return base;
}

function photoForMode(
  mode: string,
  user: { main_photo_url?: string | null; romance_photos?: (string | null)[]; friends_photos?: (string | null)[]; business_photos?: (string | null)[] }
) {
  const first = (photos?: (string | null)[]) => photos?.find((x) => !!x) ?? null;
  if (mode === "romance") return first(user.romance_photos) ?? user.main_photo_url ?? null;
  if (mode === "friends") return first(user.friends_photos) ?? user.main_photo_url ?? null;
  if (mode === "business") return first(user.business_photos) ?? user.main_photo_url ?? null;
  return user.main_photo_url ?? null;
}

/** Load metadata for the conversation info screen (group chats and settings). */
export async function loadConversationDetails(conversationId: string): Promise<ConversationDetails> {
  const { data: auth } = await supabase.auth.getUser();
  const meId = auth.user?.id;
  if (!meId) throw new Error("Not signed in");

  const { data: conv, error: convErr } = await supabase
    .from("conversations")
    .select("id,type,mode,name,related_group_id,created_by")
    .eq("id", conversationId)
    .single();
  if (convErr || !conv) throw new Error(convErr?.message ?? "Conversation not found");

  const mode = String((conv as { mode?: string }).mode ?? "friends");
  const relatedGroupId = (conv as { related_group_id?: string | null }).related_group_id ?? null;

  let groupName: string | null = null;
  let groupDescription: string | null = null;
  let groupAvatarUrl: string | null = null;
  let groupCreatedBy: string | null = null;

  if (relatedGroupId) {
    const { data: group } = await supabase
      .from("groups")
      .select("id,name,description,avatar_url,created_by")
      .eq("id", relatedGroupId)
      .maybeSingle();
    if (group) {
      groupName = (group as { name?: string }).name ?? null;
      groupDescription = (group as { description?: string | null }).description ?? null;
      groupAvatarUrl = (group as { avatar_url?: string | null }).avatar_url ?? null;
      groupCreatedBy = (group as { created_by?: string }).created_by ?? null;
    }
  }

  const { data: memberRows } = await supabase
    .from("conversation_members")
    .select("user_id,role")
    .eq("conversation_id", conversationId)
    .is("left_at", null);

  const memberIds = (memberRows ?? []).map((row) => row.user_id).filter(Boolean) as string[];

  const usersById: Record<
    string,
    {
      first_name: string | null;
      last_name: string | null;
      main_photo_url: string | null;
      romance_photos?: (string | null)[];
      friends_photos?: (string | null)[];
      business_photos?: (string | null)[];
    }
  > = {};

  if (memberIds.length > 0) {
    const [profilesRes, modeProfilesRes] = await Promise.all([
      supabase.from("user_profiles").select("id,first_name,last_name,main_photo_url").in("id", memberIds),
      supabase
        .from("profiles_mode")
        .select("user_id,mode,photos")
        .in("user_id", memberIds)
        .in("mode", ["romance", "friends", "business"]),
    ]);

    for (const row of (profilesRes.data ?? []) as {
      id: string;
      first_name: string | null;
      last_name: string | null;
      main_photo_url: string | null;
    }[]) {
      usersById[row.id] = {
        first_name: row.first_name,
        last_name: row.last_name,
        main_photo_url: row.main_photo_url,
      };
    }

    for (const row of (modeProfilesRes.data ?? []) as {
      user_id: string;
      mode: string;
      photos: (string | null)[];
    }[]) {
      const user = usersById[row.user_id];
      if (!user) continue;
      if (row.mode === "romance") user.romance_photos = row.photos ?? [];
      else if (row.mode === "friends") user.friends_photos = row.photos ?? [];
      else if (row.mode === "business") user.business_photos = row.photos ?? [];
    }
  }

  const roleRank = (role: string) => {
    if (role === "owner") return 0;
    if (role === "admin") return 1;
    if (role === "moderator") return 2;
    return 3;
  };

  const members: ConversationMemberInfo[] = (memberRows ?? [])
    .map((row) => {
      const user = usersById[row.user_id];
      return {
        userId: row.user_id,
        role: row.role ?? "member",
        firstName: user?.first_name ?? null,
        lastName: user?.last_name ?? null,
        photoUrl: user ? photoForMode(mode, user) : null,
      };
    })
    .sort((a, b) => {
      const rank = roleRank(a.role) - roleRank(b.role);
      if (rank !== 0) return rank;
      return formatConversationMemberName(a).localeCompare(formatConversationMemberName(b));
    });

  const { data: settings } = await supabase
    .from("conversation_member_settings")
    .select("muted")
    .eq("conversation_id", conversationId)
    .eq("user_id", meId)
    .maybeSingle();

  const readReceiptsOn = await getReadReceiptsPreference();

  return {
    conversationId,
    conversationType: String((conv as { type?: string }).type ?? "group"),
    conversationName: (conv as { name?: string | null }).name ?? null,
    mode,
    groupId: relatedGroupId,
    groupName,
    groupDescription,
    groupAvatarUrl,
    groupCreatedBy,
    members,
    muted: (settings as { muted?: boolean } | null)?.muted ?? false,
    readReceiptsOn,
    meId,
  };
}
