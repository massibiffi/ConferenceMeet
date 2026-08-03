// Hand-written types for the v1 schema. Once your schema is live you can replace
// this with generated types: `supabase gen types typescript --project-id <ref>`.

export type RoleCategory =
  | "ngo"
  | "journalist"
  | "researcher"
  | "activist"
  | "youth_delegate"
  | "other";

export type VerificationLevel =
  | "none"
  | "email"
  | "linkedin"
  | "org_domain"
  | "manual";

export type ConnectionStatus = "pending" | "accepted" | "blocked";

export const ROLE_LABELS: Record<RoleCategory, string> = {
  ngo: "NGO",
  journalist: "Journalist",
  researcher: "Researcher",
  activist: "Activist",
  youth_delegate: "Youth delegate",
  other: "Other",
};

export interface UserProfile {
  id: string;
  name: string;
  photo_url: string | null;
  headline: string | null;
  org: string | null;
  role: RoleCategory;
  bio: string | null;
  intent_text: string | null;
  verification_level: VerificationLevel;
  is_staff: boolean;
  is_banned: boolean;
  created_at: string;
}

export interface Interest {
  id: number;
  label: string;
  category: string | null;
}

export interface EventRow {
  id: string;
  name: string;
  location: string | null;
  start_date: string | null;
  end_date: string | null;
  description: string | null;
  status: string;
}

export interface Sponsor {
  id: string;
  event_id: string;
  name: string;
  logo_url: string | null;
  tagline: string | null;
  link_url: string | null;
  weight: number;
  is_active: boolean;
  created_at: string;
}

// Shape returned by the suggested_matches() RPC.
export interface MatchResult {
  user_id: string;
  name: string;
  headline: string | null;
  org: string | null;
  role: RoleCategory;
  photo_url: string | null;
  verification_level: VerificationLevel;
  score: number;
  shared_interests: string[];
}

// Minimal Database type so createClient<Database> is typed enough to be useful.
// Extend as needed, or generate the full type from your live schema.
export interface Database {
  public: {
    Tables: {
      users: { Row: UserProfile; Insert: Partial<UserProfile> & { id: string }; Update: Partial<UserProfile> };
      interests: { Row: Interest; Insert: Partial<Interest>; Update: Partial<Interest> };
      events: { Row: EventRow; Insert: Partial<EventRow>; Update: Partial<EventRow> };
      user_interests: {
        Row: { user_id: string; interest_id: number };
        Insert: { user_id: string; interest_id: number };
        Update: Partial<{ user_id: string; interest_id: number }>;
      };
      event_attendees: {
        Row: { user_id: string; event_id: string; joined_at: string };
        Insert: { user_id: string; event_id: string };
        Update: Partial<{ user_id: string; event_id: string }>;
      };
      connections: {
        Row: {
          id: string;
          requester_id: string;
          recipient_id: string;
          status: ConnectionStatus;
          created_at: string;
        };
        Insert: { requester_id: string; recipient_id: string; status?: ConnectionStatus };
        Update: Partial<{ status: ConnectionStatus }>;
      };
      reports: {
        Row: {
          id: string;
          reporter_id: string;
          reported_user_id: string;
          reason: string | null;
          status: string;
          created_at: string;
        };
        Insert: { reporter_id: string; reported_user_id: string; reason?: string };
        Update: Partial<{ status: string }>;
      };
    };
    Functions: {
      suggested_matches: {
        Args: { p_event_id: string; p_limit?: number };
        Returns: MatchResult[];
      };
    };
  };
}
