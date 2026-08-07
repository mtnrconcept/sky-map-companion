export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.15";
  };
  public: {
    Tables: {
      cosmos_observations: {
        Row: {
          id: string;
          user_id: string | null;
          latitude: number;
          longitude: number;
          altitude_m: number | null;
          azimuth: number | null;
          elevation: number | null;
          phenomenon_type: string;
          description: string;
          image_url: string | null;
          duration_s: number | null;
          magnitude: number | null;
          ai_confidence: number | null;
          ai_analysis: Json | null;
          status: string;
          event_id: string | null;
          observed_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          latitude: number;
          longitude: number;
          altitude_m?: number | null;
          azimuth?: number | null;
          elevation?: number | null;
          phenomenon_type: string;
          description: string;
          image_url?: string | null;
          duration_s?: number | null;
          magnitude?: number | null;
          ai_confidence?: number | null;
          ai_analysis?: Json | null;
          status?: string;
          event_id?: string | null;
          observed_at?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string | null;
          latitude?: number;
          longitude?: number;
          altitude_m?: number | null;
          azimuth?: number | null;
          elevation?: number | null;
          phenomenon_type?: string;
          description?: string;
          image_url?: string | null;
          duration_s?: number | null;
          magnitude?: number | null;
          ai_confidence?: number | null;
          ai_analysis?: Json | null;
          status?: string;
          event_id?: string | null;
          observed_at?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      cosmos_events: {
        Row: {
          id: string;
          phenomenon_type: string;
          title: string;
          description: string | null;
          observation_count: number;
          min_latitude: number | null;
          max_latitude: number | null;
          min_longitude: number | null;
          max_longitude: number | null;
          event_at: string;
          estimated_duration_s: number | null;
          confidence_score: number | null;
          status: string;
          ai_analysis: Json | null;
          triangulation: Json | null;
          transmitted_to: string[] | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          phenomenon_type: string;
          title: string;
          description?: string | null;
          observation_count?: number;
          min_latitude?: number | null;
          max_latitude?: number | null;
          min_longitude?: number | null;
          max_longitude?: number | null;
          event_at: string;
          estimated_duration_s?: number | null;
          confidence_score?: number | null;
          status?: string;
          ai_analysis?: Json | null;
          triangulation?: Json | null;
          transmitted_to?: string[] | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          phenomenon_type?: string;
          title?: string;
          description?: string | null;
          observation_count?: number;
          min_latitude?: number | null;
          max_latitude?: number | null;
          min_longitude?: number | null;
          max_longitude?: number | null;
          event_at?: string;
          estimated_duration_s?: number | null;
          confidence_score?: number | null;
          status?: string;
          ai_analysis?: Json | null;
          triangulation?: Json | null;
          transmitted_to?: string[] | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      cosmos_triangulations: {
        Row: {
          id: string;
          event_id: string;
          observation_ids: string[];
          estimated_latitude: number | null;
          estimated_longitude: number | null;
          estimated_altitude_km: number | null;
          trajectory: Json | null;
          estimated_speed_km_s: number | null;
          error_margin_km: number | null;
          method: string;
          confidence: number;
          computed_at: string;
        };
        Insert: {
          id?: string;
          event_id: string;
          observation_ids: string[];
          estimated_latitude?: number | null;
          estimated_longitude?: number | null;
          estimated_altitude_km?: number | null;
          trajectory?: Json | null;
          estimated_speed_km_s?: number | null;
          error_margin_km?: number | null;
          method?: string;
          confidence?: number;
          computed_at?: string;
        };
        Update: {
          id?: string;
          event_id?: string;
          observation_ids?: string[];
          estimated_latitude?: number | null;
          estimated_longitude?: number | null;
          estimated_altitude_km?: number | null;
          trajectory?: Json | null;
          estimated_speed_km_s?: number | null;
          error_margin_km?: number | null;
          method?: string;
          confidence?: number;
          computed_at?: string;
        };
        Relationships: [];
      };
      comments: {
        Row: {
          content: string;
          created_at: string;
          id: string;
          parent_comment_id: string | null;
          post_id: string;
          user_id: string;
        };
        Insert: {
          content: string;
          created_at?: string;
          id?: string;
          parent_comment_id?: string | null;
          post_id: string;
          user_id: string;
        };
        Update: {
          content?: string;
          created_at?: string;
          id?: string;
          parent_comment_id?: string | null;
          post_id?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      favorites: {
        Row: {
          created_at: string;
          id: string;
          object_id: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          object_id: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          object_id?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      follows: {
        Row: {
          created_at: string;
          follower_id: string;
          following_id: string;
          id: string;
        };
        Insert: {
          created_at?: string;
          follower_id: string;
          following_id: string;
          id?: string;
        };
        Update: {
          created_at?: string;
          follower_id?: string;
          following_id?: string;
          id?: string;
        };
        Relationships: [];
      };
      image_comparisons: {
        Row: {
          analysis_metadata: Json | null;
          confidence_score: number | null;
          created_at: string;
          differences_detected: Json | null;
          discoveries: Json | null;
          id: string;
          image_ids: string[];
          object_id: string;
        };
        Insert: {
          analysis_metadata?: Json | null;
          confidence_score?: number | null;
          created_at?: string;
          differences_detected?: Json | null;
          discoveries?: Json | null;
          id?: string;
          image_ids: string[];
          object_id: string;
        };
        Update: {
          analysis_metadata?: Json | null;
          confidence_score?: number | null;
          created_at?: string;
          differences_detected?: Json | null;
          discoveries?: Json | null;
          id?: string;
          image_ids?: string[];
          object_id?: string;
        };
        Relationships: [];
      };
      likes: {
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
        Relationships: [];
      };
      observations: {
        Row: {
          created_at: string;
          id: string;
          instrument: string | null;
          notes: string | null;
          object_id: string;
          object_name: string;
          observed_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          instrument?: string | null;
          notes?: string | null;
          object_id: string;
          object_name: string;
          observed_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          instrument?: string | null;
          notes?: string | null;
          object_id?: string;
          object_name?: string;
          observed_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      posts: {
        Row: {
          comments_count: number;
          content: string;
          created_at: string;
          id: string;
          image_ids: string[];
          likes_count: number;
          object_id: string | null;
          object_name: string | null;
          shares_count: number;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          comments_count?: number;
          content: string;
          created_at?: string;
          id?: string;
          image_ids?: string[];
          likes_count?: number;
          object_id?: string | null;
          object_name?: string | null;
          shares_count?: number;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          comments_count?: number;
          content?: string;
          created_at?: string;
          id?: string;
          image_ids?: string[];
          likes_count?: number;
          object_id?: string | null;
          object_name?: string | null;
          shares_count?: number;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          avatar_url: string | null;
          bio: string | null;
          created_at: string;
          display_name: string | null;
          followers_count: number;
          following_count: number;
          id: string;
          location: string | null;
          posts_count: number;
          updated_at: string;
        };
        Insert: {
          avatar_url?: string | null;
          bio?: string | null;
          created_at?: string;
          display_name?: string | null;
          followers_count?: number;
          following_count?: number;
          id: string;
          location?: string | null;
          posts_count?: number;
          updated_at?: string;
        };
        Update: {
          avatar_url?: string | null;
          bio?: string | null;
          created_at?: string;
          display_name?: string | null;
          followers_count?: number;
          following_count?: number;
          id?: string;
          location?: string | null;
          posts_count?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      saved_locations: {
        Row: {
          created_at: string;
          id: string;
          is_default: boolean;
          latitude: number;
          longitude: number;
          name: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          is_default?: boolean;
          latitude: number;
          longitude: number;
          name: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          is_default?: boolean;
          latitude?: number;
          longitude?: number;
          name?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      shares: {
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
        Relationships: [];
      };
      user_images: {
        Row: {
          ai_detection_score: number | null;
          file_size: number;
          height: number | null;
          id: string;
          image_url: string;
          is_ai_generated: boolean;
          mime_type: string;
          object_id: string;
          object_name: string;
          storage_path: string;
          uploaded_at: string;
          user_id: string;
          vision_analysis: Json | null;
          width: number | null;
        };
        Insert: {
          ai_detection_score?: number | null;
          file_size: number;
          height?: number | null;
          id?: string;
          image_url: string;
          is_ai_generated?: boolean;
          mime_type: string;
          object_id: string;
          object_name: string;
          storage_path: string;
          uploaded_at?: string;
          user_id: string;
          vision_analysis?: Json | null;
          width?: number | null;
        };
        Update: {
          ai_detection_score?: number | null;
          file_size?: number;
          height?: number | null;
          id?: string;
          image_url?: string;
          is_ai_generated?: boolean;
          mime_type?: string;
          object_id?: string;
          object_name?: string;
          storage_path?: string;
          uploaded_at?: string;
          user_id?: string;
          vision_analysis?: Json | null;
          width?: number | null;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      get_recent_observations: {
        Args: {
          lat_center: number;
          lon_center: number;
          radius_deg?: number;
          since_minutes?: number;
          limit_count?: number;
        };
        Returns: Database["public"]["Tables"]["cosmos_observations"]["Row"][];
      };
      get_active_events: {
        Args: { since_hours?: number };
        Returns: {
          id: string;
          phenomenon_type: string;
          title: string;
          description: string | null;
          observation_count: number;
          confidence_score: number | null;
          status: string;
          event_at: string;
          triangulation: Json | null;
          ai_analysis: Json | null;
        }[];
      };
      get_user_feed: {
        Args: {
          p_user_id: string;
          p_limit?: number;
          p_offset?: number;
        };
        Returns: {
          post_id: string;
          author_id: string;
          display_name: string;
          avatar_url: string | null;
          content: string;
          object_id: string | null;
          object_name: string | null;
          image_ids: string[];
          likes_count: number;
          comments_count: number;
          shares_count: number;
          created_at: string;
          user_liked: boolean;
        }[];
      };
    };
    Enums: {
      [_ in never]: never;
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
