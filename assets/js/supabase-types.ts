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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      areas: {
        Row: {
          data: Json
          id: string
          updated_at: string
        }
        Insert: {
          data: Json
          id: string
          updated_at?: string
        }
        Update: {
          data?: Json
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      contacts: {
        Row: {
          data: Json
          household_id: string
          id: string
          updated_at: string
        }
        Insert: {
          data?: Json
          household_id: string
          id?: string
          updated_at?: string
        }
        Update: {
          data?: Json
          household_id?: string
          id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contacts_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: true
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      criteria: {
        Row: {
          data: Json
          household_id: string
          id: string
          updated_at: string
        }
        Insert: {
          data?: Json
          household_id: string
          id?: string
          updated_at?: string
        }
        Update: {
          data?: Json
          household_id?: string
          id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "criteria_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: true
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      debts_credit_cards: {
        Row: {
          card_name: string | null
          credit_limit: number | null
          current_balance: number | null
          household_id: string
          id: string
          intended_action: string | null
          minimum_monthly_payment: number | null
          pays_in_full_monthly: boolean
          provider: string
          updated_at: string
          utilisation_pct: number | null
        }
        Insert: {
          card_name?: string | null
          credit_limit?: number | null
          current_balance?: number | null
          household_id: string
          id?: string
          intended_action?: string | null
          minimum_monthly_payment?: number | null
          pays_in_full_monthly?: boolean
          provider: string
          updated_at?: string
          utilisation_pct?: number | null
        }
        Update: {
          card_name?: string | null
          credit_limit?: number | null
          current_balance?: number | null
          household_id?: string
          id?: string
          intended_action?: string | null
          minimum_monthly_payment?: number | null
          pays_in_full_monthly?: boolean
          provider?: string
          updated_at?: string
          utilisation_pct?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "debts_credit_cards_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      debts_other: {
        Row: {
          balance: number | null
          debt_type: string
          household_id: string
          id: string
          monthly_payment: number | null
          notes: string | null
          provider: string | null
          updated_at: string
        }
        Insert: {
          balance?: number | null
          debt_type: string
          household_id: string
          id?: string
          monthly_payment?: number | null
          notes?: string | null
          provider?: string | null
          updated_at?: string
        }
        Update: {
          balance?: number | null
          debt_type?: string
          household_id?: string
          id?: string
          monthly_payment?: number | null
          notes?: string | null
          provider?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "debts_other_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      debts_student_loans: {
        Row: {
          balance: number | null
          household_id: string
          id: string
          monthly_deduction: number | null
          plan: string
          updated_at: string
        }
        Insert: {
          balance?: number | null
          household_id: string
          id?: string
          monthly_deduction?: number | null
          plan: string
          updated_at?: string
        }
        Update: {
          balance?: number | null
          household_id?: string
          id?: string
          monthly_deduction?: number | null
          plan?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "debts_student_loans_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      finances: {
        Row: {
          data: Json
          household_id: string
          id: string
          updated_at: string
        }
        Insert: {
          data?: Json
          household_id: string
          id?: string
          updated_at?: string
        }
        Update: {
          data?: Json
          household_id?: string
          id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "finances_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: true
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      goals: {
        Row: {
          data: Json
          household_id: string
          id: string
          updated_at: string
        }
        Insert: {
          data?: Json
          household_id: string
          id?: string
          updated_at?: string
        }
        Update: {
          data?: Json
          household_id?: string
          id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "goals_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: true
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      house_types: {
        Row: {
          data: Json
          id: string
          updated_at: string
        }
        Insert: {
          data: Json
          id: string
          updated_at?: string
        }
        Update: {
          data?: Json
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      household_members: {
        Row: {
          household_id: string
          id: string
          joined_at: string
          user_id: string
        }
        Insert: {
          household_id: string
          id?: string
          joined_at?: string
          user_id: string
        }
        Update: {
          household_id?: string
          id?: string
          joined_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "household_members_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      households: {
        Row: {
          created_at: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          name?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      investments_accounts: {
        Row: {
          account_opened: string | null
          account_type: string
          current_value: number | null
          data: Json
          earmark_pct: number
          earmarked_for: string | null
          household_id: string
          id: string
          provider: string
          strategy_epoch: string | null
          updated_at: string
        }
        Insert: {
          account_opened?: string | null
          account_type: string
          current_value?: number | null
          data?: Json
          earmark_pct?: number
          earmarked_for?: string | null
          household_id: string
          id?: string
          provider: string
          strategy_epoch?: string | null
          updated_at?: string
        }
        Update: {
          account_opened?: string | null
          account_type?: string
          current_value?: number | null
          data?: Json
          earmark_pct?: number
          earmarked_for?: string | null
          household_id?: string
          id?: string
          provider?: string
          strategy_epoch?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "investments_accounts_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      investments_history: {
        Row: {
          account_id: string | null
          deposits: number
          dividends: number
          epoch: string | null
          household_id: string
          id: string
          interest: number
          month: string
          net: number
          realised_pnl: number
          updated_at: string
          withdrawals: number
        }
        Insert: {
          account_id?: string | null
          deposits?: number
          dividends?: number
          epoch?: string | null
          household_id: string
          id?: string
          interest?: number
          month: string
          net?: number
          realised_pnl?: number
          updated_at?: string
          withdrawals?: number
        }
        Update: {
          account_id?: string | null
          deposits?: number
          dividends?: number
          epoch?: string | null
          household_id?: string
          id?: string
          interest?: number
          month?: string
          net?: number
          realised_pnl?: number
          updated_at?: string
          withdrawals?: number
        }
        Relationships: [
          {
            foreignKeyName: "investments_history_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "investments_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "investments_history_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      journey_checks: {
        Row: {
          data: Json
          household_id: string
          id: string
          updated_at: string
        }
        Insert: {
          data?: Json
          household_id: string
          id?: string
          updated_at?: string
        }
        Update: {
          data?: Json
          household_id?: string
          id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "journey_checks_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: true
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      outreach: {
        Row: {
          data: Json
          household_id: string
          id: string
          updated_at: string
        }
        Insert: {
          data?: Json
          household_id: string
          id?: string
          updated_at?: string
        }
        Update: {
          data?: Json
          household_id?: string
          id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "outreach_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: true
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      profile: {
        Row: {
          data: Json
          extended_data: Json
          household_id: string
          id: string
          updated_at: string
        }
        Insert: {
          data?: Json
          extended_data?: Json
          household_id: string
          id?: string
          updated_at?: string
        }
        Update: {
          data?: Json
          extended_data?: Json
          household_id?: string
          id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: true
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      readiness_checklist: {
        Row: {
          completed: boolean | null
          completed_at: string | null
          household_id: string
          id: string
          item_key: string
          item_label: string
          notes: string | null
          updated_at: string
        }
        Insert: {
          completed?: boolean | null
          completed_at?: string | null
          household_id: string
          id?: string
          item_key: string
          item_label: string
          notes?: string | null
          updated_at?: string
        }
        Update: {
          completed?: boolean | null
          completed_at?: string | null
          household_id?: string
          id?: string
          item_key?: string
          item_label?: string
          notes?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "readiness_checklist_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      shortlist: {
        Row: {
          data: Json
          household_id: string
          id: string
          updated_at: string
        }
        Insert: {
          data?: Json
          household_id: string
          id?: string
          updated_at?: string
        }
        Update: {
          data?: Json
          household_id?: string
          id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shortlist_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: true
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      sync_log: {
        Row: {
          action: string
          actor: string
          at: string
          id: string
          row_id: string | null
          table_name: string
        }
        Insert: {
          action: string
          actor: string
          at?: string
          id?: string
          row_id?: string | null
          table_name: string
        }
        Update: {
          action?: string
          actor?: string
          at?: string
          id?: string
          row_id?: string | null
          table_name?: string
        }
        Relationships: []
      }
      zones: {
        Row: {
          data: Json
          household_id: string
          id: string
          updated_at: string
        }
        Insert: {
          data?: Json
          household_id: string
          id?: string
          updated_at?: string
        }
        Update: {
          data?: Json
          household_id?: string
          id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "zones_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: true
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      is_household_member: {
        Args: { p_household_id: string }
        Returns: boolean
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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
