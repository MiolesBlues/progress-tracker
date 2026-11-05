export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      program_days: {
        Row: {
          archived_at: string | null
          created_at: string
          id: string
          name: string
          position: number
          template_application_id: string | null
          template_day_key: string | null
          user_id: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          id?: string
          name: string
          position?: number
          template_application_id?: string | null
          template_day_key?: string | null
          user_id?: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          id?: string
          name?: string
          position?: number
          template_application_id?: string | null
          template_day_key?: string | null
          user_id?: string
        }
        Relationships: []
      }
      program_exercises: {
        Row: {
          archived_at: string | null
          created_at: string
          day: string
          day_id: string | null
          example_reps: number[] | null
          id: string
          name: string
          position: number
          target_reps: string | null
          target_sets: number | null
          target_rir_min: number | null
          target_rir_max: number | null
          user_id: string
          working_weight: number | null
          template_application_id: string | null
          template_slot_key: string | null
          template_exercise_key: string | null
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          day?: string
          day_id?: string | null
          example_reps?: number[] | null
          id?: string
          name: string
          position?: number
          target_reps?: string | null
          target_sets?: number | null
          target_rir_min?: number | null
          target_rir_max?: number | null
          user_id?: string
          working_weight?: number | null
          template_application_id?: string | null
          template_slot_key?: string | null
          template_exercise_key?: string | null
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          day?: string
          day_id?: string | null
          example_reps?: number[] | null
          id?: string
          name?: string
          position?: number
          target_reps?: string | null
          target_sets?: number | null
          target_rir_min?: number | null
          target_rir_max?: number | null
          user_id?: string
          working_weight?: number | null
          template_application_id?: string | null
          template_slot_key?: string | null
          template_exercise_key?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "program_exercises_day_owner_fkey"
            columns: ["day_id", "user_id"]
            isOneToOne: false
            referencedRelation: "program_days"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      workout_entries: {
        Row: {
          created_at: string
          day: string
          day_id: string | null
          day_name: string | null
          exercise_id: string
          id: string
          notes: string | null
          performed_on: string
          reps: number[]
          rir: number | null
          user_id: string
          weight: number
        }
        Insert: {
          created_at?: string
          day?: string
          day_id?: string | null
          day_name?: string | null
          exercise_id: string
          id?: string
          notes?: string | null
          performed_on?: string
          reps: number[]
          rir?: number | null
          user_id?: string
          weight: number
        }
        Update: {
          created_at?: string
          day?: string
          day_id?: string | null
          day_name?: string | null
          exercise_id?: string
          id?: string
          notes?: string | null
          performed_on?: string
          reps?: number[]
          rir?: number | null
          user_id?: string
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "workout_entries_day_owner_fkey"
            columns: ["day_id", "user_id"]
            isOneToOne: false
            referencedRelation: "program_days"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "workout_entries_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "program_exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workout_entries_exercise_owner_fkey"
            columns: ["exercise_id", "user_id"]
            isOneToOne: false
            referencedRelation: "program_exercises"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      workout_entry_sets: {
        Row: {
          revision: number
          created_at: string
          id: string
          legacy_snapshot: boolean
          load_type: "external" | "bodyweight"
          position: number
          reps: number
          rir: number | null
          set_type: "warmup" | "working"
          updated_at: string
          user_id: string
          weight: number
          workout_entry_id: string
        }
        Insert: {
          revision?: number
          created_at?: string
          id: string
          legacy_snapshot?: boolean
          load_type?: "external" | "bodyweight"
          position: number
          reps: number
          rir?: number | null
          set_type?: "warmup" | "working"
          updated_at?: string
          user_id?: string
          weight: number
          workout_entry_id: string
        }
        Update: {
          revision?: number
          created_at?: string
          id?: string
          legacy_snapshot?: boolean
          load_type?: "external" | "bodyweight"
          position?: number
          reps?: number
          rir?: number | null
          set_type?: "warmup" | "working"
          updated_at?: string
          user_id?: string
          weight?: number
          workout_entry_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workout_entry_sets_entry_owner_fkey"
            columns: ["workout_entry_id", "user_id"]
            isOneToOne: false
            referencedRelation: "workout_entries"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      training_exercise_catalog: {
        Row: { exercise_key: string; name_ru: string; metadata: Json; content_sha256: string; created_at: string }
        Insert: { exercise_key: string; name_ru: string; metadata?: Json; content_sha256: string; created_at?: string }
        Update: { exercise_key?: string; name_ru?: string; metadata?: Json; content_sha256?: string; created_at?: string }
        Relationships: []
      }
      training_templates: {
        Row: { template_key: string; version: number; title_ru: string; days_per_week: number; metadata: Json; content_sha256: string; created_at: string }
        Insert: { template_key: string; version: number; title_ru: string; days_per_week: number; metadata?: Json; content_sha256: string; created_at?: string }
        Update: { template_key?: string; version?: number; title_ru?: string; days_per_week?: number; metadata?: Json; content_sha256?: string; created_at?: string }
        Relationships: []
      }
      training_template_days: {
        Row: { template_key: string; version: number; day_key: string; day_order: number; weekday: number; session_type: string; title_ru: string; metadata: Json }
        Insert: { template_key: string; version: number; day_key: string; day_order: number; weekday: number; session_type: string; title_ru: string; metadata?: Json }
        Update: { template_key?: string; version?: number; day_key?: string; day_order?: number; weekday?: number; session_type?: string; title_ru?: string; metadata?: Json }
        Relationships: []
      }
      training_template_slots: {
        Row: { template_key: string; version: number; day_key: string; slot_key: string; exercise_key: string; slot_order: number; prescription: Json }
        Insert: { template_key: string; version: number; day_key: string; slot_key: string; exercise_key: string; slot_order: number; prescription: Json }
        Update: { template_key?: string; version?: number; day_key?: string; slot_key?: string; exercise_key?: string; slot_order?: number; prescription?: Json }
        Relationships: []
      }
      training_template_applications: {
        Row: { application_id: string; user_id: string; template_key: string; version: number; created_at: string }
        Insert: { application_id: string; user_id?: string; template_key: string; version: number; created_at?: string }
        Update: { application_id?: string; user_id?: string; template_key?: string; version?: number; created_at?: string }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      archive_deletion_capabilities: {
        Args: Record<PropertyKey, never>
        Returns: boolean
      }
      delete_archived_program_day: {
        Args: { _day_id: string }
        Returns: boolean
      }
      delete_archived_program_exercise: {
        Args: { _exercise_id: string }
        Returns: boolean
      }
      reorder_program_days: {
        Args: { _ids: string[] }
        Returns: undefined
      }
      reorder_program_exercises: {
        Args: { _day_id: string; _ids: string[] }
        Returns: undefined
      }
      save_workout_entry: {
        Args: {
          _day_id: string
          _exercise_id: string
          _id: string
          _notes?: string | null
          _performed_on: string
          _reps: number[]
          _rir?: number | null
          _weight: number
        }
        Returns: string
      }
      save_workout_entry_sets: {
        Args: {
          _day_id: string
          _exercise_id: string
          _id: string
          _notes?: string | null
          _performed_on: string
          _sets: Json
        }
        Returns: string
      }
      add_workout_entry_set: {
        Args: {
          _entry_id: string
          _load_type?: "external" | "bodyweight"
          _reps: number
          _rir: string | null
          _set_id: string
          _set_type?: "warmup" | "working"
          _weight: string
        }
        Returns: string
      }
      update_workout_entry_set: {
        Args: {
          _entry_id: string
          _load_type?: "external" | "bodyweight"
          _reps: number
          _rir: string | null
          _set_id: string
          _set_type?: "warmup" | "working"
          _weight: string
        }
        Returns: boolean
      }
      edit_workout_entry_set: {
        Args: {
          _operation_id: string
          _entry_id: string
          _set_id: string
          _expected_revision: number
          _weight: string
          _reps: number
          _rir: string | null
          _set_type?: "warmup" | "working"
          _load_type?: "external" | "bodyweight"
        }
        Returns: number
      }
      delete_workout_entry_set: {
        Args: { _entry_id: string; _set_id: string }
        Returns: boolean
      }
      reorder_workout_entry_sets: {
        Args: { _entry_id: string; _ids: string[] }
        Returns: boolean
      }
      setup_program: {
        Args: { _names: string[]; _template?: string }
        Returns: undefined
      }
      apply_training_template: {
        Args: { _application_id: string; _template_key: string; _version: number; _names: string[]; _daily_opt_in?: boolean }
        Returns: undefined
      }
      list_training_templates: {
        Args: { _days_per_week: number; _experience?: string | null }
        Returns: { template_key: string; version: number; title_ru: string; days_per_week: number; metadata: Json }[]
      }
      upsert_training_library: {
        Args: { _bundle: Json; _content_sha256: string }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
