// apps/mobile/types/database.ts
//
// Typed representation of the Winkly Supabase schema (public schema).
// This is the source of truth referenced by the architecture docs. Use the
// `Tables<'x'>`, `TablesInsert<'x'>`, and `Enums<'x'>` helpers to type query
// results and payloads, or pass `Database` to `createClient<Database>()`.
//
// Regenerate the canonical version any time with:
//   npx supabase gen types typescript --linked --schema public > apps/mobile/types/database.ts
//
// Until then this is hand-maintained and must stay aligned with
// supabase/migrations/*. It intentionally covers the core tables; tables that
// are only touched server-side (Edge Functions / service role) may be omitted.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type AccountType = "personal" | "business";
export type AppMode = "romance" | "friends" | "business" | "events";
export type PlannerSource = "romance" | "friends" | "business" | "events";
export type ConversationType = "dm" | "group" | "event" | "ai";
export type Visibility = "public" | "connections" | "private";
export type SubscriptionTier = "free" | "super" | "premium" | "enterprise";
export type SwipeAction = "pass";
export type FriendsRequestKind = "connect" | "super_connect";

type Timestamps = {
  created_at: string;
  updated_at: string;
};

export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string;
          email: string | null;
          account_type: AccountType;
          is_premium: boolean;
          premium_until: string | null;
          subscription_tier: SubscriptionTier;
          status: string;
        } & Timestamps;
        Insert: {
          id: string;
          email?: string | null;
          account_type?: AccountType;
          is_premium?: boolean;
          premium_until?: string | null;
          subscription_tier?: SubscriptionTier;
          status?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["users"]["Insert"]>;
        Relationships: [];
      };
      profiles_core: {
        Row: {
          id: string;
          first_name: string | null;
          last_name: string | null;
          gender: string | null;
          birthday: string | null;
          city: string | null;
          education: string | null;
          languages: string[] | null;
          occupation: string | null;
          bio: string | null;
          interests: string[] | null;
          core_photos: string[] | null;
          show_full_name: boolean | null;
        } & Timestamps;
        Insert: {
          id: string;
          first_name?: string | null;
          last_name?: string | null;
          gender?: string | null;
          birthday?: string | null;
          city?: string | null;
          education?: string | null;
          languages?: string[] | null;
          occupation?: string | null;
          bio?: string | null;
          interests?: string[] | null;
          core_photos?: string[] | null;
          show_full_name?: boolean | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["profiles_core"]["Insert"]>;
        Relationships: [];
      };
      sub_profiles: {
        Row: {
          id: string;
          user_id: string;
          mode: AppMode;
          bio: string | null;
          photos: string[] | null;
          interests: string[] | null;
          meta: Json | null;
        } & Timestamps;
        Insert: {
          id?: string;
          user_id: string;
          mode: AppMode;
          bio?: string | null;
          photos?: string[] | null;
          interests?: string[] | null;
          meta?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["sub_profiles"]["Insert"]>;
        Relationships: [];
      };
      profiles_business: {
        Row: {
          id: string;
          business_name: string;
          location: string | null;
          area: string | null;
          bio: string | null;
          tags: string[] | null;
          website: string | null;
          instagram: string | null;
          facebook: string | null;
          linkedin: string | null;
          logo_uri: string | null;
        } & Timestamps;
        Insert: {
          id: string;
          business_name: string;
          location?: string | null;
          area?: string | null;
          bio?: string | null;
          tags?: string[] | null;
          website?: string | null;
          instagram?: string | null;
          facebook?: string | null;
          linkedin?: string | null;
          logo_uri?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["profiles_business"]["Insert"]>;
        Relationships: [];
      };
      follows: {
        Row: {
          id: string;
          follower_id: string;
          followee_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          follower_id: string;
          followee_id: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["follows"]["Insert"]>;
        Relationships: [];
      };
      events: {
        Row: {
          id: string;
          created_by: string;
          title: string;
          description: string | null;
          location: string | null;
          starts_at: string;
          ends_at: string | null;
          cover_image_uri: string | null;
          visibility: Visibility;
          mode: AppMode;
        } & Timestamps;
        Insert: {
          id?: string;
          created_by: string;
          title: string;
          description?: string | null;
          location?: string | null;
          starts_at: string;
          ends_at?: string | null;
          cover_image_uri?: string | null;
          visibility?: Visibility;
          mode?: AppMode;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["events"]["Insert"]>;
        Relationships: [];
      };
      event_participants: {
        Row: {
          id: string;
          event_id: string;
          user_id: string;
          role: string;
          rsvp_status: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          event_id: string;
          user_id: string;
          role?: string;
          rsvp_status?: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["event_participants"]["Insert"]>;
        Relationships: [];
      };
      planner_items: {
        Row: {
          id: string;
          created_by: string;
          source_mode: PlannerSource;
          title: string;
          description: string | null;
          starts_at: string;
          ends_at: string | null;
          related_event_id: string | null;
          related_user_id: string | null;
          meta: Json | null;
        } & Timestamps;
        Insert: {
          id?: string;
          created_by: string;
          source_mode: PlannerSource;
          title: string;
          description?: string | null;
          starts_at: string;
          ends_at?: string | null;
          related_event_id?: string | null;
          related_user_id?: string | null;
          meta?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["planner_items"]["Insert"]>;
        Relationships: [];
      };
      planner_participants: {
        Row: {
          id: string;
          planner_item_id: string;
          user_id: string;
          role: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          planner_item_id: string;
          user_id: string;
          role?: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["planner_participants"]["Insert"]>;
        Relationships: [];
      };
      conversations: {
        Row: {
          id: string;
          type: ConversationType;
          mode: AppMode;
          created_by: string;
          related_event_id: string | null;
          related_group_id: string | null;
        } & Timestamps;
        Insert: {
          id?: string;
          type?: ConversationType;
          mode: AppMode;
          created_by: string;
          related_event_id?: string | null;
          related_group_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["conversations"]["Insert"]>;
        Relationships: [];
      };
      conversation_members: {
        Row: {
          id: string;
          conversation_id: string;
          user_id: string;
          role: string;
          joined_at: string;
        };
        Insert: {
          id?: string;
          conversation_id: string;
          user_id: string;
          role?: string;
          joined_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["conversation_members"]["Insert"]>;
        Relationships: [];
      };
      messages: {
        Row: {
          id: string;
          conversation_id: string;
          sender_id: string;
          content: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          conversation_id: string;
          sender_id: string;
          content: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["messages"]["Insert"]>;
        Relationships: [];
      };
      user_swipes: {
        Row: {
          user_id: string;
          target_user_id: string;
          mode: AppMode;
          action: SwipeAction;
          reason: string | null;
          created_at: string;
        };
        Insert: {
          user_id: string;
          target_user_id: string;
          mode: AppMode;
          action: SwipeAction;
          reason?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["user_swipes"]["Insert"]>;
        Relationships: [];
      };
      friends_requests: {
        Row: {
          requester_id: string;
          requested_id: string;
          kind: FriendsRequestKind;
          message: string | null;
          created_at: string;
        };
        Insert: {
          requester_id: string;
          requested_id: string;
          kind?: FriendsRequestKind;
          message?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["friends_requests"]["Insert"]>;
        Relationships: [];
      };
    };
    Views: {
      [key: string]: {
        Row: Record<string, Json>;
      };
    };
    Functions: {
      [key: string]: {
        Args: Record<string, Json>;
        Returns: Json;
      };
    };
    Enums: {
      account_type: AccountType;
      app_mode: AppMode;
      planner_source: PlannerSource;
      conversation_type: ConversationType;
      visibility: Visibility;
      subscription_tier: SubscriptionTier;
      swipe_action: SwipeAction;
      friends_request_kind: FriendsRequestKind;
    };
    CompositeTypes: Record<string, never>;
  };
}

// Convenience helpers for consumers.
export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];
export type TablesInsert<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Insert"];
export type TablesUpdate<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Update"];
export type Enums<T extends keyof Database["public"]["Enums"]> =
  Database["public"]["Enums"][T];
