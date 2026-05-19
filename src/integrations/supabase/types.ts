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
      audit_logs: {
        Row: {
          action: string
          created_at: string
          id: string
          new_value: Json | null
          object_id: string | null
          object_type: string
          previous_value: Json | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          new_value?: Json | null
          object_id?: string | null
          object_type: string
          previous_value?: Json | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          new_value?: Json | null
          object_id?: string | null
          object_type?: string
          previous_value?: Json | null
          user_id?: string | null
        }
        Relationships: []
      }
      automation_events: {
        Row: {
          automation_type: string
          created_at: string
          error_message: string | null
          id: string
          loan_application_id: string | null
          make_scenario_id: string | null
          response_payload: Json | null
          sent_payload: Json | null
          status: string | null
          webhook_url: string | null
        }
        Insert: {
          automation_type: string
          created_at?: string
          error_message?: string | null
          id?: string
          loan_application_id?: string | null
          make_scenario_id?: string | null
          response_payload?: Json | null
          sent_payload?: Json | null
          status?: string | null
          webhook_url?: string | null
        }
        Update: {
          automation_type?: string
          created_at?: string
          error_message?: string | null
          id?: string
          loan_application_id?: string | null
          make_scenario_id?: string | null
          response_payload?: Json | null
          sent_payload?: Json | null
          status?: string | null
          webhook_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "automation_events_loan_application_id_fkey"
            columns: ["loan_application_id"]
            isOneToOne: false
            referencedRelation: "loan_applications"
            referencedColumns: ["id"]
          },
        ]
      }
      call_queue: {
        Row: {
          agent_id: string | null
          attempts: number
          client_id: string | null
          created_at: string
          finished_at: string | null
          id: string
          loan_application_id: string | null
          phone_normalized: string
          raw_result: Json | null
          result_summary: string | null
          scheduled_at: string
          started_at: string | null
          status: string
          transcript: string | null
          updated_at: string
        }
        Insert: {
          agent_id?: string | null
          attempts?: number
          client_id?: string | null
          created_at?: string
          finished_at?: string | null
          id?: string
          loan_application_id?: string | null
          phone_normalized: string
          raw_result?: Json | null
          result_summary?: string | null
          scheduled_at?: string
          started_at?: string | null
          status?: string
          transcript?: string | null
          updated_at?: string
        }
        Update: {
          agent_id?: string | null
          attempts?: number
          client_id?: string | null
          created_at?: string
          finished_at?: string | null
          id?: string
          loan_application_id?: string | null
          phone_normalized?: string
          raw_result?: Json | null
          result_summary?: string | null
          scheduled_at?: string
          started_at?: string | null
          status?: string
          transcript?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "call_queue_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_queue_loan_application_id_fkey"
            columns: ["loan_application_id"]
            isOneToOne: false
            referencedRelation: "loan_applications"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_messages: {
        Row: {
          blocked: boolean
          body: string
          body_filtered: string | null
          created_at: string
          id: string
          moderation_flags: Json | null
          sender_role: string
          sender_user_id: string | null
          thread_id: string
        }
        Insert: {
          blocked?: boolean
          body: string
          body_filtered?: string | null
          created_at?: string
          id?: string
          moderation_flags?: Json | null
          sender_role: string
          sender_user_id?: string | null
          thread_id: string
        }
        Update: {
          blocked?: boolean
          body?: string
          body_filtered?: string | null
          created_at?: string
          id?: string
          moderation_flags?: Json | null
          sender_role?: string
          sender_user_id?: string | null
          thread_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "chat_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_threads: {
        Row: {
          client_id: string
          created_at: string
          id: string
          investor_id: string
          loan_application_id: string
          status: string
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          id?: string
          investor_id: string
          loan_application_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          id?: string
          investor_id?: string
          loan_application_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_threads_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_threads_investor_id_fkey"
            columns: ["investor_id"]
            isOneToOne: false
            referencedRelation: "investors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_threads_loan_application_id_fkey"
            columns: ["loan_application_id"]
            isOneToOne: false
            referencedRelation: "loan_applications"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          consent_email: boolean
          consent_marketing: boolean
          consent_phone: boolean
          consent_rodo: boolean
          consent_sms: boolean
          created_at: string
          email: string | null
          external_id: string | null
          first_name: string
          id: string
          last_name: string
          phone: string | null
          phone_normalized: string | null
          phone_raw: string | null
          phone_valid: boolean | null
          source: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          consent_email?: boolean
          consent_marketing?: boolean
          consent_phone?: boolean
          consent_rodo?: boolean
          consent_sms?: boolean
          created_at?: string
          email?: string | null
          external_id?: string | null
          first_name: string
          id?: string
          last_name: string
          phone?: string | null
          phone_normalized?: string | null
          phone_raw?: string | null
          phone_valid?: boolean | null
          source?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          consent_email?: boolean
          consent_marketing?: boolean
          consent_phone?: boolean
          consent_rodo?: boolean
          consent_sms?: boolean
          created_at?: string
          email?: string | null
          external_id?: string | null
          first_name?: string
          id?: string
          last_name?: string
          phone?: string | null
          phone_normalized?: string | null
          phone_raw?: string | null
          phone_valid?: boolean | null
          source?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      contact_events: {
        Row: {
          channel: Database["public"]["Enums"]["contact_channel"]
          client_id: string | null
          completed_at: string | null
          content: string | null
          created_at: string
          created_by: string | null
          direction: Database["public"]["Enums"]["contact_direction"]
          external_id: string | null
          id: string
          loan_application_id: string | null
          scheduled_at: string | null
          status: string | null
          subject: string | null
        }
        Insert: {
          channel: Database["public"]["Enums"]["contact_channel"]
          client_id?: string | null
          completed_at?: string | null
          content?: string | null
          created_at?: string
          created_by?: string | null
          direction?: Database["public"]["Enums"]["contact_direction"]
          external_id?: string | null
          id?: string
          loan_application_id?: string | null
          scheduled_at?: string | null
          status?: string | null
          subject?: string | null
        }
        Update: {
          channel?: Database["public"]["Enums"]["contact_channel"]
          client_id?: string | null
          completed_at?: string | null
          content?: string | null
          created_at?: string
          created_by?: string | null
          direction?: Database["public"]["Enums"]["contact_direction"]
          external_id?: string | null
          id?: string
          loan_application_id?: string | null
          scheduled_at?: string | null
          status?: string | null
          subject?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contact_events_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_events_loan_application_id_fkey"
            columns: ["loan_application_id"]
            isOneToOne: false
            referencedRelation: "loan_applications"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          created_at: string
          document_type: string
          file_name: string
          file_path: string | null
          file_url: string | null
          id: string
          loan_application_id: string | null
          property_id: string | null
          status: string | null
          updated_at: string
          uploaded_by: string | null
          visibility_level: Database["public"]["Enums"]["visibility_level"]
        }
        Insert: {
          created_at?: string
          document_type: string
          file_name: string
          file_path?: string | null
          file_url?: string | null
          id?: string
          loan_application_id?: string | null
          property_id?: string | null
          status?: string | null
          updated_at?: string
          uploaded_by?: string | null
          visibility_level?: Database["public"]["Enums"]["visibility_level"]
        }
        Update: {
          created_at?: string
          document_type?: string
          file_name?: string
          file_path?: string | null
          file_url?: string | null
          id?: string
          loan_application_id?: string | null
          property_id?: string | null
          status?: string | null
          updated_at?: string
          uploaded_by?: string | null
          visibility_level?: Database["public"]["Enums"]["visibility_level"]
        }
        Relationships: [
          {
            foreignKeyName: "documents_loan_application_id_fkey"
            columns: ["loan_application_id"]
            isOneToOne: false
            referencedRelation: "loan_applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      institutional_investor_settings: {
        Row: {
          created_at: string
          custom_variables: Json | null
          email_template: string | null
          id: string
          investor_id: string
          is_active: boolean
          max_ltv: number | null
          preferred_locations: string[] | null
          preferred_max_amount: number | null
          preferred_min_amount: number | null
          preferred_property_types:
            | Database["public"]["Enums"]["property_type"][]
            | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          custom_variables?: Json | null
          email_template?: string | null
          id?: string
          investor_id: string
          is_active?: boolean
          max_ltv?: number | null
          preferred_locations?: string[] | null
          preferred_max_amount?: number | null
          preferred_min_amount?: number | null
          preferred_property_types?:
            | Database["public"]["Enums"]["property_type"][]
            | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          custom_variables?: Json | null
          email_template?: string | null
          id?: string
          investor_id?: string
          is_active?: boolean
          max_ltv?: number | null
          preferred_locations?: string[] | null
          preferred_max_amount?: number | null
          preferred_min_amount?: number | null
          preferred_property_types?:
            | Database["public"]["Enums"]["property_type"][]
            | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "institutional_investor_settings_investor_id_fkey"
            columns: ["investor_id"]
            isOneToOne: true
            referencedRelation: "investors"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_settings: {
        Row: {
          configuration: Json | null
          created_at: string
          id: string
          integration_name: string
          is_enabled: boolean
          last_error: string | null
          last_sync_at: string | null
          status: Database["public"]["Enums"]["integration_status"]
          updated_at: string
          webhook_url: string | null
        }
        Insert: {
          configuration?: Json | null
          created_at?: string
          id?: string
          integration_name: string
          is_enabled?: boolean
          last_error?: string | null
          last_sync_at?: string | null
          status?: Database["public"]["Enums"]["integration_status"]
          updated_at?: string
          webhook_url?: string | null
        }
        Update: {
          configuration?: Json | null
          created_at?: string
          id?: string
          integration_name?: string
          is_enabled?: boolean
          last_error?: string | null
          last_sync_at?: string | null
          status?: Database["public"]["Enums"]["integration_status"]
          updated_at?: string
          webhook_url?: string | null
        }
        Relationships: []
      }
      investor_offers: {
        Row: {
          admin_note: string | null
          admin_verified_at: string | null
          balloon_amount: number | null
          client_decision_at: string | null
          collection_protection: boolean | null
          collection_protection_settlement: string | null
          commission: number | null
          counter_offer: boolean
          counter_to_offer_id: string | null
          created_at: string
          estimated_monthly_payment: number | null
          estimated_total_cost: number | null
          expected_yearly_yield: number | null
          has_balloon: boolean | null
          id: string
          investor_id: string
          investor_note: string | null
          loan_application_id: string
          offer_status: Database["public"]["Enums"]["offer_status"]
          period_months: number | null
          proposed_amount: number | null
          repayment_type: Database["public"]["Enums"]["repayment_type"] | null
          schedule: Json | null
          submitted_at: string | null
          updated_at: string
        }
        Insert: {
          admin_note?: string | null
          admin_verified_at?: string | null
          balloon_amount?: number | null
          client_decision_at?: string | null
          collection_protection?: boolean | null
          collection_protection_settlement?: string | null
          commission?: number | null
          counter_offer?: boolean
          counter_to_offer_id?: string | null
          created_at?: string
          estimated_monthly_payment?: number | null
          estimated_total_cost?: number | null
          expected_yearly_yield?: number | null
          has_balloon?: boolean | null
          id?: string
          investor_id: string
          investor_note?: string | null
          loan_application_id: string
          offer_status?: Database["public"]["Enums"]["offer_status"]
          period_months?: number | null
          proposed_amount?: number | null
          repayment_type?: Database["public"]["Enums"]["repayment_type"] | null
          schedule?: Json | null
          submitted_at?: string | null
          updated_at?: string
        }
        Update: {
          admin_note?: string | null
          admin_verified_at?: string | null
          balloon_amount?: number | null
          client_decision_at?: string | null
          collection_protection?: boolean | null
          collection_protection_settlement?: string | null
          commission?: number | null
          counter_offer?: boolean
          counter_to_offer_id?: string | null
          created_at?: string
          estimated_monthly_payment?: number | null
          estimated_total_cost?: number | null
          expected_yearly_yield?: number | null
          has_balloon?: boolean | null
          id?: string
          investor_id?: string
          investor_note?: string | null
          loan_application_id?: string
          offer_status?: Database["public"]["Enums"]["offer_status"]
          period_months?: number | null
          proposed_amount?: number | null
          repayment_type?: Database["public"]["Enums"]["repayment_type"] | null
          schedule?: Json | null
          submitted_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "investor_offers_counter_to_offer_id_fkey"
            columns: ["counter_to_offer_id"]
            isOneToOne: false
            referencedRelation: "investor_offers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "investor_offers_investor_id_fkey"
            columns: ["investor_id"]
            isOneToOne: false
            referencedRelation: "investors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "investor_offers_loan_application_id_fkey"
            columns: ["loan_application_id"]
            isOneToOne: false
            referencedRelation: "loan_applications"
            referencedColumns: ["id"]
          },
        ]
      }
      investors: {
        Row: {
          company_name: string | null
          created_at: string
          email: string | null
          first_name: string | null
          id: string
          investor_type: Database["public"]["Enums"]["investor_type"]
          is_active: boolean
          last_name: string | null
          phone: string | null
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          subscription_active_until: string | null
          subscription_plan:
            | Database["public"]["Enums"]["subscription_plan"]
            | null
          subscription_source: string | null
          subscription_status:
            | Database["public"]["Enums"]["subscription_status"]
            | null
          updated_at: string
          user_id: string | null
          web2learn_status: string | null
          web2learn_user_id: string | null
        }
        Insert: {
          company_name?: string | null
          created_at?: string
          email?: string | null
          first_name?: string | null
          id?: string
          investor_type: Database["public"]["Enums"]["investor_type"]
          is_active?: boolean
          last_name?: string | null
          phone?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_active_until?: string | null
          subscription_plan?:
            | Database["public"]["Enums"]["subscription_plan"]
            | null
          subscription_source?: string | null
          subscription_status?:
            | Database["public"]["Enums"]["subscription_status"]
            | null
          updated_at?: string
          user_id?: string | null
          web2learn_status?: string | null
          web2learn_user_id?: string | null
        }
        Update: {
          company_name?: string | null
          created_at?: string
          email?: string | null
          first_name?: string | null
          id?: string
          investor_type?: Database["public"]["Enums"]["investor_type"]
          is_active?: boolean
          last_name?: string | null
          phone?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_active_until?: string | null
          subscription_plan?:
            | Database["public"]["Enums"]["subscription_plan"]
            | null
          subscription_source?: string | null
          subscription_status?:
            | Database["public"]["Enums"]["subscription_status"]
            | null
          updated_at?: string
          user_id?: string | null
          web2learn_status?: string | null
          web2learn_user_id?: string | null
        }
        Relationships: []
      }
      loan_applications: {
        Row: {
          admin_decision: string | null
          annual_investor_rate: number | null
          assigned_operator: string | null
          automation_paused: boolean
          automation_status:
            | Database["public"]["Enums"]["automation_status"]
            | null
          available_to_investors: boolean
          business_status: string | null
          client_id: string
          completeness_percent: number
          contact_attempts_email: number
          contact_attempts_phone: number
          contact_attempts_sms: number
          created_at: string
          current_form_step: number
          decision_at: string | null
          decision_by: string | null
          decision_reason: string | null
          estimated_ltv: number | null
          external_id: string | null
          fast_decision: boolean | null
          id: string
          initial_score: number | null
          interest_score: number | null
          investor_interest_count: number
          kw_status: string | null
          last_automation_error: string | null
          last_contact_at: string | null
          last_webhook_at: string | null
          loan_amount: number | null
          location_quality: string | null
          make_scenario_id: string | null
          max_monthly_payment: number | null
          missing_fields: Json | null
          next_contact_at: string | null
          nip: string | null
          preferred_contact_channel:
            | Database["public"]["Enums"]["contact_channel"]
            | null
          preferred_period_months: number | null
          property_quality: string | null
          return_link: string | null
          return_link_token: string | null
          risk_level: string | null
          situation_description: string | null
          source: string | null
          status: Database["public"]["Enums"]["loan_status"]
          updated_at: string
          visibility_level: Database["public"]["Enums"]["visibility_level"]
          webhook_status: string | null
        }
        Insert: {
          admin_decision?: string | null
          annual_investor_rate?: number | null
          assigned_operator?: string | null
          automation_paused?: boolean
          automation_status?:
            | Database["public"]["Enums"]["automation_status"]
            | null
          available_to_investors?: boolean
          business_status?: string | null
          client_id: string
          completeness_percent?: number
          contact_attempts_email?: number
          contact_attempts_phone?: number
          contact_attempts_sms?: number
          created_at?: string
          current_form_step?: number
          decision_at?: string | null
          decision_by?: string | null
          decision_reason?: string | null
          estimated_ltv?: number | null
          external_id?: string | null
          fast_decision?: boolean | null
          id?: string
          initial_score?: number | null
          interest_score?: number | null
          investor_interest_count?: number
          kw_status?: string | null
          last_automation_error?: string | null
          last_contact_at?: string | null
          last_webhook_at?: string | null
          loan_amount?: number | null
          location_quality?: string | null
          make_scenario_id?: string | null
          max_monthly_payment?: number | null
          missing_fields?: Json | null
          next_contact_at?: string | null
          nip?: string | null
          preferred_contact_channel?:
            | Database["public"]["Enums"]["contact_channel"]
            | null
          preferred_period_months?: number | null
          property_quality?: string | null
          return_link?: string | null
          return_link_token?: string | null
          risk_level?: string | null
          situation_description?: string | null
          source?: string | null
          status?: Database["public"]["Enums"]["loan_status"]
          updated_at?: string
          visibility_level?: Database["public"]["Enums"]["visibility_level"]
          webhook_status?: string | null
        }
        Update: {
          admin_decision?: string | null
          annual_investor_rate?: number | null
          assigned_operator?: string | null
          automation_paused?: boolean
          automation_status?:
            | Database["public"]["Enums"]["automation_status"]
            | null
          available_to_investors?: boolean
          business_status?: string | null
          client_id?: string
          completeness_percent?: number
          contact_attempts_email?: number
          contact_attempts_phone?: number
          contact_attempts_sms?: number
          created_at?: string
          current_form_step?: number
          decision_at?: string | null
          decision_by?: string | null
          decision_reason?: string | null
          estimated_ltv?: number | null
          external_id?: string | null
          fast_decision?: boolean | null
          id?: string
          initial_score?: number | null
          interest_score?: number | null
          investor_interest_count?: number
          kw_status?: string | null
          last_automation_error?: string | null
          last_contact_at?: string | null
          last_webhook_at?: string | null
          loan_amount?: number | null
          location_quality?: string | null
          make_scenario_id?: string | null
          max_monthly_payment?: number | null
          missing_fields?: Json | null
          next_contact_at?: string | null
          nip?: string | null
          preferred_contact_channel?:
            | Database["public"]["Enums"]["contact_channel"]
            | null
          preferred_period_months?: number | null
          property_quality?: string | null
          return_link?: string | null
          return_link_token?: string | null
          risk_level?: string | null
          situation_description?: string | null
          source?: string | null
          status?: Database["public"]["Enums"]["loan_status"]
          updated_at?: string
          visibility_level?: Database["public"]["Enums"]["visibility_level"]
          webhook_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "loan_applications_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      offer_distributions: {
        Row: {
          additional_info_request: string | null
          created_at: string
          distribution_status: Database["public"]["Enums"]["distribution_status"]
          id: string
          investor_id: string
          loan_application_id: string
          responded_at: string | null
          response_summary: string | null
          sent_at: string | null
          updated_at: string
        }
        Insert: {
          additional_info_request?: string | null
          created_at?: string
          distribution_status?: Database["public"]["Enums"]["distribution_status"]
          id?: string
          investor_id: string
          loan_application_id: string
          responded_at?: string | null
          response_summary?: string | null
          sent_at?: string | null
          updated_at?: string
        }
        Update: {
          additional_info_request?: string | null
          created_at?: string
          distribution_status?: Database["public"]["Enums"]["distribution_status"]
          id?: string
          investor_id?: string
          loan_application_id?: string
          responded_at?: string | null
          response_summary?: string | null
          sent_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "offer_distributions_investor_id_fkey"
            columns: ["investor_id"]
            isOneToOne: false
            referencedRelation: "investors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offer_distributions_loan_application_id_fkey"
            columns: ["loan_application_id"]
            isOneToOne: false
            referencedRelation: "loan_applications"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          first_name: string | null
          id: string
          last_name: string | null
          phone: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          first_name?: string | null
          id?: string
          last_name?: string | null
          phone?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string | null
          first_name?: string | null
          id?: string
          last_name?: string | null
          phone?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      properties: {
        Row: {
          address: string | null
          area_sqm: number | null
          city: string | null
          created_at: string
          description: string | null
          estimated_value: number | null
          has_co_owners: boolean | null
          has_mortgage: boolean | null
          id: string
          land_register_number: string | null
          land_registry_extract: string | null
          loan_application_id: string
          mpzp_info: string | null
          photos: string[]
          property_type: Database["public"]["Enums"]["property_type"]
          street: string | null
          updated_at: string
          voivodeship: string | null
        }
        Insert: {
          address?: string | null
          area_sqm?: number | null
          city?: string | null
          created_at?: string
          description?: string | null
          estimated_value?: number | null
          has_co_owners?: boolean | null
          has_mortgage?: boolean | null
          id?: string
          land_register_number?: string | null
          land_registry_extract?: string | null
          loan_application_id: string
          mpzp_info?: string | null
          photos?: string[]
          property_type: Database["public"]["Enums"]["property_type"]
          street?: string | null
          updated_at?: string
          voivodeship?: string | null
        }
        Update: {
          address?: string | null
          area_sqm?: number | null
          city?: string | null
          created_at?: string
          description?: string | null
          estimated_value?: number | null
          has_co_owners?: boolean | null
          has_mortgage?: boolean | null
          id?: string
          land_register_number?: string | null
          land_registry_extract?: string | null
          loan_application_id?: string
          mpzp_info?: string | null
          photos?: string[]
          property_type?: Database["public"]["Enums"]["property_type"]
          street?: string | null
          updated_at?: string
          voivodeship?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "properties_loan_application_id_fkey"
            columns: ["loan_application_id"]
            isOneToOne: false
            referencedRelation: "loan_applications"
            referencedColumns: ["id"]
          },
        ]
      }
      training_videos: {
        Row: {
          category: string | null
          created_at: string
          created_by: string | null
          description: string | null
          duration_seconds: number | null
          external_url: string | null
          file_path: string | null
          id: string
          is_published: boolean
          sort_order: number
          thumbnail_url: string | null
          title: string
          updated_at: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          duration_seconds?: number | null
          external_url?: string | null
          file_path?: string | null
          id?: string
          is_published?: boolean
          sort_order?: number
          thumbnail_url?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          category?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          duration_seconds?: number | null
          external_url?: string | null
          file_path?: string | null
          id?: string
          is_published?: boolean
          sort_order?: number
          thumbnail_url?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "administrator" | "operator" | "klient" | "inwestor"
      automation_status: "aktywna" | "wstrzymana" | "zakonczona" | "blad"
      contact_channel:
        | "telefon"
        | "sms"
        | "email"
        | "voicebot"
        | "notatka"
        | "system"
      contact_direction: "wychodzacy" | "przychodzacy" | "wewnetrzny"
      distribution_status:
        | "szkic"
        | "gotowe_do_wysylki"
        | "wyslane"
        | "otworzone"
        | "odpowiedz_otrzymana"
        | "prosba_o_dodatkowe_informacje"
        | "oferta_otrzymana"
        | "odrzucone"
        | "brak_odpowiedzi"
        | "zamkniete"
      integration_status:
        | "niepolaczona"
        | "polaczona"
        | "blad"
        | "wymaga_konfiguracji"
        | "wylaczona"
      investor_type: "indywidualny" | "instytucjonalny"
      loan_status:
        | "nowy_lead"
        | "w_trakcie_uzupelniania"
        | "braki_w_dokumentach"
        | "do_kontaktu"
        | "w_follow_upie"
        | "wniosek_kompletny"
        | "do_analizy"
        | "rokuje"
        | "nie_rokuje"
        | "wyslany_do_inwestorow"
        | "oferta_od_inwestora"
        | "oferta_przekazana_klientowi"
        | "zaakceptowany_przez_klienta"
        | "do_umowy"
        | "zamkniety"
        | "archiwalny"
      offer_status:
        | "szkic"
        | "zlozona"
        | "w_trakcie_weryfikacji"
        | "zatwierdzona_przez_administratora"
        | "odrzucona_przez_administratora"
        | "wyslana_do_klienta"
        | "zaakceptowana_przez_klienta"
        | "odrzucona_przez_klienta"
        | "wygasla"
      property_type:
        | "mieszkanie"
        | "dom"
        | "lokal_uslugowy"
        | "dzialka_budowlana"
        | "grunt_rolny"
        | "udzial_w_nieruchomosci"
        | "inna"
      repayment_type: "miesieczna" | "balonowa" | "mieszana"
      subscription_plan: "podstawowy" | "rozszerzony" | "profesjonalny"
      subscription_status: "aktywny" | "nieaktywny" | "wstrzymany" | "probny"
      visibility_level: "zanonimizowane" | "czesciowe" | "pelne"
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
    Enums: {
      app_role: ["administrator", "operator", "klient", "inwestor"],
      automation_status: ["aktywna", "wstrzymana", "zakonczona", "blad"],
      contact_channel: [
        "telefon",
        "sms",
        "email",
        "voicebot",
        "notatka",
        "system",
      ],
      contact_direction: ["wychodzacy", "przychodzacy", "wewnetrzny"],
      distribution_status: [
        "szkic",
        "gotowe_do_wysylki",
        "wyslane",
        "otworzone",
        "odpowiedz_otrzymana",
        "prosba_o_dodatkowe_informacje",
        "oferta_otrzymana",
        "odrzucone",
        "brak_odpowiedzi",
        "zamkniete",
      ],
      integration_status: [
        "niepolaczona",
        "polaczona",
        "blad",
        "wymaga_konfiguracji",
        "wylaczona",
      ],
      investor_type: ["indywidualny", "instytucjonalny"],
      loan_status: [
        "nowy_lead",
        "w_trakcie_uzupelniania",
        "braki_w_dokumentach",
        "do_kontaktu",
        "w_follow_upie",
        "wniosek_kompletny",
        "do_analizy",
        "rokuje",
        "nie_rokuje",
        "wyslany_do_inwestorow",
        "oferta_od_inwestora",
        "oferta_przekazana_klientowi",
        "zaakceptowany_przez_klienta",
        "do_umowy",
        "zamkniety",
        "archiwalny",
      ],
      offer_status: [
        "szkic",
        "zlozona",
        "w_trakcie_weryfikacji",
        "zatwierdzona_przez_administratora",
        "odrzucona_przez_administratora",
        "wyslana_do_klienta",
        "zaakceptowana_przez_klienta",
        "odrzucona_przez_klienta",
        "wygasla",
      ],
      property_type: [
        "mieszkanie",
        "dom",
        "lokal_uslugowy",
        "dzialka_budowlana",
        "grunt_rolny",
        "udzial_w_nieruchomosci",
        "inna",
      ],
      repayment_type: ["miesieczna", "balonowa", "mieszana"],
      subscription_plan: ["podstawowy", "rozszerzony", "profesjonalny"],
      subscription_status: ["aktywny", "nieaktywny", "wstrzymany", "probny"],
      visibility_level: ["zanonimizowane", "czesciowe", "pelne"],
    },
  },
} as const
