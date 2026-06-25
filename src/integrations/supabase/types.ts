export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      analytics_events: {
        Row: {
          created_at: string;
          event_type: string;
          id: string;
          metadata: Json;
          profile_id: string | null;
          target_id: string | null;
        };
        Insert: {
          created_at?: string;
          event_type: string;
          id?: string;
          metadata?: Json;
          profile_id?: string | null;
          target_id?: string | null;
        };
        Update: {
          created_at?: string;
          event_type?: string;
          id?: string;
          metadata?: Json;
          profile_id?: string | null;
          target_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "analytics_events_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "creator_profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      creator_profiles: {
        Row: {
          avatar_url: string | null;
          banner_url: string | null;
          bio: string;
          created_at: string;
          handle: string;
          id: string;
          name: string;
          plan: string;
          theme: string;
          updated_at: string;
          user_id: string | null;
        };
        Insert: {
          avatar_url?: string | null;
          banner_url?: string | null;
          bio?: string;
          created_at?: string;
          handle: string;
          id?: string;
          name?: string;
          plan?: string;
          theme?: string;
          updated_at?: string;
          user_id?: string | null;
        };
        Update: {
          avatar_url?: string | null;
          banner_url?: string | null;
          bio?: string;
          created_at?: string;
          handle?: string;
          id?: string;
          name?: string;
          plan?: string;
          theme?: string;
          updated_at?: string;
          user_id?: string | null;
        };
        Relationships: [];
      };
      // Phase 2C: relationship tables hand-added pending Lovable regeneration.
      blocks: {
        Row: {
          blocked_user_id: string;
          blocker_id: string;
          created_at: string;
          id: string;
          reason: string | null;
        };
        Insert: {
          blocked_user_id: string;
          blocker_id: string;
          created_at?: string;
          id?: string;
          reason?: string | null;
        };
        Update: {
          blocked_user_id?: string;
          blocker_id?: string;
          created_at?: string;
          id?: string;
          reason?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "blocks_blocked_user_id_fkey";
            columns: ["blocked_user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "blocks_blocker_id_fkey";
            columns: ["blocker_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      follows: {
        Row: {
          created_at: string;
          follower_id: string;
          following_creator_id: string;
          id: string;
        };
        Insert: {
          created_at?: string;
          follower_id: string;
          following_creator_id: string;
          id?: string;
        };
        Update: {
          created_at?: string;
          follower_id?: string;
          following_creator_id?: string;
          id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "follows_follower_id_fkey";
            columns: ["follower_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "follows_following_creator_id_fkey";
            columns: ["following_creator_id"];
            isOneToOne: false;
            referencedRelation: "creator_profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      links: {
        Row: {
          clicks: number;
          created_at: string;
          featured: boolean;
          icon: string;
          id: string;
          position: number;
          profile_id: string;
          scheduled: string | null;
          title: string;
          url: string;
        };
        Insert: {
          clicks?: number;
          created_at?: string;
          featured?: boolean;
          icon?: string;
          id?: string;
          position?: number;
          profile_id: string;
          scheduled?: string | null;
          title?: string;
          url?: string;
        };
        Update: {
          clicks?: number;
          created_at?: string;
          featured?: boolean;
          icon?: string;
          id?: string;
          position?: number;
          profile_id?: string;
          scheduled?: string | null;
          title?: string;
          url?: string;
        };
        Relationships: [
          {
            foreignKeyName: "links_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "creator_profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      products: {
        Row: {
          created_at: string;
          id: string;
          image_url: string | null;
          position: number;
          price: string;
          profile_id: string;
          sales: number;
          title: string;
          type: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          image_url?: string | null;
          position?: number;
          price?: string;
          profile_id: string;
          sales?: number;
          title?: string;
          type?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          image_url?: string | null;
          position?: number;
          price?: string;
          profile_id?: string;
          sales?: number;
          title?: string;
          type?: string;
        };
        Relationships: [
          {
            foreignKeyName: "products_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "creator_profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      // Phase 2B: account_type hand-added pending Lovable Cloud regeneration.
      member_profiles: {
        Row: {
          avatar_url: string | null;
          bio: string;
          created_at: string;
          display_name: string;
          id: string;
          updated_at: string;
          user_id: string;
          username: string;
        };
        Insert: {
          avatar_url?: string | null;
          bio?: string;
          created_at?: string;
          display_name?: string;
          id?: string;
          updated_at?: string;
          user_id: string;
          username?: string;
        };
        Update: {
          avatar_url?: string | null;
          bio?: string;
          created_at?: string;
          display_name?: string;
          id?: string;
          updated_at?: string;
          user_id?: string;
          username?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          account_type: Database["public"]["Enums"]["account_type"];
          created_at: string;
          email: string | null;
          id: string;
          name: string | null;
          updated_at: string;
        };
        Insert: {
          account_type?: Database["public"]["Enums"]["account_type"];
          created_at?: string;
          email?: string | null;
          id: string;
          name?: string | null;
          updated_at?: string;
        };
        Update: {
          account_type?: Database["public"]["Enums"]["account_type"];
          created_at?: string;
          email?: string | null;
          id?: string;
          name?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      reserved_handles: {
        Row: {
          handle: string;
        };
        Insert: {
          handle: string;
        };
        Update: {
          handle?: string;
        };
        Relationships: [];
      };
      subscriptions: {
        Row: {
          created_at: string;
          current_period_end: string | null;
          id: string;
          plan: string;
          status: string;
          stripe_customer_id: string | null;
          stripe_subscription_id: string | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          current_period_end?: string | null;
          id?: string;
          plan?: string;
          status?: string;
          stripe_customer_id?: string | null;
          stripe_subscription_id?: string | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          current_period_end?: string | null;
          id?: string;
          plan?: string;
          status?: string;
          stripe_customer_id?: string | null;
          stripe_subscription_id?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      user_roles: {
        Row: {
          created_at: string;
          id: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          role?: Database["public"]["Enums"]["app_role"];
          user_id?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      public_creator_profiles: {
        Row: {
          avatar_url: string | null;
          banner_url: string | null;
          bio: string | null;
          display_name: string | null;
          follower_count: number | null;
          following_count: number | null;
          post_count: number | null;
          username: string | null;
          verified: boolean | null;
        };
        Relationships: [];
      };
      public_member_profiles: {
        Row: {
          avatar_url: string | null;
          banner_url: string | null;
          bio: string | null;
          display_name: string | null;
          follower_count: number | null;
          following_count: number | null;
          post_count: number | null;
          username: string | null;
          verified: boolean | null;
        };
        Relationships: [];
      };
    };
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"];
          _user_id: string;
        };
        Returns: boolean;
      };
      is_current_user_creator: {
        Args: {
          _creator_profile_id: string;
        };
        Returns: boolean;
      };
      relationship_follow_creator: {
        Args: {
          _username: string;
        };
        Returns: undefined;
      };
      relationship_state: {
        Args: {
          _username: string;
        };
        Returns: {
          blocked_by_me: boolean;
          follower_count: number;
          following: boolean;
          following_count: number;
          is_self: boolean;
          username: string;
        }[];
      };
      relationship_unfollow_creator: {
        Args: {
          _username: string;
        };
        Returns: undefined;
      };
    };
    Enums: {
      account_type: "creator" | "member";
      app_role: "admin" | "moderator" | "user";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      account_type: ["creator", "member"],
      app_role: ["admin", "moderator", "user"],
    },
  },
} as const;
