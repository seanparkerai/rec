// types/supabase.d.ts — GENERATED from the live Supabase schema. DO NOT HAND-EDIT.
// Generated: 2026-07-03 via mcp__supabase__generate_typescript_types (project qxmyrahqsopmaeokxdub).
// 2026-07-09: household_areas.is_origin removed to mirror migration
// drop_is_origin_from_household_areas (generator unavailable this session — the
// diff is mechanical: three dropped lines; regenerate at next schema change).
// Regenerate after every schema migration — the §17/§18.5 schema-change ceremony
// (docs/SUPABASE_SYNC.md) includes this as a step. Consumed type-only via JSDoc
// `import('../types/supabase.js')` annotations (tier-0 checkJs); never shipped to the browser.
// The sibling `supabase.js` is an empty runtime stub so the specifier resolves for both
// tsc and the asset-links rail (tests/contract/asset-links.test.js).
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
      area_confirmations: {
        Row: {
          data: Json
          household_id: string
          id: string
          updated_at: string | null
        }
        Insert: {
          data?: Json
          household_id: string
          id?: string
          updated_at?: string | null
        }
        Update: {
          data?: Json
          household_id?: string
          id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "area_confirmations_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: true
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      area_search_tuning: {
        Row: {
          area_id: string
          computed_at: string | null
          confidence: string | null
          explore_until: string | null
          geofence_radii: Json | null
          geofence_radius_mi: number | null
          last_explored_at: string | null
          like_count: number | null
          method: string | null
          override_radius_mi: number | null
          recommended_radius_mi: number | null
          sample_size: number | null
          search_radius_mi: number | null
          updated_at: string
        }
        Insert: {
          area_id: string
          computed_at?: string | null
          confidence?: string | null
          explore_until?: string | null
          geofence_radii?: Json | null
          geofence_radius_mi?: number | null
          last_explored_at?: string | null
          like_count?: number | null
          method?: string | null
          override_radius_mi?: number | null
          recommended_radius_mi?: number | null
          sample_size?: number | null
          search_radius_mi?: number | null
          updated_at?: string
        }
        Update: {
          area_id?: string
          computed_at?: string | null
          confidence?: string | null
          explore_until?: string | null
          geofence_radii?: Json | null
          geofence_radius_mi?: number | null
          last_explored_at?: string | null
          like_count?: number | null
          method?: string | null
          override_radius_mi?: number | null
          recommended_radius_mi?: number | null
          sample_size?: number | null
          search_radius_mi?: number | null
          updated_at?: string
        }
        Relationships: []
      }
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
      ask_conversations: {
        Row: {
          created_at: string
          household_id: string
          id: string
          messages: Json
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          household_id: string
          id?: string
          messages?: Json
          title?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          household_id?: string
          id?: string
          messages?: Json
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ask_conversations_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
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
      household_areas: {
        Row: {
          added_via: string
          area_id: string
          created_at: string
          household_id: string
          status: string
        }
        Insert: {
          added_via?: string
          area_id: string
          created_at?: string
          household_id: string
          status?: string
        }
        Update: {
          added_via?: string
          area_id?: string
          created_at?: string
          household_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "household_areas_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "household_areas_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
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
      household_review_stats: {
        Row: {
          household_id: string
          pending_count: number
          updated_at: string
        }
        Insert: {
          household_id: string
          pending_count?: number
          updated_at?: string
        }
        Update: {
          household_id?: string
          pending_count?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "household_review_stats_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: true
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
      journey_progress: {
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
            foreignKeyName: "journey_progress_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: true
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      learned_preferences: {
        Row: {
          derived: Json
          dismissals: Json
          household_id: string
          id: string
          overrides: Json
          updated_at: string
        }
        Insert: {
          derived?: Json
          dismissals?: Json
          household_id: string
          id?: string
          overrides?: Json
          updated_at?: string
        }
        Update: {
          derived?: Json
          dismissals?: Json
          household_id?: string
          id?: string
          overrides?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "learned_preferences_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: true
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      listing_areas: {
        Row: {
          area_id: string
          created_at: string
          distance_mi: number | null
          is_primary: boolean
          rightmove_id: string
        }
        Insert: {
          area_id: string
          created_at?: string
          distance_mi?: number | null
          is_primary?: boolean
          rightmove_id: string
        }
        Update: {
          area_id?: string
          created_at?: string
          distance_mi?: number | null
          is_primary?: boolean
          rightmove_id?: string
        }
        Relationships: []
      }
      listing_reactions: {
        Row: {
          created_at: string
          household_id: string
          id: string
          listing_id: string
          listing_snapshot: Json | null
          reaction: string
          reason: string | null
          reasons: Json
          user_id: string | null
        }
        Insert: {
          created_at?: string
          household_id: string
          id?: string
          listing_id: string
          listing_snapshot?: Json | null
          reaction: string
          reason?: string | null
          reasons?: Json
          user_id?: string | null
        }
        Update: {
          created_at?: string
          household_id?: string
          id?: string
          listing_id?: string
          listing_snapshot?: Json | null
          reaction?: string
          reason?: string | null
          reasons?: Json
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "listing_reactions_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      listings: {
        Row: {
          added_date: string | null
          address: string | null
          area_id: string | null
          baths: number | null
          beds: number | null
          corroborated: boolean | null
          council_tax: string | null
          description: string | null
          distance_mi: number | null
          epc: string | null
          first_seen: string
          floorplan_url: string | null
          geofence_pass: boolean | null
          id: string
          image_url: string | null
          last_seen: string
          lat: number | null
          lng: number | null
          match_source: string | null
          name_match: boolean | null
          outcode: string
          postcode: string | null
          price: number | null
          price_history: Json
          property_type: string | null
          raw_json: Json
          rightmove_id: string
          source: string
          status: string
          tenure: string | null
          title: string | null
          update_reason: string | null
          updated_at: string
          url: string | null
        }
        Insert: {
          added_date?: string | null
          address?: string | null
          area_id?: string | null
          baths?: number | null
          beds?: number | null
          corroborated?: boolean | null
          council_tax?: string | null
          description?: string | null
          distance_mi?: number | null
          epc?: string | null
          first_seen?: string
          floorplan_url?: string | null
          geofence_pass?: boolean | null
          id?: string
          image_url?: string | null
          last_seen?: string
          lat?: number | null
          lng?: number | null
          match_source?: string | null
          name_match?: boolean | null
          outcode: string
          postcode?: string | null
          price?: number | null
          price_history?: Json
          property_type?: string | null
          raw_json: Json
          rightmove_id: string
          source?: string
          status?: string
          tenure?: string | null
          title?: string | null
          update_reason?: string | null
          updated_at?: string
          url?: string | null
        }
        Update: {
          added_date?: string | null
          address?: string | null
          area_id?: string | null
          baths?: number | null
          beds?: number | null
          corroborated?: boolean | null
          council_tax?: string | null
          description?: string | null
          distance_mi?: number | null
          epc?: string | null
          first_seen?: string
          floorplan_url?: string | null
          geofence_pass?: boolean | null
          id?: string
          image_url?: string | null
          last_seen?: string
          lat?: number | null
          lng?: number | null
          match_source?: string | null
          name_match?: boolean | null
          outcode?: string
          postcode?: string | null
          price?: number | null
          price_history?: Json
          property_type?: string | null
          raw_json?: Json
          rightmove_id?: string
          source?: string
          status?: string
          tenure?: string | null
          title?: string | null
          update_reason?: string | null
          updated_at?: string
          url?: string | null
        }
        Relationships: []
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
      refinement_runs: {
        Row: {
          actionable_count: number
          candidates_evaluated: number
          household_id: string
          id: string
          params: Json
          run_at: string
          weights_snapshot: Json | null
        }
        Insert: {
          actionable_count?: number
          candidates_evaluated?: number
          household_id: string
          id?: string
          params?: Json
          run_at?: string
          weights_snapshot?: Json | null
        }
        Update: {
          actionable_count?: number
          candidates_evaluated?: number
          household_id?: string
          id?: string
          params?: Json
          run_at?: string
          weights_snapshot?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "refinement_runs_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      refinement_suggestions: {
        Row: {
          dimension: string
          first_detected_at: string
          household_id: string
          id: string
          last_evaluated_at: string
          metrics: Json
          runs_qualified: number
          snoozed_until: string | null
          status: string
          tier: string | null
          updated_at: string
          value: string
        }
        Insert: {
          dimension: string
          first_detected_at?: string
          household_id: string
          id?: string
          last_evaluated_at?: string
          metrics?: Json
          runs_qualified?: number
          snoozed_until?: string | null
          status?: string
          tier?: string | null
          updated_at?: string
          value: string
        }
        Update: {
          dimension?: string
          first_detected_at?: string
          household_id?: string
          id?: string
          last_evaluated_at?: string
          metrics?: Json
          runs_qualified?: number
          snoozed_until?: string | null
          status?: string
          tier?: string | null
          updated_at?: string
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "refinement_suggestions_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      scrape_probation: {
        Row: {
          approved_at: string
          dimension: string
          household_id: string
          id: string
          last_reprobe_run: number
          reprobe_every_runs: number
          status: string
          updated_at: string
          value: string
        }
        Insert: {
          approved_at?: string
          dimension: string
          household_id: string
          id?: string
          last_reprobe_run?: number
          reprobe_every_runs?: number
          status?: string
          updated_at?: string
          value: string
        }
        Update: {
          approved_at?: string
          dimension?: string
          household_id?: string
          id?: string
          last_reprobe_run?: number
          reprobe_every_runs?: number
          status?: string
          updated_at?: string
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "scrape_probation_household_id_fkey"
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
      ask_reaction_counts: {
        Args: { hh: string }
        Returns: {
          n: number
          reaction: string
        }[]
      }
      household_feed: {
        Args: {
          p_household_id: string
          p_include_out_of_area?: boolean
          p_limit?: number
          p_min_beds?: number
          p_offset?: number
          p_price_max?: number
          p_price_min?: number
          p_status?: string
        }
        Returns: {
          added_date: string
          address: string
          area_id: string
          areas: Json
          baths: number
          beds: number
          corroborated: boolean
          council_tax: string
          description: string
          distance_mi: number
          epc: string
          first_seen: string
          geofence_pass: boolean
          image_url: string
          last_seen: string
          lat: number
          lng: number
          match_source: string
          name_match: boolean
          outcode: string
          postcode: string
          price: number
          price_history: Json
          property_type: string
          rightmove_id: string
          status: string
          tenure: string
          title: string
          update_reason: string
          url: string
        }[]
      }
      is_household_member: {
        Args: { p_household_id: string }
        Returns: boolean
      }
      live_feed_stats: { Args: never; Returns: Json }
      replace_listing_areas: {
        Args: { p_rightmove_id: string; p_rows: Json }
        Returns: undefined
      }
      request_rightmove_fetch: { Args: { p_days?: number }; Returns: Json }
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
