-- Winkly RLS Policies — Identity Firewall (spec v8.1)
-- Enable RLS on all tables

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles_core ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles_mode ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles_business ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.planner_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.planner_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_chat_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wishlist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calendar_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_requests ENABLE ROW LEVEL SECURITY;

-- Users: own row only
DROP POLICY IF EXISTS users_select_own ON public.users;
DROP POLICY IF EXISTS users_update_own ON public.users;
CREATE POLICY users_select_own ON public.users FOR SELECT USING (auth.uid() = id);
CREATE POLICY users_update_own ON public.users FOR UPDATE USING (auth.uid() = id);

-- Profiles core: own row
DROP POLICY IF EXISTS profiles_core_all ON public.profiles_core;
CREATE POLICY profiles_core_all ON public.profiles_core FOR ALL USING (auth.uid() = id);

-- Profiles mode: own rows
DROP POLICY IF EXISTS profiles_mode_all ON public.profiles_mode;
CREATE POLICY profiles_mode_all ON public.profiles_mode FOR ALL USING (auth.uid() = user_id);

-- Profiles business: own row
DROP POLICY IF EXISTS profiles_business_all ON public.profiles_business;
CREATE POLICY profiles_business_all ON public.profiles_business FOR ALL USING (auth.uid() = id);

-- Follows: read own, insert/delete own
DROP POLICY IF EXISTS follows_select ON public.follows;
DROP POLICY IF EXISTS follows_insert ON public.follows;
DROP POLICY IF EXISTS follows_delete ON public.follows;
CREATE POLICY follows_select ON public.follows FOR SELECT USING (
  auth.uid() = follower_id OR auth.uid() = followee_id
);
CREATE POLICY follows_insert ON public.follows FOR INSERT WITH CHECK (auth.uid() = follower_id);
CREATE POLICY follows_delete ON public.follows FOR DELETE USING (auth.uid() = follower_id);

-- Events: creator + participants can read; creator can mutate
DROP POLICY IF EXISTS events_select ON public.events;
DROP POLICY IF EXISTS events_insert ON public.events;
DROP POLICY IF EXISTS events_update ON public.events;
CREATE POLICY events_select ON public.events FOR SELECT USING (
  auth.uid() = created_by OR
  EXISTS (SELECT 1 FROM public.event_participants ep WHERE ep.event_id = events.id AND ep.user_id = auth.uid())
);
CREATE POLICY events_insert ON public.events FOR INSERT WITH CHECK (auth.uid() = created_by);
CREATE POLICY events_update ON public.events FOR UPDATE USING (auth.uid() = created_by);

-- Event participants: participants can read; creator can manage
DROP POLICY IF EXISTS event_participants_all ON public.event_participants;
CREATE POLICY event_participants_all ON public.event_participants FOR ALL USING (
  auth.uid() = user_id OR
  EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND e.created_by = auth.uid())
);

-- Event invitations
DROP POLICY IF EXISTS event_invitations_all ON public.event_invitations;
CREATE POLICY event_invitations_all ON public.event_invitations FOR ALL USING (
  auth.uid() = inviter_id OR auth.uid() = invitee_id
);

-- Planner items: creator + participants
DROP POLICY IF EXISTS planner_items_select ON public.planner_items;
DROP POLICY IF EXISTS planner_items_insert ON public.planner_items;
DROP POLICY IF EXISTS planner_items_update ON public.planner_items;
CREATE POLICY planner_items_select ON public.planner_items FOR SELECT USING (
  auth.uid() = created_by OR
  EXISTS (SELECT 1 FROM public.planner_participants pp WHERE pp.planner_item_id = planner_items.id AND pp.user_id = auth.uid())
);
CREATE POLICY planner_items_insert ON public.planner_items FOR INSERT WITH CHECK (auth.uid() = created_by);
CREATE POLICY planner_items_update ON public.planner_items FOR UPDATE USING (auth.uid() = created_by);

