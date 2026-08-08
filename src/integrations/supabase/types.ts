export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.4";
  };
  public: {
    Tables: {
      astro_contributions: {
        Row: {
          bias_count: number | null;
          darks_count: number | null;
          first_contribution_at: string | null;
          flats_count: number | null;
          id: string;
          last_contribution_at: string | null;
          lights_count: number | null;
          object_id: string;
          quality_avg: number | null;
          total_exposure_hours: number | null;
          user_id: string;
        };
        Insert: {
          bias_count?: number | null;
          darks_count?: number | null;
          first_contribution_at?: string | null;
          flats_count?: number | null;
          id?: string;
          last_contribution_at?: string | null;
          lights_count?: number | null;
          object_id: string;
          quality_avg?: number | null;
          total_exposure_hours?: number | null;
          user_id: string;
        };
        Update: {
          bias_count?: number | null;
          darks_count?: number | null;
          first_contribution_at?: string | null;
          flats_count?: number | null;
          id?: string;
          last_contribution_at?: string | null;
          lights_count?: number | null;
          object_id?: string;
          quality_avg?: number | null;
          total_exposure_hours?: number | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "astro_contributions_object_id_fkey";
            columns: ["object_id"];
            isOneToOne: false;
            referencedRelation: "astro_objects";
            referencedColumns: ["id"];
          },
        ];
      };
      astro_masters: {
        Row: {
          configurations_count: number;
          contributors_count: number;
          countries_count: number;
          created_at: string;
          dynamic_range_stops: number | null;
          final_fwhm: number | null;
          final_snr: number | null;
          generation: number;
          id: string;
          image_url: string;
          is_current: boolean;
          lights_stacked: number;
          notes: string | null;
          object_id: string;
          stacking_job_id: string | null;
          thumbnail_url: string | null;
          total_exposure_hours: number;
        };
        Insert: {
          configurations_count?: number;
          contributors_count?: number;
          countries_count?: number;
          created_at?: string;
          dynamic_range_stops?: number | null;
          final_fwhm?: number | null;
          final_snr?: number | null;
          generation?: number;
          id?: string;
          image_url: string;
          is_current?: boolean;
          lights_stacked?: number;
          notes?: string | null;
          object_id: string;
          stacking_job_id?: string | null;
          thumbnail_url?: string | null;
          total_exposure_hours?: number;
        };
        Update: {
          configurations_count?: number;
          contributors_count?: number;
          countries_count?: number;
          created_at?: string;
          dynamic_range_stops?: number | null;
          final_fwhm?: number | null;
          final_snr?: number | null;
          generation?: number;
          id?: string;
          image_url?: string;
          is_current?: boolean;
          lights_stacked?: number;
          notes?: string | null;
          object_id?: string;
          stacking_job_id?: string | null;
          thumbnail_url?: string | null;
          total_exposure_hours?: number;
        };
        Relationships: [
          {
            foreignKeyName: "astro_masters_object_id_fkey";
            columns: ["object_id"];
            isOneToOne: false;
            referencedRelation: "astro_objects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "astro_masters_stacking_job_id_fkey";
            columns: ["stacking_job_id"];
            isOneToOne: false;
            referencedRelation: "astro_stacking_jobs";
            referencedColumns: ["id"];
          },
        ];
      };
      astro_objects: {
        Row: {
          common_name: string | null;
          created_at: string;
          dec_deg: number;
          description: string | null;
          id: string;
          magnitude: number | null;
          master_image_url: string | null;
          master_updated_at: string | null;
          ra_deg: number;
          size_arcmin: number | null;
          total_bias: number | null;
          total_contributors: number | null;
          total_darks: number | null;
          total_exposure_hours: number | null;
          total_flats: number | null;
          total_lights: number | null;
          type: string;
        };
        Insert: {
          common_name?: string | null;
          created_at?: string;
          dec_deg: number;
          description?: string | null;
          id: string;
          magnitude?: number | null;
          master_image_url?: string | null;
          master_updated_at?: string | null;
          ra_deg: number;
          size_arcmin?: number | null;
          total_bias?: number | null;
          total_contributors?: number | null;
          total_darks?: number | null;
          total_exposure_hours?: number | null;
          total_flats?: number | null;
          total_lights?: number | null;
          type: string;
        };
        Update: {
          common_name?: string | null;
          created_at?: string;
          dec_deg?: number;
          description?: string | null;
          id?: string;
          magnitude?: number | null;
          master_image_url?: string | null;
          master_updated_at?: string | null;
          ra_deg?: number;
          size_arcmin?: number | null;
          total_bias?: number | null;
          total_contributors?: number | null;
          total_darks?: number | null;
          total_exposure_hours?: number | null;
          total_flats?: number | null;
          total_lights?: number | null;
          type?: string;
        };
        Relationships: [];
      };
      astro_stacking_jobs: {
        Row: {
          ai_pipeline_log: Json | null;
          bias_ids: string[] | null;
          completed_at: string | null;
          configurations_count: number | null;
          contributors_count: number | null;
          created_at: string;
          dark_ids: string[] | null;
          error_message: string | null;
          flat_ids: string[] | null;
          id: string;
          light_ids: string[];
          lights_count: number | null;
          object_id: string;
          result_image_url: string | null;
          result_metadata: Json | null;
          result_thumbnail_url: string | null;
          stacking_method: string | null;
          started_at: string | null;
          status: string | null;
          total_exposure_hours: number | null;
          weighting_mode: string | null;
        };
        Insert: {
          ai_pipeline_log?: Json | null;
          bias_ids?: string[] | null;
          completed_at?: string | null;
          configurations_count?: number | null;
          contributors_count?: number | null;
          created_at?: string;
          dark_ids?: string[] | null;
          error_message?: string | null;
          flat_ids?: string[] | null;
          id?: string;
          light_ids?: string[];
          lights_count?: number | null;
          object_id: string;
          result_image_url?: string | null;
          result_metadata?: Json | null;
          result_thumbnail_url?: string | null;
          stacking_method?: string | null;
          started_at?: string | null;
          status?: string | null;
          total_exposure_hours?: number | null;
          weighting_mode?: string | null;
        };
        Update: {
          ai_pipeline_log?: Json | null;
          bias_ids?: string[] | null;
          completed_at?: string | null;
          configurations_count?: number | null;
          contributors_count?: number | null;
          created_at?: string;
          dark_ids?: string[] | null;
          error_message?: string | null;
          flat_ids?: string[] | null;
          id?: string;
          light_ids?: string[];
          lights_count?: number | null;
          object_id?: string;
          result_image_url?: string | null;
          result_metadata?: Json | null;
          result_thumbnail_url?: string | null;
          stacking_method?: string | null;
          started_at?: string | null;
          status?: string | null;
          total_exposure_hours?: number | null;
          weighting_mode?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "astro_stacking_jobs_object_id_fkey";
            columns: ["object_id"];
            isOneToOne: false;
            referencedRelation: "astro_objects";
            referencedColumns: ["id"];
          },
        ];
      };
      astro_uploads: {
        Row: {
          ai_analysis: Json | null;
          altitude_m: number | null;
          aperture_mm: number | null;
          background_gradient: number | null;
          binning: number | null;
          camera: string | null;
          captured_at: string | null;
          eccentricity: number | null;
          exposure_s: number | null;
          file_size_bytes: number;
          file_url: string;
          filter_name: string | null;
          focal_length_mm: number | null;
          focal_ratio: number | null;
          frame_type: string;
          fwhm: number | null;
          gain: number | null;
          id: string;
          instrument_group: string | null;
          latitude: number | null;
          longitude: number | null;
          metadata: Json | null;
          object_id: string | null;
          offset_int: number | null;
          original_filename: string;
          pixel_size_um: number | null;
          quality_score: number | null;
          rejected: boolean | null;
          rejection_reason: string | null;
          sensor_height_px: number | null;
          sensor_width_px: number | null;
          snr: number | null;
          solved: boolean | null;
          solved_dec_deg: number | null;
          solved_ra_deg: number | null;
          solved_rotation_deg: number | null;
          solved_scale_arcsec_px: number | null;
          star_count: number | null;
          status: string | null;
          storage_path: string;
          telescope: string | null;
          temperature_c: number | null;
          uploaded_at: string;
          user_id: string;
        };
        Insert: {
          ai_analysis?: Json | null;
          altitude_m?: number | null;
          aperture_mm?: number | null;
          background_gradient?: number | null;
          binning?: number | null;
          camera?: string | null;
          captured_at?: string | null;
          eccentricity?: number | null;
          exposure_s?: number | null;
          file_size_bytes: number;
          file_url: string;
          filter_name?: string | null;
          focal_length_mm?: number | null;
          focal_ratio?: number | null;
          frame_type: string;
          fwhm?: number | null;
          gain?: number | null;
          id?: string;
          instrument_group?: string | null;
          latitude?: number | null;
          longitude?: number | null;
          metadata?: Json | null;
          object_id?: string | null;
          offset_int?: number | null;
          original_filename: string;
          pixel_size_um?: number | null;
          quality_score?: number | null;
          rejected?: boolean | null;
          rejection_reason?: string | null;
          sensor_height_px?: number | null;
          sensor_width_px?: number | null;
          snr?: number | null;
          solved?: boolean | null;
          solved_dec_deg?: number | null;
          solved_ra_deg?: number | null;
          solved_rotation_deg?: number | null;
          solved_scale_arcsec_px?: number | null;
          star_count?: number | null;
          status?: string | null;
          storage_path: string;
          telescope?: string | null;
          temperature_c?: number | null;
          uploaded_at?: string;
          user_id: string;
        };
        Update: {
          ai_analysis?: Json | null;
          altitude_m?: number | null;
          aperture_mm?: number | null;
          background_gradient?: number | null;
          binning?: number | null;
          camera?: string | null;
          captured_at?: string | null;
          eccentricity?: number | null;
          exposure_s?: number | null;
          file_size_bytes?: number;
          file_url?: string;
          filter_name?: string | null;
          focal_length_mm?: number | null;
          focal_ratio?: number | null;
          frame_type?: string;
          fwhm?: number | null;
          gain?: number | null;
          id?: string;
          instrument_group?: string | null;
          latitude?: number | null;
          longitude?: number | null;
          metadata?: Json | null;
          object_id?: string | null;
          offset_int?: number | null;
          original_filename?: string;
          pixel_size_um?: number | null;
          quality_score?: number | null;
          rejected?: boolean | null;
          rejection_reason?: string | null;
          sensor_height_px?: number | null;
          sensor_width_px?: number | null;
          snr?: number | null;
          solved?: boolean | null;
          solved_dec_deg?: number | null;
          solved_ra_deg?: number | null;
          solved_rotation_deg?: number | null;
          solved_scale_arcsec_px?: number | null;
          star_count?: number | null;
          status?: string | null;
          storage_path?: string;
          telescope?: string | null;
          temperature_c?: number | null;
          uploaded_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "astro_uploads_object_id_fkey";
            columns: ["object_id"];
            isOneToOne: false;
            referencedRelation: "astro_objects";
            referencedColumns: ["id"];
          },
        ];
      };
      comments: {
        Row: {
          content: string;
          created_at: string;
          id: string;
          parent_comment_id: string | null;
          post_id: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          content: string;
          created_at?: string;
          id?: string;
          parent_comment_id?: string | null;
          post_id: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          content?: string;
          created_at?: string;
          id?: string;
          parent_comment_id?: string | null;
          post_id?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "comments_parent_comment_id_fkey";
            columns: ["parent_comment_id"];
            isOneToOne: false;
            referencedRelation: "comments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "comments_post_id_fkey";
            columns: ["post_id"];
            isOneToOne: false;
            referencedRelation: "posts";
            referencedColumns: ["id"];
          },
        ];
      };
      cosmos_events: {
        Row: {
          ai_analysis: Json | null;
          confidence_score: number | null;
          created_at: string;
          description: string | null;
          estimated_duration_s: number | null;
          event_at: string;
          id: string;
          max_latitude: number | null;
          max_longitude: number | null;
          min_latitude: number | null;
          min_longitude: number | null;
          observation_count: number | null;
          phenomenon_type: string;
          status: string | null;
          title: string;
          transmitted_to: string[] | null;
          triangulation: Json | null;
          updated_at: string;
        };
        Insert: {
          ai_analysis?: Json | null;
          confidence_score?: number | null;
          created_at?: string;
          description?: string | null;
          estimated_duration_s?: number | null;
          event_at: string;
          id?: string;
          max_latitude?: number | null;
          max_longitude?: number | null;
          min_latitude?: number | null;
          min_longitude?: number | null;
          observation_count?: number | null;
          phenomenon_type: string;
          status?: string | null;
          title: string;
          transmitted_to?: string[] | null;
          triangulation?: Json | null;
          updated_at?: string;
        };
        Update: {
          ai_analysis?: Json | null;
          confidence_score?: number | null;
          created_at?: string;
          description?: string | null;
          estimated_duration_s?: number | null;
          event_at?: string;
          id?: string;
          max_latitude?: number | null;
          max_longitude?: number | null;
          min_latitude?: number | null;
          min_longitude?: number | null;
          observation_count?: number | null;
          phenomenon_type?: string;
          status?: string | null;
          title?: string;
          transmitted_to?: string[] | null;
          triangulation?: Json | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      cosmos_observations: {
        Row: {
          ai_analysis: Json | null;
          ai_confidence: number | null;
          altitude_m: number | null;
          azimuth: number | null;
          created_at: string;
          description: string;
          duration_s: number | null;
          elevation: number | null;
          event_id: string | null;
          id: string;
          image_url: string | null;
          latitude: number;
          longitude: number;
          magnitude: number | null;
          observed_at: string;
          phenomenon_type: string;
          status: string | null;
          user_id: string | null;
        };
        Insert: {
          ai_analysis?: Json | null;
          ai_confidence?: number | null;
          altitude_m?: number | null;
          azimuth?: number | null;
          created_at?: string;
          description: string;
          duration_s?: number | null;
          elevation?: number | null;
          event_id?: string | null;
          id?: string;
          image_url?: string | null;
          latitude: number;
          longitude: number;
          magnitude?: number | null;
          observed_at?: string;
          phenomenon_type: string;
          status?: string | null;
          user_id?: string | null;
        };
        Update: {
          ai_analysis?: Json | null;
          ai_confidence?: number | null;
          altitude_m?: number | null;
          azimuth?: number | null;
          created_at?: string;
          description?: string;
          duration_s?: number | null;
          elevation?: number | null;
          event_id?: string | null;
          id?: string;
          image_url?: string | null;
          latitude?: number;
          longitude?: number;
          magnitude?: number | null;
          observed_at?: string;
          phenomenon_type?: string;
          status?: string | null;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "fk_obs_event";
            columns: ["event_id"];
            isOneToOne: false;
            referencedRelation: "cosmos_events";
            referencedColumns: ["id"];
          },
        ];
      };
      cosmos_triangulations: {
        Row: {
          computed_at: string;
          confidence: number | null;
          error_margin_km: number | null;
          estimated_altitude_km: number | null;
          estimated_latitude: number | null;
          estimated_longitude: number | null;
          estimated_speed_km_s: number | null;
          event_id: string;
          id: string;
          method: string | null;
          observation_ids: string[];
          trajectory: Json | null;
        };
        Insert: {
          computed_at?: string;
          confidence?: number | null;
          error_margin_km?: number | null;
          estimated_altitude_km?: number | null;
          estimated_latitude?: number | null;
          estimated_longitude?: number | null;
          estimated_speed_km_s?: number | null;
          event_id: string;
          id?: string;
          method?: string | null;
          observation_ids: string[];
          trajectory?: Json | null;
        };
        Update: {
          computed_at?: string;
          confidence?: number | null;
          error_margin_km?: number | null;
          estimated_altitude_km?: number | null;
          estimated_latitude?: number | null;
          estimated_longitude?: number | null;
          estimated_speed_km_s?: number | null;
          event_id?: string;
          id?: string;
          method?: string | null;
          observation_ids?: string[];
          trajectory?: Json | null;
        };
        Relationships: [
          {
            foreignKeyName: "cosmos_triangulations_event_id_fkey";
            columns: ["event_id"];
            isOneToOne: false;
            referencedRelation: "cosmos_events";
            referencedColumns: ["id"];
          },
        ];
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
          comparison_date: string;
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
          comparison_date?: string;
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
          comparison_date?: string;
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
        Relationships: [
          {
            foreignKeyName: "likes_post_id_fkey";
            columns: ["post_id"];
            isOneToOne: false;
            referencedRelation: "posts";
            referencedColumns: ["id"];
          },
        ];
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
          comments_count: number | null;
          content: string;
          created_at: string;
          id: string;
          image_ids: string[] | null;
          likes_count: number | null;
          object_id: string | null;
          object_name: string | null;
          shares_count: number | null;
          updated_at: string;
          user_id: string;
          visibility: string | null;
        };
        Insert: {
          comments_count?: number | null;
          content: string;
          created_at?: string;
          id?: string;
          image_ids?: string[] | null;
          likes_count?: number | null;
          object_id?: string | null;
          object_name?: string | null;
          shares_count?: number | null;
          updated_at?: string;
          user_id: string;
          visibility?: string | null;
        };
        Update: {
          comments_count?: number | null;
          content?: string;
          created_at?: string;
          id?: string;
          image_ids?: string[] | null;
          likes_count?: number | null;
          object_id?: string | null;
          object_name?: string | null;
          shares_count?: number | null;
          updated_at?: string;
          user_id?: string;
          visibility?: string | null;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          avatar_url: string | null;
          bio: string | null;
          created_at: string;
          display_name: string | null;
          followers_count: number | null;
          following_count: number | null;
          id: string;
          location: string | null;
          posts_count: number | null;
          updated_at: string;
          website: string | null;
        };
        Insert: {
          avatar_url?: string | null;
          bio?: string | null;
          created_at?: string;
          display_name?: string | null;
          followers_count?: number | null;
          following_count?: number | null;
          id: string;
          location?: string | null;
          posts_count?: number | null;
          updated_at?: string;
          website?: string | null;
        };
        Update: {
          avatar_url?: string | null;
          bio?: string | null;
          created_at?: string;
          display_name?: string | null;
          followers_count?: number | null;
          following_count?: number | null;
          id?: string;
          location?: string | null;
          posts_count?: number | null;
          updated_at?: string;
          website?: string | null;
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
        Relationships: [
          {
            foreignKeyName: "shares_post_id_fkey";
            columns: ["post_id"];
            isOneToOne: false;
            referencedRelation: "posts";
            referencedColumns: ["id"];
          },
        ];
      };
      user_images: {
        Row: {
          ai_detection_metadata: Json | null;
          ai_detection_score: number | null;
          file_size: number;
          height: number | null;
          id: string;
          image_url: string;
          is_ai_generated: boolean | null;
          metadata: Json | null;
          mime_type: string;
          object_id: string;
          object_name: string;
          storage_path: string;
          thumbnail_url: string | null;
          uploaded_at: string;
          user_id: string;
          vision_analysis: Json | null;
          width: number | null;
        };
        Insert: {
          ai_detection_metadata?: Json | null;
          ai_detection_score?: number | null;
          file_size: number;
          height?: number | null;
          id?: string;
          image_url: string;
          is_ai_generated?: boolean | null;
          metadata?: Json | null;
          mime_type: string;
          object_id: string;
          object_name: string;
          storage_path: string;
          thumbnail_url?: string | null;
          uploaded_at?: string;
          user_id: string;
          vision_analysis?: Json | null;
          width?: number | null;
        };
        Update: {
          ai_detection_metadata?: Json | null;
          ai_detection_score?: number | null;
          file_size?: number;
          height?: number | null;
          id?: string;
          image_url?: string;
          is_ai_generated?: boolean | null;
          metadata?: Json | null;
          mime_type?: string;
          object_id?: string;
          object_name?: string;
          storage_path?: string;
          thumbnail_url?: string | null;
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
      get_active_events: {
        Args: { since_hours?: number };
        Returns: {
          ai_analysis: Json;
          confidence_score: number;
          description: string;
          event_at: string;
          id: string;
          observation_count: number;
          phenomenon_type: string;
          status: string;
          title: string;
          triangulation: Json;
        }[];
      };
      get_contribution_recommendations: {
        Args: { limit_count?: number; p_user_id: string };
        Returns: {
          common_name: string;
          missing_darks: boolean;
          missing_flats: boolean;
          object_id: string;
          score: number;
          total_contributors: number;
          total_lights: number;
          type: string;
        }[];
      };
      get_recent_observations: {
        Args: {
          lat_center: number;
          limit_count?: number;
          lon_center: number;
          radius_deg?: number;
          since_minutes?: number;
        };
        Returns: {
          ai_analysis: Json | null;
          ai_confidence: number | null;
          altitude_m: number | null;
          azimuth: number | null;
          created_at: string;
          description: string;
          duration_s: number | null;
          elevation: number | null;
          event_id: string | null;
          id: string;
          image_url: string | null;
          latitude: number;
          longitude: number;
          magnitude: number | null;
          observed_at: string;
          phenomenon_type: string;
          status: string | null;
          user_id: string | null;
        }[];
        SetofOptions: {
          from: "*";
          to: "cosmos_observations";
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      get_top_contributors: {
        Args: { limit_count?: number; p_object_id: string };
        Returns: {
          last_contribution_at: string;
          lights_count: number;
          quality_avg: number;
          total_exposure_hours: number;
          user_id: string;
        }[];
      };
      get_user_feed: {
        Args: { limit_count?: number; offset_count?: number; user_uuid: string };
        Returns: {
          avatar_url: string;
          comments_count: number;
          content: string;
          created_at: string;
          display_name: string;
          image_ids: string[];
          likes_count: number;
          object_id: string;
          object_name: string;
          post_id: string;
          shares_count: number;
          user_id: string;
          user_liked: boolean;
        }[];
      };
      search_astro_objects: {
        Args: {
          limit_count?: number;
          min_contributors?: number;
          object_type?: string;
          query?: string;
        };
        Returns: {
          common_name: string | null;
          created_at: string;
          dec_deg: number;
          description: string | null;
          id: string;
          magnitude: number | null;
          master_image_url: string | null;
          master_updated_at: string | null;
          ra_deg: number;
          size_arcmin: number | null;
          total_bias: number | null;
          total_contributors: number | null;
          total_darks: number | null;
          total_exposure_hours: number | null;
          total_flats: number | null;
          total_lights: number | null;
          type: string;
        }[];
        SetofOptions: {
          from: "*";
          to: "astro_objects";
          isOneToOne: false;
          isSetofReturn: true;
        };
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
