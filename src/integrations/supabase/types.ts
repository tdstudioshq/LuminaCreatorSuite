export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: {
          extensions?: Json;
          operationName?: string;
          query?: string;
          variables?: Json;
        };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      content_entitlements: {
        Row: {
          created_at: string;
          id: string;
          post_id: string;
          purchase_id: string | null;
          source: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          post_id: string;
          purchase_id?: string | null;
          source?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          post_id?: string;
          purchase_id?: string | null;
          source?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "content_entitlements_post_id_fkey";
            columns: ["post_id"];
            isOneToOne: false;
            referencedRelation: "posts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "content_entitlements_purchase_id_fkey";
            columns: ["purchase_id"];
            isOneToOne: false;
            referencedRelation: "purchases";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "content_entitlements_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      creator_balances: {
        Row: {
          available_cents: number;
          created_at: string;
          creator_profile_id: string;
          currency: string;
          id: string;
          lifetime_fees_cents: number;
          lifetime_gross_cents: number;
          lifetime_net_cents: number;
          lifetime_paid_out_cents: number;
          pending_cents: number;
          updated_at: string;
        };
        Insert: {
          available_cents?: number;
          created_at?: string;
          creator_profile_id: string;
          currency?: string;
          id?: string;
          lifetime_fees_cents?: number;
          lifetime_gross_cents?: number;
          lifetime_net_cents?: number;
          lifetime_paid_out_cents?: number;
          pending_cents?: number;
          updated_at?: string;
        };
        Update: {
          available_cents?: number;
          created_at?: string;
          creator_profile_id?: string;
          currency?: string;
          id?: string;
          lifetime_fees_cents?: number;
          lifetime_gross_cents?: number;
          lifetime_net_cents?: number;
          lifetime_paid_out_cents?: number;
          pending_cents?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "creator_balances_creator_profile_id_fkey";
            columns: ["creator_profile_id"];
            isOneToOne: false;
            referencedRelation: "creator_profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      payout_requests: {
        Row: {
          amount_cents: number;
          created_at: string;
          creator_profile_id: string;
          currency: string;
          decided_at: string | null;
          id: string;
          mock_provider_reference: string | null;
          note: string | null;
          status: Database["public"]["Enums"]["payout_request_status"];
          updated_at: string;
        };
        Insert: {
          amount_cents: number;
          created_at?: string;
          creator_profile_id: string;
          currency?: string;
          decided_at?: string | null;
          id?: string;
          mock_provider_reference?: string | null;
          note?: string | null;
          status?: Database["public"]["Enums"]["payout_request_status"];
          updated_at?: string;
        };
        Update: {
          amount_cents?: number;
          created_at?: string;
          creator_profile_id?: string;
          currency?: string;
          decided_at?: string | null;
          id?: string;
          mock_provider_reference?: string | null;
          note?: string | null;
          status?: Database["public"]["Enums"]["payout_request_status"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "payout_requests_creator_profile_id_fkey";
            columns: ["creator_profile_id"];
            isOneToOne: false;
            referencedRelation: "creator_profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      payouts: {
        Row: {
          amount_cents: number;
          created_at: string;
          creator_profile_id: string;
          currency: string;
          failure_reason: string | null;
          id: string;
          mock_provider_reference: string | null;
          paid_at: string | null;
          payout_request_id: string | null;
          requested_at: string;
          status: Database["public"]["Enums"]["payout_status"];
          updated_at: string;
        };
        Insert: {
          amount_cents: number;
          created_at?: string;
          creator_profile_id: string;
          currency?: string;
          failure_reason?: string | null;
          id?: string;
          mock_provider_reference?: string | null;
          paid_at?: string | null;
          payout_request_id?: string | null;
          requested_at?: string;
          status?: Database["public"]["Enums"]["payout_status"];
          updated_at?: string;
        };
        Update: {
          amount_cents?: number;
          created_at?: string;
          creator_profile_id?: string;
          currency?: string;
          failure_reason?: string | null;
          id?: string;
          mock_provider_reference?: string | null;
          paid_at?: string | null;
          payout_request_id?: string | null;
          requested_at?: string;
          status?: Database["public"]["Enums"]["payout_status"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "payouts_creator_profile_id_fkey";
            columns: ["creator_profile_id"];
            isOneToOne: false;
            referencedRelation: "creator_profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "payouts_payout_request_id_fkey";
            columns: ["payout_request_id"];
            isOneToOne: false;
            referencedRelation: "payout_requests";
            referencedColumns: ["id"];
          },
        ];
      };
      purchases: {
        Row: {
          amount_cents: number;
          buyer_user_id: string;
          created_at: string;
          creator_profile_id: string | null;
          currency: string;
          id: string;
          post_id: string | null;
          status: string;
          transaction_id: string;
        };
        Insert: {
          amount_cents: number;
          buyer_user_id: string;
          created_at?: string;
          creator_profile_id?: string | null;
          currency?: string;
          id?: string;
          post_id?: string | null;
          status?: string;
          transaction_id: string;
        };
        Update: {
          amount_cents?: number;
          buyer_user_id?: string;
          created_at?: string;
          creator_profile_id?: string | null;
          currency?: string;
          id?: string;
          post_id?: string | null;
          status?: string;
          transaction_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "purchases_buyer_user_id_fkey";
            columns: ["buyer_user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "purchases_creator_profile_id_fkey";
            columns: ["creator_profile_id"];
            isOneToOne: false;
            referencedRelation: "creator_profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "purchases_post_id_fkey";
            columns: ["post_id"];
            isOneToOne: false;
            referencedRelation: "posts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "purchases_transaction_id_fkey";
            columns: ["transaction_id"];
            isOneToOne: false;
            referencedRelation: "transactions";
            referencedColumns: ["id"];
          },
        ];
      };
      tips: {
        Row: {
          amount_cents: number;
          created_at: string;
          creator_profile_id: string;
          currency: string;
          id: string;
          message: string | null;
          sender_user_id: string | null;
          status: string;
          transaction_id: string;
        };
        Insert: {
          amount_cents: number;
          created_at?: string;
          creator_profile_id: string;
          currency?: string;
          id?: string;
          message?: string | null;
          sender_user_id?: string | null;
          status?: string;
          transaction_id: string;
        };
        Update: {
          amount_cents?: number;
          created_at?: string;
          creator_profile_id?: string;
          currency?: string;
          id?: string;
          message?: string | null;
          sender_user_id?: string | null;
          status?: string;
          transaction_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tips_creator_profile_id_fkey";
            columns: ["creator_profile_id"];
            isOneToOne: false;
            referencedRelation: "creator_profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tips_sender_user_id_fkey";
            columns: ["sender_user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tips_transaction_id_fkey";
            columns: ["transaction_id"];
            isOneToOne: false;
            referencedRelation: "transactions";
            referencedColumns: ["id"];
          },
        ];
      };
      transactions: {
        Row: {
          created_at: string;
          creator_profile_id: string | null;
          creator_net_cents: number;
          currency: string;
          gross_cents: number;
          id: string;
          mock_provider_reference: string | null;
          payer_user_id: string | null;
          platform_fee_cents: number;
          processor_fee_cents: number;
          reference_id: string | null;
          reference_type: string | null;
          status: Database["public"]["Enums"]["transaction_status"];
          type: Database["public"]["Enums"]["transaction_type"];
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          creator_profile_id?: string | null;
          creator_net_cents: number;
          currency?: string;
          gross_cents: number;
          id?: string;
          mock_provider_reference?: string | null;
          payer_user_id?: string | null;
          platform_fee_cents?: number;
          processor_fee_cents?: number;
          reference_id?: string | null;
          reference_type?: string | null;
          status?: Database["public"]["Enums"]["transaction_status"];
          type: Database["public"]["Enums"]["transaction_type"];
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          creator_profile_id?: string | null;
          creator_net_cents?: number;
          currency?: string;
          gross_cents?: number;
          id?: string;
          mock_provider_reference?: string | null;
          payer_user_id?: string | null;
          platform_fee_cents?: number;
          processor_fee_cents?: number;
          reference_id?: string | null;
          reference_type?: string | null;
          status?: Database["public"]["Enums"]["transaction_status"];
          type?: Database["public"]["Enums"]["transaction_type"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "transactions_creator_profile_id_fkey";
            columns: ["creator_profile_id"];
            isOneToOne: false;
            referencedRelation: "creator_profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "transactions_payer_user_id_fkey";
            columns: ["payer_user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
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
      conversation_participants: {
        Row: {
          conversation_id: string;
          id: string;
          joined_at: string;
          user_id: string;
        };
        Insert: {
          conversation_id: string;
          id?: string;
          joined_at?: string;
          user_id: string;
        };
        Update: {
          conversation_id?: string;
          id?: string;
          joined_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "conversation_participants_conversation_id_fkey";
            columns: ["conversation_id"];
            isOneToOne: false;
            referencedRelation: "conversations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "conversation_participants_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      conversations: {
        Row: {
          created_at: string;
          id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          updated_at?: string;
        };
        Relationships: [];
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
      creator_subscription_tiers: {
        Row: {
          created_at: string;
          creator_profile_id: string;
          currency: string;
          id: string;
          is_active: boolean;
          name: string;
          price_cents: number;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          creator_profile_id: string;
          currency?: string;
          id?: string;
          is_active?: boolean;
          name?: string;
          price_cents?: number;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          creator_profile_id?: string;
          currency?: string;
          id?: string;
          is_active?: boolean;
          name?: string;
          price_cents?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "creator_subscription_tiers_creator_profile_id_fkey";
            columns: ["creator_profile_id"];
            isOneToOne: false;
            referencedRelation: "creator_profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      creator_subscriptions: {
        Row: {
          cancel_at_period_end: boolean;
          canceled_at: string | null;
          created_at: string;
          creator_profile_id: string;
          currency: string;
          current_period_end: string | null;
          id: string;
          member_user_id: string;
          mock_provider_reference: string | null;
          price_cents: number;
          started_at: string;
          status: Database["public"]["Enums"]["creator_subscription_status"];
          tier_id: string | null;
          updated_at: string;
        };
        Insert: {
          cancel_at_period_end?: boolean;
          canceled_at?: string | null;
          created_at?: string;
          creator_profile_id: string;
          currency?: string;
          current_period_end?: string | null;
          id?: string;
          member_user_id: string;
          mock_provider_reference?: string | null;
          price_cents?: number;
          started_at?: string;
          status?: Database["public"]["Enums"]["creator_subscription_status"];
          tier_id?: string | null;
          updated_at?: string;
        };
        Update: {
          cancel_at_period_end?: boolean;
          canceled_at?: string | null;
          created_at?: string;
          creator_profile_id?: string;
          currency?: string;
          current_period_end?: string | null;
          id?: string;
          member_user_id?: string;
          mock_provider_reference?: string | null;
          price_cents?: number;
          started_at?: string;
          status?: Database["public"]["Enums"]["creator_subscription_status"];
          tier_id?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "creator_subscriptions_creator_profile_id_fkey";
            columns: ["creator_profile_id"];
            isOneToOne: false;
            referencedRelation: "creator_profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "creator_subscriptions_member_user_id_fkey";
            columns: ["member_user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "creator_subscriptions_tier_id_fkey";
            columns: ["tier_id"];
            isOneToOne: false;
            referencedRelation: "creator_subscription_tiers";
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
      message_read_receipts: {
        Row: {
          id: string;
          message_id: string;
          read_at: string;
          reader_id: string;
        };
        Insert: {
          id?: string;
          message_id: string;
          read_at?: string;
          reader_id: string;
        };
        Update: {
          id?: string;
          message_id?: string;
          read_at?: string;
          reader_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "message_read_receipts_message_id_fkey";
            columns: ["message_id"];
            isOneToOne: false;
            referencedRelation: "messages";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "message_read_receipts_reader_id_fkey";
            columns: ["reader_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      messages: {
        Row: {
          body: string;
          conversation_id: string;
          created_at: string;
          deleted_at: string | null;
          edited_at: string | null;
          id: string;
          message_type: Database["public"]["Enums"]["message_type"];
          sender_id: string;
        };
        Insert: {
          body?: string;
          conversation_id: string;
          created_at?: string;
          deleted_at?: string | null;
          edited_at?: string | null;
          id?: string;
          message_type?: Database["public"]["Enums"]["message_type"];
          sender_id: string;
        };
        Update: {
          body?: string;
          conversation_id?: string;
          created_at?: string;
          deleted_at?: string | null;
          edited_at?: string | null;
          id?: string;
          message_type?: Database["public"]["Enums"]["message_type"];
          sender_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey";
            columns: ["conversation_id"];
            isOneToOne: false;
            referencedRelation: "conversations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "messages_sender_id_fkey";
            columns: ["sender_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      post_comments: {
        Row: {
          author_id: string;
          body: string;
          created_at: string;
          id: string;
          post_id: string;
          status: Database["public"]["Enums"]["comment_status"];
          updated_at: string;
        };
        Insert: {
          author_id: string;
          body: string;
          created_at?: string;
          id?: string;
          post_id: string;
          status?: Database["public"]["Enums"]["comment_status"];
          updated_at?: string;
        };
        Update: {
          author_id?: string;
          body?: string;
          created_at?: string;
          id?: string;
          post_id?: string;
          status?: Database["public"]["Enums"]["comment_status"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "post_comments_author_id_fkey";
            columns: ["author_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "post_comments_post_id_fkey";
            columns: ["post_id"];
            isOneToOne: false;
            referencedRelation: "posts";
            referencedColumns: ["id"];
          },
        ];
      };
      post_likes: {
        Row: {
          created_at: string;
          id: string;
          post_id: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          post_id: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          post_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "post_likes_post_id_fkey";
            columns: ["post_id"];
            isOneToOne: false;
            referencedRelation: "posts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "post_likes_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      post_media: {
        Row: {
          created_at: string;
          height: number | null;
          id: string;
          kind: Database["public"]["Enums"]["post_media_kind"];
          mime_type: string | null;
          owner_user_id: string;
          position: number;
          post_id: string;
          processing_status: string;
          storage_bucket: string;
          storage_path: string;
          width: number | null;
        };
        Insert: {
          created_at?: string;
          height?: number | null;
          id?: string;
          kind: Database["public"]["Enums"]["post_media_kind"];
          mime_type?: string | null;
          owner_user_id: string;
          position?: number;
          post_id: string;
          processing_status?: string;
          storage_bucket?: string;
          storage_path: string;
          width?: number | null;
        };
        Update: {
          created_at?: string;
          height?: number | null;
          id?: string;
          kind?: Database["public"]["Enums"]["post_media_kind"];
          mime_type?: string | null;
          owner_user_id?: string;
          position?: number;
          post_id?: string;
          processing_status?: string;
          storage_bucket?: string;
          storage_path?: string;
          width?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "post_media_owner_user_id_fkey";
            columns: ["owner_user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "post_media_post_id_fkey";
            columns: ["post_id"];
            isOneToOne: false;
            referencedRelation: "posts";
            referencedColumns: ["id"];
          },
        ];
      };
      post_saves: {
        Row: {
          created_at: string;
          id: string;
          post_id: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          post_id: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          post_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "post_saves_post_id_fkey";
            columns: ["post_id"];
            isOneToOne: false;
            referencedRelation: "posts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "post_saves_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      posts: {
        Row: {
          caption: string;
          created_at: string;
          creator_profile_id: string;
          currency: string;
          id: string;
          price_cents: number | null;
          published_at: string | null;
          scheduled_at: string | null;
          status: Database["public"]["Enums"]["post_status"];
          updated_at: string;
          visibility: Database["public"]["Enums"]["post_visibility"];
        };
        Insert: {
          caption?: string;
          created_at?: string;
          creator_profile_id: string;
          currency?: string;
          id?: string;
          price_cents?: number | null;
          published_at?: string | null;
          scheduled_at?: string | null;
          status?: Database["public"]["Enums"]["post_status"];
          updated_at?: string;
          visibility?: Database["public"]["Enums"]["post_visibility"];
        };
        Update: {
          caption?: string;
          created_at?: string;
          creator_profile_id?: string;
          currency?: string;
          id?: string;
          price_cents?: number | null;
          published_at?: string | null;
          scheduled_at?: string | null;
          status?: Database["public"]["Enums"]["post_status"];
          updated_at?: string;
          visibility?: Database["public"]["Enums"]["post_visibility"];
        };
        Relationships: [
          {
            foreignKeyName: "posts_creator_profile_id_fkey";
            columns: ["creator_profile_id"];
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
        Insert: {
          avatar_url?: string | null;
          banner_url?: string | null;
          bio?: string | null;
          display_name?: string | null;
          follower_count?: never;
          following_count?: never;
          post_count?: never;
          username?: string | null;
          verified?: never;
        };
        Update: {
          avatar_url?: string | null;
          banner_url?: string | null;
          bio?: string | null;
          display_name?: string | null;
          follower_count?: never;
          following_count?: never;
          post_count?: never;
          username?: string | null;
          verified?: never;
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
        Insert: {
          avatar_url?: string | null;
          banner_url?: never;
          bio?: string | null;
          display_name?: string | null;
          follower_count?: never;
          following_count?: never;
          post_count?: never;
          username?: string | null;
          verified?: never;
        };
        Update: {
          avatar_url?: string | null;
          banner_url?: never;
          bio?: string | null;
          display_name?: string | null;
          follower_count?: never;
          following_count?: never;
          post_count?: never;
          username?: string | null;
          verified?: never;
        };
        Relationships: [];
      };
    };
    Functions: {
      can_view_post: { Args: { _post_id: string }; Returns: boolean };
      cancel_creator_subscription: {
        Args: { _username: string };
        Returns: undefined;
      };
      conversation_header: {
        Args: { _conversation_id: string };
        Returns: {
          conversation_id: string;
          other_avatar_url: string;
          other_display_name: string;
          other_username: string;
        }[];
      };
      conversation_messages: {
        Args: { _conversation_id: string; _cursor?: string; _limit?: number };
        Returns: {
          body: string;
          created_at: string;
          edited_at: string;
          is_deleted: boolean;
          message_id: string;
          message_type: Database["public"]["Enums"]["message_type"];
          mine: boolean;
          sender_avatar_url: string;
          sender_display_name: string;
          sender_username: string;
        }[];
      };
      create_direct_conversation: {
        Args: { _other_user_id: string };
        Returns: string;
      };
      create_mock_purchase: {
        Args: { _post_id: string };
        Returns: undefined;
      };
      create_mock_tip: {
        Args: { _amount_cents: number; _message?: string; _username: string };
        Returns: undefined;
      };
      creator_balance: {
        Args: never;
        Returns: {
          available_cents: number;
          currency: string;
          lifetime_fees_cents: number;
          lifetime_gross_cents: number;
          lifetime_net_cents: number;
          lifetime_paid_out_cents: number;
          pending_cents: number;
        }[];
      };
      creator_subscribers_list: {
        Args: { _cursor?: string; _limit?: number };
        Returns: {
          currency: string;
          member_avatar_url: string;
          member_display_name: string;
          member_username: string;
          price_cents: number;
          since: string;
          tier_name: string;
        }[];
      };
      creator_subscription_state: {
        Args: { _username: string };
        Returns: {
          currency: string;
          current_period_end: string;
          is_self: boolean;
          price_cents: number;
          status: Database["public"]["Enums"]["creator_subscription_status"];
          subscribed: boolean;
          tier_name: string;
          username: string;
        }[];
      };
      feed_creator_posts: {
        Args: { _cursor?: string; _limit?: number; _username: string };
        Returns: {
          avatar_url: string;
          caption: string;
          display_name: string;
          locked: boolean;
          media: Json;
          post_id: string;
          published_at: string;
          username: string;
          visibility: Database["public"]["Enums"]["post_visibility"];
        }[];
      };
      feed_home_posts: {
        Args: { _cursor?: string; _limit?: number };
        Returns: {
          avatar_url: string;
          caption: string;
          display_name: string;
          media: Json;
          post_id: string;
          published_at: string;
          username: string;
          visibility: Database["public"]["Enums"]["post_visibility"];
        }[];
      };
      has_content_entitlement: {
        Args: { _post_id: string; _user_id: string };
        Returns: boolean;
      };
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"];
          _user_id: string;
        };
        Returns: boolean;
      };
      is_active_subscriber: {
        Args: { _creator_profile_id: string };
        Returns: boolean;
      };
      is_conversation_blocked: {
        Args: { _conversation_id: string };
        Returns: boolean;
      };
      is_conversation_participant: {
        Args: { _conversation_id: string };
        Returns: boolean;
      };
      is_current_user_creator: {
        Args: { _creator_profile_id: string };
        Returns: boolean;
      };
      is_current_user_post_owner: {
        Args: { _post_id: string };
        Returns: boolean;
      };
      is_engagement_blocked: { Args: { _post_id: string }; Returns: boolean };
      is_following_creator: {
        Args: { _creator_profile_id: string };
        Returns: boolean;
      };
      is_message_in_my_conversation: {
        Args: { _message_id: string };
        Returns: boolean;
      };
      list_conversations: {
        Args: never;
        Returns: {
          conversation_id: string;
          last_message_at: string;
          last_message_preview: string;
          last_message_type: Database["public"]["Enums"]["message_type"];
          other_avatar_url: string;
          other_display_name: string;
          other_username: string;
          unread_count: number;
          updated_at: string;
        }[];
      };
      mark_conversation_read: {
        Args: { _conversation_id: string };
        Returns: undefined;
      };
      post_card: {
        Args: { _post_id: string };
        Returns: {
          avatar_url: string;
          caption: string;
          display_name: string;
          locked: boolean;
          media: Json;
          post_id: string;
          published_at: string;
          username: string;
          visibility: Database["public"]["Enums"]["post_visibility"];
        }[];
      };
      post_comments_list: {
        Args: { _cursor?: string; _limit?: number; _post_id: string };
        Returns: {
          author_avatar_url: string;
          author_display_name: string;
          author_username: string;
          body: string;
          comment_id: string;
          created_at: string;
          mine: boolean;
        }[];
      };
      post_engagement_state: {
        Args: { _post_id: string };
        Returns: {
          can_engage: boolean;
          comment_count: number;
          like_count: number;
          liked_by_me: boolean;
          saved_by_me: boolean;
        }[];
      };
      recalc_creator_balance: {
        Args: { _creator_profile_id: string; _currency?: string };
        Returns: undefined;
      };
      relationship_follow_creator: {
        Args: { _username: string };
        Returns: undefined;
      };
      relationship_state: {
        Args: { _username: string };
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
        Args: { _username: string };
        Returns: undefined;
      };
      request_payout: {
        Args: { _amount_cents: number; _note?: string };
        Returns: undefined;
      };
      start_conversation_with_username: {
        Args: { _username: string };
        Returns: string;
      };
      subscribe_to_creator: {
        Args: { _tier_id: string; _username: string };
        Returns: undefined;
      };
      unread_message_count: { Args: never; Returns: number };
    };
    Enums: {
      account_type: "creator" | "member";
      app_role: "admin" | "moderator" | "user";
      comment_status: "visible" | "hidden" | "deleted";
      creator_subscription_status: "trialing" | "active" | "past_due" | "canceled" | "expired";
      message_type: "text" | "system" | "image" | "video" | "paid" | "tip";
      payout_request_status: "requested" | "approved" | "rejected" | "paid";
      payout_status: "queued" | "processing" | "paid" | "failed" | "canceled";
      post_media_kind: "image" | "video" | "audio";
      post_status: "draft" | "scheduled" | "published" | "archived";
      post_visibility: "public" | "followers" | "subscribers" | "purchase";
      transaction_status: "pending" | "succeeded" | "failed" | "refunded" | "disputed";
      transaction_type:
        | "creator_subscription"
        | "product"
        | "post_unlock"
        | "paid_message"
        | "tip"
        | "refund"
        | "adjustment";
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      account_type: ["creator", "member"],
      app_role: ["admin", "moderator", "user"],
      comment_status: ["visible", "hidden", "deleted"],
      creator_subscription_status: ["trialing", "active", "past_due", "canceled", "expired"],
      message_type: ["text", "system", "image", "video", "paid", "tip"],
      payout_request_status: ["requested", "approved", "rejected", "paid"],
      payout_status: ["queued", "processing", "paid", "failed", "canceled"],
      post_media_kind: ["image", "video", "audio"],
      post_status: ["draft", "scheduled", "published", "archived"],
      post_visibility: ["public", "followers", "subscribers", "purchase"],
      transaction_status: ["pending", "succeeded", "failed", "refunded", "disputed"],
      transaction_type: [
        "creator_subscription",
        "product",
        "post_unlock",
        "paid_message",
        "tip",
        "refund",
        "adjustment",
      ],
    },
  },
} as const;
