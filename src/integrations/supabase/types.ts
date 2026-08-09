export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.4";
  };
  public: {
    Tables: {
      archive_ingest_runs: {
        Row: {
          completed_at: string | null;
          discovered_files: number;
          downloaded_bytes: number;
          error_detail: string | null;
          id: string;
          max_bytes: number;
          max_files: number;
          object_id: string;
          query: Json;
          registered_files: number;
          rejected_files: number;
          source_id: string;
          spectral_band: string;
          started_at: string;
          status: string;
          updated_at: string;
        };
        Insert: {
          completed_at?: string | null;
          discovered_files?: number;
          downloaded_bytes?: number;
          error_detail?: string | null;
          id?: string;
          max_bytes: number;
          max_files: number;
          object_id: string;
          query: Json;
          registered_files?: number;
          rejected_files?: number;
          source_id: string;
          spectral_band: string;
          started_at?: string;
          status?: string;
          updated_at?: string;
        };
        Update: {
          completed_at?: string | null;
          discovered_files?: number;
          downloaded_bytes?: number;
          error_detail?: string | null;
          id?: string;
          max_bytes?: number;
          max_files?: number;
          object_id?: string;
          query?: Json;
          registered_files?: number;
          rejected_files?: number;
          source_id?: string;
          spectral_band?: string;
          started_at?: string;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "archive_ingest_runs_object_id_fkey";
            columns: ["object_id"];
            isOneToOne: false;
            referencedRelation: "astro_objects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "archive_ingest_runs_source_id_fkey";
            columns: ["source_id"];
            isOneToOne: false;
            referencedRelation: "archive_sources";
            referencedColumns: ["id"];
          },
        ];
      };
      archive_items: {
        Row: {
          archive_record_id: string;
          byte_size: number | null;
          calibration_level: number;
          content_sha256: string | null;
          created_at: string;
          data_rights: string;
          error_detail: string | null;
          exposure_s: number | null;
          id: string;
          ingest_run_id: string;
          metadata: Json;
          object_id: string;
          observed_at: string | null;
          remote_filename: string;
          remote_url: string;
          source_id: string;
          spectral_band: string;
          status: string;
          updated_at: string;
          upload_id: string | null;
        };
        Insert: {
          archive_record_id: string;
          byte_size?: number | null;
          calibration_level: number;
          content_sha256?: string | null;
          created_at?: string;
          data_rights: string;
          error_detail?: string | null;
          exposure_s?: number | null;
          id?: string;
          ingest_run_id: string;
          metadata?: Json;
          object_id: string;
          observed_at?: string | null;
          remote_filename: string;
          remote_url: string;
          source_id: string;
          spectral_band: string;
          status?: string;
          updated_at?: string;
          upload_id?: string | null;
        };
        Update: {
          archive_record_id?: string;
          byte_size?: number | null;
          calibration_level?: number;
          content_sha256?: string | null;
          created_at?: string;
          data_rights?: string;
          error_detail?: string | null;
          exposure_s?: number | null;
          id?: string;
          ingest_run_id?: string;
          metadata?: Json;
          object_id?: string;
          observed_at?: string | null;
          remote_filename?: string;
          remote_url?: string;
          source_id?: string;
          spectral_band?: string;
          status?: string;
          updated_at?: string;
          upload_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "archive_items_ingest_run_id_fkey";
            columns: ["ingest_run_id"];
            isOneToOne: false;
            referencedRelation: "archive_ingest_runs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "archive_items_object_id_fkey";
            columns: ["object_id"];
            isOneToOne: false;
            referencedRelation: "astro_objects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "archive_items_source_id_fkey";
            columns: ["source_id"];
            isOneToOne: false;
            referencedRelation: "archive_sources";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "archive_items_upload_id_fkey";
            columns: ["upload_id"];
            isOneToOne: true;
            referencedRelation: "astro_uploads";
            referencedColumns: ["id"];
          },
        ];
      };
      archive_sources: {
        Row: {
          acknowledgement: string;
          base_url: string;
          created_at: string;
          enabled: boolean;
          id: string;
          name: string;
          rights_class: string;
          terms_url: string;
          updated_at: string;
        };
        Insert: {
          acknowledgement: string;
          base_url: string;
          created_at?: string;
          enabled?: boolean;
          id: string;
          name: string;
          rights_class: string;
          terms_url: string;
          updated_at?: string;
        };
        Update: {
          acknowledgement?: string;
          base_url?: string;
          created_at?: string;
          enabled?: boolean;
          id?: string;
          name?: string;
          rights_class?: string;
          terms_url?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
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
          archive_ingest_run_id: string | null;
          configurations_count: number;
          contributors_count: number;
          countries_count: number;
          created_at: string;
          dynamic_range_stops: number | null;
          final_fwhm: number | null;
          final_snr: number | null;
          fits_byte_size: number | null;
          fits_sha256: string | null;
          fits_storage_path: string | null;
          generation: number;
          height_px: number | null;
          id: string;
          image_url: string;
          is_current: boolean;
          is_partial: boolean;
          lights_stacked: number;
          mosaic_generation_id: string | null;
          native_pixel_scale_arcsec: number | null;
          notes: string | null;
          object_id: string;
          output_pixel_scale_arcsec: number | null;
          preview_byte_size: number | null;
          preview_sha256: string | null;
          preview_storage_path: string | null;
          source_uploads_count: number;
          spatial_coverage_fraction: number | null;
          stacking_job_id: string | null;
          thumbnail_url: string | null;
          total_exposure_hours: number;
          verification: Json;
          width_px: number | null;
        };
        Insert: {
          archive_ingest_run_id?: string | null;
          configurations_count?: number;
          contributors_count?: number;
          countries_count?: number;
          created_at?: string;
          dynamic_range_stops?: number | null;
          final_fwhm?: number | null;
          final_snr?: number | null;
          fits_byte_size?: number | null;
          fits_sha256?: string | null;
          fits_storage_path?: string | null;
          generation?: number;
          height_px?: number | null;
          id?: string;
          image_url: string;
          is_current?: boolean;
          is_partial?: boolean;
          lights_stacked?: number;
          mosaic_generation_id?: string | null;
          native_pixel_scale_arcsec?: number | null;
          notes?: string | null;
          object_id: string;
          output_pixel_scale_arcsec?: number | null;
          preview_byte_size?: number | null;
          preview_sha256?: string | null;
          preview_storage_path?: string | null;
          source_uploads_count?: number;
          spatial_coverage_fraction?: number | null;
          stacking_job_id?: string | null;
          thumbnail_url?: string | null;
          total_exposure_hours?: number;
          verification?: Json;
          width_px?: number | null;
        };
        Update: {
          archive_ingest_run_id?: string | null;
          configurations_count?: number;
          contributors_count?: number;
          countries_count?: number;
          created_at?: string;
          dynamic_range_stops?: number | null;
          final_fwhm?: number | null;
          final_snr?: number | null;
          fits_byte_size?: number | null;
          fits_sha256?: string | null;
          fits_storage_path?: string | null;
          generation?: number;
          height_px?: number | null;
          id?: string;
          image_url?: string;
          is_current?: boolean;
          is_partial?: boolean;
          lights_stacked?: number;
          mosaic_generation_id?: string | null;
          native_pixel_scale_arcsec?: number | null;
          notes?: string | null;
          object_id?: string;
          output_pixel_scale_arcsec?: number | null;
          preview_byte_size?: number | null;
          preview_sha256?: string | null;
          preview_storage_path?: string | null;
          source_uploads_count?: number;
          spatial_coverage_fraction?: number | null;
          stacking_job_id?: string | null;
          thumbnail_url?: string | null;
          total_exposure_hours?: number;
          verification?: Json;
          width_px?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "astro_masters_archive_ingest_run_id_fkey";
            columns: ["archive_ingest_run_id"];
            isOneToOne: false;
            referencedRelation: "archive_ingest_runs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "astro_masters_mosaic_generation_id_fkey";
            columns: ["mosaic_generation_id"];
            isOneToOne: false;
            referencedRelation: "mosaic_generations";
            referencedColumns: ["id"];
          },
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
      astro_quality_metrics: {
        Row: {
          blockers: string[];
          breakdown: Json;
          clipped_black_fraction: number;
          eccentricity: number;
          eligible: boolean;
          fwhm_arcsec: number;
          id: string;
          measured_at: string;
          pipeline_version: string;
          resolution_class: string | null;
          saturated_fraction: number;
          score: number;
          signal_to_noise: number;
          upload_id: string;
          usable_coverage: number;
        };
        Insert: {
          blockers?: string[];
          breakdown: Json;
          clipped_black_fraction: number;
          eccentricity: number;
          eligible: boolean;
          fwhm_arcsec: number;
          id?: string;
          measured_at?: string;
          pipeline_version: string;
          resolution_class?: string | null;
          saturated_fraction: number;
          score: number;
          signal_to_noise: number;
          upload_id: string;
          usable_coverage: number;
        };
        Update: {
          blockers?: string[];
          breakdown?: Json;
          clipped_black_fraction?: number;
          eccentricity?: number;
          eligible?: boolean;
          fwhm_arcsec?: number;
          id?: string;
          measured_at?: string;
          pipeline_version?: string;
          resolution_class?: string | null;
          saturated_fraction?: number;
          score?: number;
          signal_to_noise?: number;
          upload_id?: string;
          usable_coverage?: number;
        };
        Relationships: [
          {
            foreignKeyName: "astro_quality_metrics_upload_id_fkey";
            columns: ["upload_id"];
            isOneToOne: false;
            referencedRelation: "astro_uploads";
            referencedColumns: ["id"];
          },
        ];
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
      astro_upload_cells: {
        Row: {
          astrometric_solution_id: string | null;
          coverage_fraction: number;
          created_at: string;
          eligible: boolean;
          healpix_index: number;
          healpix_order: number;
          upload_id: string;
          usable_fraction: number;
        };
        Insert: {
          astrometric_solution_id?: string | null;
          coverage_fraction: number;
          created_at?: string;
          eligible?: boolean;
          healpix_index: number;
          healpix_order: number;
          upload_id: string;
          usable_fraction: number;
        };
        Update: {
          astrometric_solution_id?: string | null;
          coverage_fraction?: number;
          created_at?: string;
          eligible?: boolean;
          healpix_index?: number;
          healpix_order?: number;
          upload_id?: string;
          usable_fraction?: number;
        };
        Relationships: [
          {
            foreignKeyName: "astro_upload_cells_astrometric_solution_id_fkey";
            columns: ["astrometric_solution_id"];
            isOneToOne: false;
            referencedRelation: "astrometric_solutions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "astro_upload_cells_upload_id_fkey";
            columns: ["upload_id"];
            isOneToOne: false;
            referencedRelation: "astro_uploads";
            referencedColumns: ["id"];
          },
        ];
      };
      astro_uploads: {
        Row: {
          ai_analysis: Json | null;
          altitude_m: number | null;
          aperture_mm: number | null;
          archive_item_id: string | null;
          attribution_text: string | null;
          background_gradient: number | null;
          binning: number | null;
          camera: string | null;
          captured_at: string | null;
          claimed_cells_count: number;
          content_sha256: string | null;
          deleted_at: string | null;
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
          licence_accepted_at: string | null;
          licence_code: string | null;
          longitude: number | null;
          metadata: Json | null;
          native_height_px: number | null;
          native_width_px: number | null;
          object_id: string | null;
          offset_int: number | null;
          original_filename: string;
          perceptual_hash: string | null;
          pipeline_version: string;
          pixel_size_um: number | null;
          processing_version: number;
          provenance: Json;
          quality_score: number | null;
          rejected: boolean | null;
          rejection_reason: string | null;
          rights_uri: string | null;
          sensor_height_px: number | null;
          sensor_width_px: number | null;
          snr: number | null;
          solved: boolean | null;
          solved_dec_deg: number | null;
          solved_ra_deg: number | null;
          solved_rotation_deg: number | null;
          solved_scale_arcsec_px: number | null;
          source_kind: string;
          star_count: number | null;
          status: string | null;
          storage_path: string;
          telescope: string | null;
          temperature_c: number | null;
          updated_at: string;
          uploaded_at: string;
          user_id: string | null;
          xp_awarded: number;
        };
        Insert: {
          ai_analysis?: Json | null;
          altitude_m?: number | null;
          aperture_mm?: number | null;
          archive_item_id?: string | null;
          attribution_text?: string | null;
          background_gradient?: number | null;
          binning?: number | null;
          camera?: string | null;
          captured_at?: string | null;
          claimed_cells_count?: number;
          content_sha256?: string | null;
          deleted_at?: string | null;
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
          licence_accepted_at?: string | null;
          licence_code?: string | null;
          longitude?: number | null;
          metadata?: Json | null;
          native_height_px?: number | null;
          native_width_px?: number | null;
          object_id?: string | null;
          offset_int?: number | null;
          original_filename: string;
          perceptual_hash?: string | null;
          pipeline_version?: string;
          pixel_size_um?: number | null;
          processing_version?: number;
          provenance?: Json;
          quality_score?: number | null;
          rejected?: boolean | null;
          rejection_reason?: string | null;
          rights_uri?: string | null;
          sensor_height_px?: number | null;
          sensor_width_px?: number | null;
          snr?: number | null;
          solved?: boolean | null;
          solved_dec_deg?: number | null;
          solved_ra_deg?: number | null;
          solved_rotation_deg?: number | null;
          solved_scale_arcsec_px?: number | null;
          source_kind?: string;
          star_count?: number | null;
          status?: string | null;
          storage_path: string;
          telescope?: string | null;
          temperature_c?: number | null;
          updated_at?: string;
          uploaded_at?: string;
          user_id?: string | null;
          xp_awarded?: number;
        };
        Update: {
          ai_analysis?: Json | null;
          altitude_m?: number | null;
          aperture_mm?: number | null;
          archive_item_id?: string | null;
          attribution_text?: string | null;
          background_gradient?: number | null;
          binning?: number | null;
          camera?: string | null;
          captured_at?: string | null;
          claimed_cells_count?: number;
          content_sha256?: string | null;
          deleted_at?: string | null;
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
          licence_accepted_at?: string | null;
          licence_code?: string | null;
          longitude?: number | null;
          metadata?: Json | null;
          native_height_px?: number | null;
          native_width_px?: number | null;
          object_id?: string | null;
          offset_int?: number | null;
          original_filename?: string;
          perceptual_hash?: string | null;
          pipeline_version?: string;
          pixel_size_um?: number | null;
          processing_version?: number;
          provenance?: Json;
          quality_score?: number | null;
          rejected?: boolean | null;
          rejection_reason?: string | null;
          rights_uri?: string | null;
          sensor_height_px?: number | null;
          sensor_width_px?: number | null;
          snr?: number | null;
          solved?: boolean | null;
          solved_dec_deg?: number | null;
          solved_ra_deg?: number | null;
          solved_rotation_deg?: number | null;
          solved_scale_arcsec_px?: number | null;
          source_kind?: string;
          star_count?: number | null;
          status?: string | null;
          storage_path?: string;
          telescope?: string | null;
          temperature_c?: number | null;
          updated_at?: string;
          uploaded_at?: string;
          user_id?: string | null;
          xp_awarded?: number;
        };
        Relationships: [
          {
            foreignKeyName: "astro_uploads_archive_item_id_fkey";
            columns: ["archive_item_id"];
            isOneToOne: true;
            referencedRelation: "archive_items";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "astro_uploads_object_id_fkey";
            columns: ["object_id"];
            isOneToOne: false;
            referencedRelation: "astro_objects";
            referencedColumns: ["id"];
          },
        ];
      };
      astrometric_solutions: {
        Row: {
          center_dec_deg: number;
          center_ra_deg: number;
          confidence: number;
          footprint: Json;
          id: string;
          matched_stars: number;
          native_pixel_scale_arcsec: number;
          pipeline_version: string;
          pixel_scale_arcsec: number;
          rms_px: number;
          rotation_deg: number;
          solved_at: string;
          upload_id: string;
          wcs_header: Json;
        };
        Insert: {
          center_dec_deg: number;
          center_ra_deg: number;
          confidence: number;
          footprint: Json;
          id?: string;
          matched_stars: number;
          native_pixel_scale_arcsec: number;
          pipeline_version: string;
          pixel_scale_arcsec: number;
          rms_px: number;
          rotation_deg: number;
          solved_at?: string;
          upload_id: string;
          wcs_header?: Json;
        };
        Update: {
          center_dec_deg?: number;
          center_ra_deg?: number;
          confidence?: number;
          footprint?: Json;
          id?: string;
          matched_stars?: number;
          native_pixel_scale_arcsec?: number;
          pipeline_version?: string;
          pixel_scale_arcsec?: number;
          rms_px?: number;
          rotation_deg?: number;
          solved_at?: string;
          upload_id?: string;
          wcs_header?: Json;
        };
        Relationships: [
          {
            foreignKeyName: "astrometric_solutions_upload_id_fkey";
            columns: ["upload_id"];
            isOneToOne: false;
            referencedRelation: "astro_uploads";
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
          cluster_key: string | null;
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
          cluster_key?: string | null;
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
          cluster_key?: string | null;
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
      moderation_events: {
        Row: {
          action: string;
          actor_user_id: string | null;
          cosmos_observation_id: string | null;
          created_at: string;
          id: string;
          next_state: Json | null;
          notes: string | null;
          previous_state: Json | null;
          reason_code: string | null;
          upload_id: string | null;
        };
        Insert: {
          action: string;
          actor_user_id?: string | null;
          cosmos_observation_id?: string | null;
          created_at?: string;
          id?: string;
          next_state?: Json | null;
          notes?: string | null;
          previous_state?: Json | null;
          reason_code?: string | null;
          upload_id?: string | null;
        };
        Update: {
          action?: string;
          actor_user_id?: string | null;
          cosmos_observation_id?: string | null;
          created_at?: string;
          id?: string;
          next_state?: Json | null;
          notes?: string | null;
          previous_state?: Json | null;
          reason_code?: string | null;
          upload_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "moderation_events_cosmos_observation_id_fkey";
            columns: ["cosmos_observation_id"];
            isOneToOne: false;
            referencedRelation: "cosmos_observations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "moderation_events_upload_id_fkey";
            columns: ["upload_id"];
            isOneToOne: false;
            referencedRelation: "astro_uploads";
            referencedColumns: ["id"];
          },
        ];
      };
      mosaic_generations: {
        Row: {
          activated_at: string | null;
          archive_ingest_run_id: string | null;
          contributing_source_uploads: number;
          created_at: string;
          expected_source_uploads: number;
          expected_tiles: number;
          failed_tiles: number;
          generation: number;
          id: string;
          layer_id: string;
          manifest_path: string | null;
          manifest_sha256: string | null;
          pipeline_version: string;
          planned_tiles: number;
          planned_tiles_sha256: string | null;
          preflight_locked_at: string | null;
          published_tiles: number;
          recipe: Json;
          source_inventory_sha256: string | null;
          source_job_id: string | null;
          status: string;
          updated_at: string;
          verification: Json;
        };
        Insert: {
          activated_at?: string | null;
          archive_ingest_run_id?: string | null;
          contributing_source_uploads?: number;
          created_at?: string;
          expected_source_uploads?: number;
          expected_tiles?: number;
          failed_tiles?: number;
          generation: number;
          id?: string;
          layer_id: string;
          manifest_path?: string | null;
          manifest_sha256?: string | null;
          pipeline_version: string;
          planned_tiles?: number;
          planned_tiles_sha256?: string | null;
          preflight_locked_at?: string | null;
          published_tiles?: number;
          recipe: Json;
          source_inventory_sha256?: string | null;
          source_job_id?: string | null;
          status?: string;
          updated_at?: string;
          verification?: Json;
        };
        Update: {
          activated_at?: string | null;
          archive_ingest_run_id?: string | null;
          contributing_source_uploads?: number;
          created_at?: string;
          expected_source_uploads?: number;
          expected_tiles?: number;
          failed_tiles?: number;
          generation?: number;
          id?: string;
          layer_id?: string;
          manifest_path?: string | null;
          manifest_sha256?: string | null;
          pipeline_version?: string;
          planned_tiles?: number;
          planned_tiles_sha256?: string | null;
          preflight_locked_at?: string | null;
          published_tiles?: number;
          recipe?: Json;
          source_inventory_sha256?: string | null;
          source_job_id?: string | null;
          status?: string;
          updated_at?: string;
          verification?: Json;
        };
        Relationships: [
          {
            foreignKeyName: "mosaic_generations_archive_ingest_run_id_fkey";
            columns: ["archive_ingest_run_id"];
            isOneToOne: false;
            referencedRelation: "archive_ingest_runs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "mosaic_generations_layer_id_fkey";
            columns: ["layer_id"];
            isOneToOne: false;
            referencedRelation: "mosaic_layers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "mosaic_generations_source_job_id_fkey";
            columns: ["source_job_id"];
            isOneToOne: true;
            referencedRelation: "processing_jobs";
            referencedColumns: ["id"];
          },
        ];
      };
      mosaic_layers: {
        Row: {
          created_at: string;
          current_generation_id: string | null;
          id: string;
          label: string;
          slug: string;
          spectral_band: string;
        };
        Insert: {
          created_at?: string;
          current_generation_id?: string | null;
          id?: string;
          label: string;
          slug: string;
          spectral_band: string;
        };
        Update: {
          created_at?: string;
          current_generation_id?: string | null;
          id?: string;
          label?: string;
          slug?: string;
          spectral_band?: string;
        };
        Relationships: [
          {
            foreignKeyName: "mosaic_layers_current_generation_id_fkey";
            columns: ["current_generation_id"];
            isOneToOne: false;
            referencedRelation: "mosaic_generations";
            referencedColumns: ["id"];
          },
        ];
      };
      mosaic_tiles: {
        Row: {
          byte_size: number;
          contribution_weights: Json;
          created_at: string;
          generation_id: string;
          healpix_index: number;
          healpix_order: number;
          id: string;
          media_type: string;
          sha256: string;
          source_upload_ids: string[];
          storage_path: string;
        };
        Insert: {
          byte_size: number;
          contribution_weights?: Json;
          created_at?: string;
          generation_id: string;
          healpix_index: number;
          healpix_order: number;
          id?: string;
          media_type: string;
          sha256: string;
          source_upload_ids?: string[];
          storage_path: string;
        };
        Update: {
          byte_size?: number;
          contribution_weights?: Json;
          created_at?: string;
          generation_id?: string;
          healpix_index?: number;
          healpix_order?: number;
          id?: string;
          media_type?: string;
          sha256?: string;
          source_upload_ids?: string[];
          storage_path?: string;
        };
        Relationships: [
          {
            foreignKeyName: "mosaic_tiles_generation_id_fkey";
            columns: ["generation_id"];
            isOneToOne: false;
            referencedRelation: "mosaic_generations";
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
      processing_job_events: {
        Row: {
          created_at: string;
          detail: Json;
          from_status: string | null;
          id: number;
          job_id: string;
          progress: number;
          to_status: string;
          worker_id: string | null;
        };
        Insert: {
          created_at?: string;
          detail?: Json;
          from_status?: string | null;
          id?: never;
          job_id: string;
          progress: number;
          to_status: string;
          worker_id?: string | null;
        };
        Update: {
          created_at?: string;
          detail?: Json;
          from_status?: string | null;
          id?: never;
          job_id?: string;
          progress?: number;
          to_status?: string;
          worker_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "processing_job_events_job_id_fkey";
            columns: ["job_id"];
            isOneToOne: false;
            referencedRelation: "processing_jobs";
            referencedColumns: ["id"];
          },
        ];
      };
      processing_jobs: {
        Row: {
          attempts: number;
          available_at: string;
          completed_at: string | null;
          cosmos_event_id: string | null;
          cosmos_observation_id: string | null;
          created_at: string;
          error_code: string | null;
          error_detail: string | null;
          heartbeat_at: string | null;
          id: string;
          idempotency_key: string;
          job_type: string;
          lease_expires_at: string | null;
          leased_by: string | null;
          max_attempts: number;
          object_id: string | null;
          owner_user_id: string | null;
          payload: Json;
          pipeline_version: string;
          progress: number;
          result: Json | null;
          status: string;
          updated_at: string;
          upload_id: string | null;
          version: number;
        };
        Insert: {
          attempts?: number;
          available_at?: string;
          completed_at?: string | null;
          cosmos_event_id?: string | null;
          cosmos_observation_id?: string | null;
          created_at?: string;
          error_code?: string | null;
          error_detail?: string | null;
          heartbeat_at?: string | null;
          id?: string;
          idempotency_key: string;
          job_type: string;
          lease_expires_at?: string | null;
          leased_by?: string | null;
          max_attempts?: number;
          object_id?: string | null;
          owner_user_id?: string | null;
          payload?: Json;
          pipeline_version?: string;
          progress?: number;
          result?: Json | null;
          status?: string;
          updated_at?: string;
          upload_id?: string | null;
          version?: number;
        };
        Update: {
          attempts?: number;
          available_at?: string;
          completed_at?: string | null;
          cosmos_event_id?: string | null;
          cosmos_observation_id?: string | null;
          created_at?: string;
          error_code?: string | null;
          error_detail?: string | null;
          heartbeat_at?: string | null;
          id?: string;
          idempotency_key?: string;
          job_type?: string;
          lease_expires_at?: string | null;
          leased_by?: string | null;
          max_attempts?: number;
          object_id?: string | null;
          owner_user_id?: string | null;
          payload?: Json;
          pipeline_version?: string;
          progress?: number;
          result?: Json | null;
          status?: string;
          updated_at?: string;
          upload_id?: string | null;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "processing_jobs_cosmos_event_id_fkey";
            columns: ["cosmos_event_id"];
            isOneToOne: false;
            referencedRelation: "cosmos_events";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "processing_jobs_cosmos_observation_id_fkey";
            columns: ["cosmos_observation_id"];
            isOneToOne: false;
            referencedRelation: "cosmos_observations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "processing_jobs_object_id_fkey";
            columns: ["object_id"];
            isOneToOne: false;
            referencedRelation: "astro_objects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "processing_jobs_upload_id_fkey";
            columns: ["upload_id"];
            isOneToOne: false;
            referencedRelation: "astro_uploads";
            referencedColumns: ["id"];
          },
        ];
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
          mosaic_anonymous: boolean;
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
          mosaic_anonymous?: boolean;
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
          mosaic_anonymous?: boolean;
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
      sky_coverage_cells: {
        Row: {
          anonymous_attribution: boolean;
          attribution_text: string | null;
          claimed_at: string;
          coverage_fraction: number;
          first_archive_item_id: string | null;
          first_upload_id: string;
          first_user_id: string | null;
          healpix_index: number;
          healpix_order: number;
          moderation_status: string;
          resolution_class: string;
          source_kind: string;
        };
        Insert: {
          anonymous_attribution?: boolean;
          attribution_text?: string | null;
          claimed_at?: string;
          coverage_fraction: number;
          first_archive_item_id?: string | null;
          first_upload_id: string;
          first_user_id?: string | null;
          healpix_index: number;
          healpix_order: number;
          moderation_status?: string;
          resolution_class: string;
          source_kind?: string;
        };
        Update: {
          anonymous_attribution?: boolean;
          attribution_text?: string | null;
          claimed_at?: string;
          coverage_fraction?: number;
          first_archive_item_id?: string | null;
          first_upload_id?: string;
          first_user_id?: string | null;
          healpix_index?: number;
          healpix_order?: number;
          moderation_status?: string;
          resolution_class?: string;
          source_kind?: string;
        };
        Relationships: [
          {
            foreignKeyName: "sky_coverage_cells_first_archive_item_id_fkey";
            columns: ["first_archive_item_id"];
            isOneToOne: false;
            referencedRelation: "archive_items";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sky_coverage_cells_first_upload_id_fkey";
            columns: ["first_upload_id"];
            isOneToOne: false;
            referencedRelation: "astro_uploads";
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
      xp_ledger: {
        Row: {
          created_at: string;
          event_type: string;
          healpix_index: number | null;
          healpix_order: number | null;
          id: string;
          idempotency_key: string;
          points: number;
          reason: string | null;
          upload_id: string | null;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          event_type: string;
          healpix_index?: number | null;
          healpix_order?: number | null;
          id?: string;
          idempotency_key: string;
          points: number;
          reason?: string | null;
          upload_id?: string | null;
          user_id: string;
        };
        Update: {
          created_at?: string;
          event_type?: string;
          healpix_index?: number | null;
          healpix_order?: number | null;
          id?: string;
          idempotency_key?: string;
          points?: number;
          reason?: string | null;
          upload_id?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "xp_ledger_upload_id_fkey";
            columns: ["upload_id"];
            isOneToOne: false;
            referencedRelation: "astro_uploads";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      cancel_processing_job: {
        Args: { p_job_id: string; p_user_id: string };
        Returns: boolean;
      };
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
      get_archive_master_status_v9: {
        Args: { p_object_id?: string };
        Returns: Json;
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
      get_mosaic_cells: {
        Args: { p_indices: number[]; p_order: number };
        Returns: {
          anonymous_attribution: boolean;
          claimed_at: string;
          coverage_fraction: number;
          healpix_index: number;
          healpix_order: number;
          moderation_status: string;
          pioneer_name: string;
          pioneer_user_id: string;
          resolution_class: string;
          tile_path: string;
        }[];
      };
      get_public_cosmos_events: {
        Args: { p_limit?: number; p_since_hours?: number };
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
      get_public_cosmos_observations: {
        Args: { p_limit?: number; p_since_minutes?: number };
        Returns: {
          confidence: number;
          description: string;
          duration_s: number;
          event_id: string;
          id: string;
          latitude: number;
          longitude: number;
          magnitude: number;
          observed_at: string;
          phenomenon_type: string;
          status: string;
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
      get_user_mosaic_stats: {
        Args: { p_user_id: string };
        Returns: {
          pioneer_cells: number;
          xp_total: number;
        }[];
      };
      request_stack_job: {
        Args: {
          p_idempotency_key: string;
          p_object_id: string;
          p_user_id: string;
        };
        Returns: Json;
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
