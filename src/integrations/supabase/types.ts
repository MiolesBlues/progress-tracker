export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18";
  };
  public: {
    Tables: {
      program_days: {
        Row: {
          archived_at: string | null;
          created_at: string;
          id: string;
          name: string;
          position: number;
          user_id: string;
        };
        Insert: {
          archived_at?: string | null;
          created_at?: string;
          id?: string;
          name: string;
          position?: number;
          user_id?: string;
        };
        Update: {
          archived_at?: string | null;
          created_at?: string;
          id?: string;
          name?: string;
          position?: number;
          user_id?: string;
        };
        Relationships: [];
      };
      program_exercises: {
        Row: {
          archived_at: string | null;
          created_at: string;
          day: string;
          day_id: string | null;
          example_reps: number[] | null;
          id: string;
          name: string;
          position: number;
          target_reps: string | null;
          target_sets: number | null;
          user_id: string;
          working_weight: number | null;
        };
        Insert: {
          archived_at?: string | null;
          created_at?: string;
          day?: string;
          day_id?: string | null;
          example_reps?: number[] | null;
          id?: string;
          name: string;
          position?: number;
          target_reps?: string | null;
          target_sets?: number | null;
          user_id?: string;
          working_weight?: number | null;
        };
        Update: {
          archived_at?: string | null;
          created_at?: string;
          day?: string;
          day_id?: string | null;
          example_reps?: number[] | null;
          id?: string;
          name?: string;
          position?: number;
          target_reps?: string | null;
          target_sets?: number | null;
          user_id?: string;
          working_weight?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "program_exercises_day_owner_fkey";
            columns: ["day_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "program_days";
            referencedColumns: ["id", "user_id"];
          },
        ];
      };
      workout_entries: {
        Row: {
          created_at: string;
          day: string;
          day_id: string | null;
          day_name: string | null;
          exercise_id: string;
          id: string;
          notes: string | null;
          performed_on: string;
          reps: number[];
          rir: number | null;
          user_id: string;
          weight: number;
        };
        Insert: {
          created_at?: string;
          day?: string;
          day_id?: string | null;
          day_name?: string | null;
          exercise_id: string;
          id?: string;
          notes?: string | null;
          performed_on?: string;
          reps: number[];
          rir?: number | null;
          user_id?: string;
          weight: number;
        };
        Update: {
          created_at?: string;
          day?: string;
          day_id?: string | null;
          day_name?: string | null;
          exercise_id?: string;
          id?: string;
          notes?: string | null;
          performed_on?: string;
          reps?: number[];
          rir?: number | null;
          user_id?: string;
          weight?: number;
        };
        Relationships: [
          {
            foreignKeyName: "workout_entries_day_owner_fkey";
            columns: ["day_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "program_days";
            referencedColumns: ["id", "user_id"];
          },
          {
            foreignKeyName: "workout_entries_exercise_id_fkey";
            columns: ["exercise_id"];
            isOneToOne: false;
            referencedRelation: "program_exercises";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "workout_entries_exercise_owner_fkey";
            columns: ["exercise_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "program_exercises";
            referencedColumns: ["id", "user_id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      save_workout_entry: {
        Args: {
          _id: string;
          _exercise_id: string;
          _day_id: string;
          _performed_on: string;
          _weight: number;
          _reps: number[];
          _rir: number | null;
          _notes: string | null;
        };
        Returns: string;
      };
      reorder_program_days: {
        Args: { _ids: string[] };
        Returns: undefined;
      };
      reorder_program_exercises: {
        Args: { _day_id: string; _ids: string[] };
        Returns: undefined;
      };
      setup_program: {
        Args: { _names: string[]; _template?: string };
        Returns: undefined;
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