-- Planner participants
DROP POLICY IF EXISTS planner_participants_all ON public.planner_participants;
CREATE POLICY planner_participants_all ON public.planner_participants FOR ALL USING (
  auth.uid() = user_id OR
  EXISTS (SELECT 1 FROM public.planner_items pi WHERE pi.id = planner_item_id AND pi.created_by = auth.uid())
);

-- Conversations: members only (mode-keyed; no cross-mode leakage)
DROP POLICY IF EXISTS conversations_select ON public.conversations;
DROP POLICY IF EXISTS conversations_insert ON public.conversations;
CREATE POLICY conversations_select ON public.conversations FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.conversation_members cm WHERE cm.conversation_id = conversations.id AND cm.user_id = auth.uid())
);
CREATE POLICY conversations_insert ON public.conversations FOR INSERT WITH CHECK (auth.uid() = created_by);

-- Conversation members
DROP POLICY IF EXISTS conversation_members_all ON public.conversation_members;
CREATE POLICY conversation_members_all ON public.conversation_members FOR ALL USING (
  auth.uid() = user_id OR
  EXISTS (SELECT 1 FROM public.conversations c WHERE c.id = conversation_id AND c.created_by = auth.uid())
);

-- Messages: members of conversation
DROP POLICY IF EXISTS messages_select ON public.messages;
DROP POLICY IF EXISTS messages_insert ON public.messages;
CREATE POLICY messages_select ON public.messages FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.conversation_members cm WHERE cm.conversation_id = messages.conversation_id AND cm.user_id = auth.uid())
);
CREATE POLICY messages_insert ON public.messages FOR INSERT WITH CHECK (
  auth.uid() = sender_id AND
  EXISTS (SELECT 1 FROM public.conversation_members cm WHERE cm.conversation_id = messages.conversation_id AND cm.user_id = auth.uid())
);

-- Event chat settings
DROP POLICY IF EXISTS event_chat_settings_all ON public.event_chat_settings;
CREATE POLICY event_chat_settings_all ON public.event_chat_settings FOR ALL USING (
  EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND e.created_by = auth.uid())
);

-- Groups
DROP POLICY IF EXISTS groups_select ON public.groups;
DROP POLICY IF EXISTS groups_insert ON public.groups;
CREATE POLICY groups_select ON public.groups FOR SELECT USING (
  auth.uid() = created_by OR
  EXISTS (SELECT 1 FROM public.group_members gm WHERE gm.group_id = groups.id AND gm.user_id = auth.uid())
);
CREATE POLICY groups_insert ON public.groups FOR INSERT WITH CHECK (auth.uid() = created_by);

-- Group members
DROP POLICY IF EXISTS group_members_all ON public.group_members;
CREATE POLICY group_members_all ON public.group_members FOR ALL USING (
  auth.uid() = user_id OR
  EXISTS (SELECT 1 FROM public.groups g WHERE g.id = group_id AND g.created_by = auth.uid())
);

-- Wishlist items: own
DROP POLICY IF EXISTS wishlist_items_all ON public.wishlist_items;
CREATE POLICY wishlist_items_all ON public.wishlist_items FOR ALL USING (auth.uid() = user_id);

-- User preferences: own
DROP POLICY IF EXISTS user_preferences_all ON public.user_preferences;
CREATE POLICY user_preferences_all ON public.user_preferences FOR ALL USING (auth.uid() = user_id);

-- Calendar connections: own
DROP POLICY IF EXISTS calendar_connections_all ON public.calendar_connections;
CREATE POLICY calendar_connections_all ON public.calendar_connections FOR ALL USING (auth.uid() = user_id);

-- AI requests: own
DROP POLICY IF EXISTS ai_requests_all ON public.ai_requests;
CREATE POLICY ai_requests_all ON public.ai_requests FOR ALL USING (auth.uid() = user_id);
