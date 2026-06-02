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
      ai_growth_action_log: {
        Row: {
          action: string
          actor: string | null
          cost_pln: number | null
          created_at: string
          id: string
          module: string
          payload: Json | null
          status: string
          summary: string | null
        }
        Insert: {
          action: string
          actor?: string | null
          cost_pln?: number | null
          created_at?: string
          id?: string
          module: string
          payload?: Json | null
          status?: string
          summary?: string | null
        }
        Update: {
          action?: string
          actor?: string | null
          cost_pln?: number | null
          created_at?: string
          id?: string
          module?: string
          payload?: Json | null
          status?: string
          summary?: string | null
        }
        Relationships: []
      }
      ai_growth_settings: {
        Row: {
          automation_mode: string
          brand_description: string | null
          brand_name: string
          daily_ai_budget_pln: number
          default_model: string
          id: string
          notes: string | null
          primary_cta_url: string | null
          target_audience: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          automation_mode?: string
          brand_description?: string | null
          brand_name?: string
          daily_ai_budget_pln?: number
          default_model?: string
          id?: string
          notes?: string | null
          primary_cta_url?: string | null
          target_audience?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          automation_mode?: string
          brand_description?: string | null
          brand_name?: string
          daily_ai_budget_pln?: number
          default_model?: string
          id?: string
          notes?: string | null
          primary_cta_url?: string | null
          target_audience?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      ai_landing_events: {
        Row: {
          created_at: string
          event_type: string
          id: string
          landing_id: string
          meta: Json | null
          source: string | null
          variant_id: string | null
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          landing_id: string
          meta?: Json | null
          source?: string | null
          variant_id?: string | null
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          landing_id?: string
          meta?: Json | null
          source?: string | null
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_landing_events_landing_id_fkey"
            columns: ["landing_id"]
            isOneToOne: false
            referencedRelation: "ai_landings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_landing_events_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "ai_landing_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_landing_variants: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          label: string
          landing_id: string
          overrides: Json
          weight: number
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          label: string
          landing_id: string
          overrides?: Json
          weight?: number
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          label?: string
          landing_id?: string
          overrides?: Json
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "ai_landing_variants_landing_id_fkey"
            columns: ["landing_id"]
            isOneToOne: false
            referencedRelation: "ai_landings"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_landings: {
        Row: {
          audience: string | null
          brief: string | null
          created_at: string
          created_by: string | null
          cta_label: string | null
          cta_url: string | null
          goal: string | null
          hero_headline: string | null
          hero_subheadline: string | null
          id: string
          keywords: string[] | null
          meta_description: string | null
          meta_title: string | null
          published_at: string | null
          raw_ai_output: Json | null
          sections: Json
          slug: string
          source: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          audience?: string | null
          brief?: string | null
          created_at?: string
          created_by?: string | null
          cta_label?: string | null
          cta_url?: string | null
          goal?: string | null
          hero_headline?: string | null
          hero_subheadline?: string | null
          id?: string
          keywords?: string[] | null
          meta_description?: string | null
          meta_title?: string | null
          published_at?: string | null
          raw_ai_output?: Json | null
          sections?: Json
          slug: string
          source?: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          audience?: string | null
          brief?: string | null
          created_at?: string
          created_by?: string | null
          cta_label?: string | null
          cta_url?: string | null
          goal?: string | null
          hero_headline?: string | null
          hero_subheadline?: string | null
          id?: string
          keywords?: string[] | null
          meta_description?: string | null
          meta_title?: string | null
          published_at?: string | null
          raw_ai_output?: Json | null
          sections?: Json
          slug?: string
          source?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      ai_outreach_messages: {
        Row: {
          angle: string | null
          body: string
          created_at: string
          created_by: string | null
          goal: string | null
          id: string
          language: string | null
          model: string | null
          parent_id: string | null
          reply_excerpt: string | null
          sent_at: string | null
          status: string
          step: number
          subject: string
          target_id: string
          updated_at: string
        }
        Insert: {
          angle?: string | null
          body: string
          created_at?: string
          created_by?: string | null
          goal?: string | null
          id?: string
          language?: string | null
          model?: string | null
          parent_id?: string | null
          reply_excerpt?: string | null
          sent_at?: string | null
          status?: string
          step?: number
          subject: string
          target_id: string
          updated_at?: string
        }
        Update: {
          angle?: string | null
          body?: string
          created_at?: string
          created_by?: string | null
          goal?: string | null
          id?: string
          language?: string | null
          model?: string | null
          parent_id?: string | null
          reply_excerpt?: string | null
          sent_at?: string | null
          status?: string
          step?: number
          subject?: string
          target_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_outreach_messages_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "ai_outreach_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_outreach_messages_target_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "ai_outreach_targets"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_outreach_targets: {
        Row: {
          contact_email: string | null
          contact_name: string | null
          created_at: string
          created_by: string | null
          domain: string
          id: string
          language: string | null
          meta: Json
          niche: string | null
          notes: string | null
          priority: number
          source: string
          status: string
          updated_at: string
          url: string | null
        }
        Insert: {
          contact_email?: string | null
          contact_name?: string | null
          created_at?: string
          created_by?: string | null
          domain: string
          id?: string
          language?: string | null
          meta?: Json
          niche?: string | null
          notes?: string | null
          priority?: number
          source?: string
          status?: string
          updated_at?: string
          url?: string | null
        }
        Update: {
          contact_email?: string | null
          contact_name?: string | null
          created_at?: string
          created_by?: string | null
          domain?: string
          id?: string
          language?: string | null
          meta?: Json
          niche?: string | null
          notes?: string | null
          priority?: number
          source?: string
          status?: string
          updated_at?: string
          url?: string | null
        }
        Relationships: []
      }
      ai_seo_articles: {
        Row: {
          content_md: string
          created_at: string
          created_by: string | null
          cta_label: string | null
          cta_url: string | null
          excerpt: string | null
          id: string
          keywords: string[] | null
          meta_description: string | null
          meta_title: string | null
          primary_keyword: string | null
          published_at: string | null
          raw_ai_output: Json | null
          reading_minutes: number | null
          scheduled_for: string | null
          slug: string
          source: string
          status: string
          title: string
          topic_id: string | null
          updated_at: string
          word_count: number | null
        }
        Insert: {
          content_md: string
          created_at?: string
          created_by?: string | null
          cta_label?: string | null
          cta_url?: string | null
          excerpt?: string | null
          id?: string
          keywords?: string[] | null
          meta_description?: string | null
          meta_title?: string | null
          primary_keyword?: string | null
          published_at?: string | null
          raw_ai_output?: Json | null
          reading_minutes?: number | null
          scheduled_for?: string | null
          slug: string
          source?: string
          status?: string
          title: string
          topic_id?: string | null
          updated_at?: string
          word_count?: number | null
        }
        Update: {
          content_md?: string
          created_at?: string
          created_by?: string | null
          cta_label?: string | null
          cta_url?: string | null
          excerpt?: string | null
          id?: string
          keywords?: string[] | null
          meta_description?: string | null
          meta_title?: string | null
          primary_keyword?: string | null
          published_at?: string | null
          raw_ai_output?: Json | null
          reading_minutes?: number | null
          scheduled_for?: string | null
          slug?: string
          source?: string
          status?: string
          title?: string
          topic_id?: string | null
          updated_at?: string
          word_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_seo_articles_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "ai_seo_topics"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_seo_topics: {
        Row: {
          article_id: string | null
          created_at: string
          created_by: string | null
          difficulty: number | null
          id: string
          notes: string | null
          primary_keyword: string | null
          priority: number
          search_intent: string | null
          secondary_keywords: string[] | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          article_id?: string | null
          created_at?: string
          created_by?: string | null
          difficulty?: number | null
          id?: string
          notes?: string | null
          primary_keyword?: string | null
          priority?: number
          search_intent?: string | null
          secondary_keywords?: string[] | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          article_id?: string | null
          created_at?: string
          created_by?: string | null
          difficulty?: number | null
          id?: string
          notes?: string | null
          primary_keyword?: string | null
          priority?: number
          search_intent?: string | null
          secondary_keywords?: string[] | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_seo_topics_article_fk"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "ai_seo_articles"
            referencedColumns: ["id"]
          },
        ]
      }
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
          conversation_id: string | null
          created_at: string
          finished_at: string | null
          id: string
          loan_application_id: string | null
          meta_lead_id: string | null
          phone_normalized: string
          raw_result: Json | null
          result_summary: string | null
          scheduled_at: string
          sms_sent_at: string | null
          source: string | null
          started_at: string | null
          status: string
          transcript: string | null
          updated_at: string
        }
        Insert: {
          agent_id?: string | null
          attempts?: number
          client_id?: string | null
          conversation_id?: string | null
          created_at?: string
          finished_at?: string | null
          id?: string
          loan_application_id?: string | null
          meta_lead_id?: string | null
          phone_normalized: string
          raw_result?: Json | null
          result_summary?: string | null
          scheduled_at?: string
          sms_sent_at?: string | null
          source?: string | null
          started_at?: string | null
          status?: string
          transcript?: string | null
          updated_at?: string
        }
        Update: {
          agent_id?: string | null
          attempts?: number
          client_id?: string | null
          conversation_id?: string | null
          created_at?: string
          finished_at?: string | null
          id?: string
          loan_application_id?: string | null
          meta_lead_id?: string | null
          phone_normalized?: string
          raw_result?: Json | null
          result_summary?: string | null
          scheduled_at?: string
          sms_sent_at?: string | null
          source?: string | null
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
      client_profiles: {
        Row: {
          borrower_type: string | null
          completion_percent: number
          created_at: string
          data: Json
          id: string
          nip: string | null
          source_application_id: string | null
          updated_at: string
        }
        Insert: {
          borrower_type?: string | null
          completion_percent?: number
          created_at?: string
          data?: Json
          id?: string
          nip?: string | null
          source_application_id?: string | null
          updated_at?: string
        }
        Update: {
          borrower_type?: string | null
          completion_percent?: number
          created_at?: string
          data?: Json
          id?: string
          nip?: string | null
          source_application_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_profiles_source_application_id_fkey"
            columns: ["source_application_id"]
            isOneToOne: false
            referencedRelation: "loan_applications"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          address: string | null
          bank_account: string | null
          city: string | null
          company_name: string | null
          consent_email: boolean
          consent_marketing: boolean
          consent_phone: boolean
          consent_rodo: boolean
          consent_sms: boolean
          country: string | null
          created_at: string
          email: string | null
          external_id: string | null
          first_name: string
          id: string
          krs: string | null
          land_register_number: string | null
          last_name: string
          nip: string | null
          notes: string | null
          pesel: string | null
          phone: string | null
          phone_normalized: string | null
          phone_raw: string | null
          phone_valid: boolean | null
          postal_code: string | null
          regon: string | null
          source: string | null
          street: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          address?: string | null
          bank_account?: string | null
          city?: string | null
          company_name?: string | null
          consent_email?: boolean
          consent_marketing?: boolean
          consent_phone?: boolean
          consent_rodo?: boolean
          consent_sms?: boolean
          country?: string | null
          created_at?: string
          email?: string | null
          external_id?: string | null
          first_name: string
          id?: string
          krs?: string | null
          land_register_number?: string | null
          last_name: string
          nip?: string | null
          notes?: string | null
          pesel?: string | null
          phone?: string | null
          phone_normalized?: string | null
          phone_raw?: string | null
          phone_valid?: boolean | null
          postal_code?: string | null
          regon?: string | null
          source?: string | null
          street?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          address?: string | null
          bank_account?: string | null
          city?: string | null
          company_name?: string | null
          consent_email?: boolean
          consent_marketing?: boolean
          consent_phone?: boolean
          consent_rodo?: boolean
          consent_sms?: boolean
          country?: string | null
          created_at?: string
          email?: string | null
          external_id?: string | null
          first_name?: string
          id?: string
          krs?: string | null
          land_register_number?: string | null
          last_name?: string
          nip?: string | null
          notes?: string | null
          pesel?: string | null
          phone?: string | null
          phone_normalized?: string | null
          phone_raw?: string | null
          phone_valid?: boolean | null
          postal_code?: string | null
          regon?: string | null
          source?: string | null
          street?: string | null
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
      document_templates: {
        Row: {
          category: string | null
          content_html: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          name: string
          output_format: string
          placeholders: Json
          updated_at: string
          use_case: string
        }
        Insert: {
          category?: string | null
          content_html?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
          output_format?: string
          placeholders?: Json
          updated_at?: string
          use_case?: string
        }
        Update: {
          category?: string | null
          content_html?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
          output_format?: string
          placeholders?: Json
          updated_at?: string
          use_case?: string
        }
        Relationships: []
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
      email_campaign_recipients: {
        Row: {
          campaign_id: string
          created_at: string
          error_message: string | null
          id: string
          recipient_email: string
          recipient_name: string | null
          sent_at: string | null
          status: string
          user_id: string | null
        }
        Insert: {
          campaign_id: string
          created_at?: string
          error_message?: string | null
          id?: string
          recipient_email: string
          recipient_name?: string | null
          sent_at?: string | null
          status?: string
          user_id?: string | null
        }
        Update: {
          campaign_id?: string
          created_at?: string
          error_message?: string | null
          id?: string
          recipient_email?: string
          recipient_name?: string | null
          sent_at?: string | null
          status?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_campaign_recipients_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "email_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      email_campaigns: {
        Row: {
          audience_filter: Json
          audience_type: string
          created_at: string
          created_by: string | null
          error_message: string | null
          failed_count: number
          finished_at: string | null
          from_email: string | null
          from_name: string | null
          html_body: string
          id: string
          name: string
          recipients_total: number
          scheduled_at: string | null
          sent_count: number
          started_at: string | null
          status: string
          subject: string
          text_body: string | null
          updated_at: string
        }
        Insert: {
          audience_filter?: Json
          audience_type?: string
          created_at?: string
          created_by?: string | null
          error_message?: string | null
          failed_count?: number
          finished_at?: string | null
          from_email?: string | null
          from_name?: string | null
          html_body?: string
          id?: string
          name: string
          recipients_total?: number
          scheduled_at?: string | null
          sent_count?: number
          started_at?: string | null
          status?: string
          subject: string
          text_body?: string | null
          updated_at?: string
        }
        Update: {
          audience_filter?: Json
          audience_type?: string
          created_at?: string
          created_by?: string | null
          error_message?: string | null
          failed_count?: number
          finished_at?: string | null
          from_email?: string | null
          from_name?: string | null
          html_body?: string
          id?: string
          name?: string
          recipients_total?: number
          scheduled_at?: string | null
          sent_count?: number
          started_at?: string | null
          status?: string
          subject?: string
          text_body?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_templates: {
        Row: {
          created_at: string
          created_by: string | null
          html_body: string
          id: string
          name: string
          subject: string
          updated_at: string
          variables: Json
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          html_body?: string
          id?: string
          name: string
          subject: string
          updated_at?: string
          variables?: Json
        }
        Update: {
          created_at?: string
          created_by?: string | null
          html_body?: string
          id?: string
          name?: string
          subject?: string
          updated_at?: string
          variables?: Json
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      external_api_logs: {
        Row: {
          created_at: string
          error_code: string | null
          id: string
          provider: string
          query_type: string
          query_value: string
          response_time_ms: number | null
          success: boolean
        }
        Insert: {
          created_at?: string
          error_code?: string | null
          id?: string
          provider: string
          query_type: string
          query_value: string
          response_time_ms?: number | null
          success: boolean
        }
        Update: {
          created_at?: string
          error_code?: string | null
          id?: string
          provider?: string
          query_type?: string
          query_value?: string
          response_time_ms?: number | null
          success?: boolean
        }
        Relationships: []
      }
      fakturowo_documents: {
        Row: {
          buyer_building: string | null
          buyer_city: string | null
          buyer_email: string | null
          buyer_name: string | null
          buyer_nip: string | null
          buyer_postal_code: string | null
          buyer_street: string | null
          client_id: string | null
          created_at: string
          created_by: string | null
          currency: string
          document_kind_code: string | null
          document_number: string | null
          document_type: string | null
          error_message: string | null
          fakturowo_api_number: string | null
          gross_amount: number | null
          html_url: string | null
          id: string
          investor_id: string | null
          is_test: boolean
          net_amount: number | null
          payment_id: string | null
          pdf_filename: string | null
          pdf_url: string | null
          product_name: string | null
          product_quantity: number
          product_unit: string
          raw_response: string | null
          related_id: string | null
          related_type: string | null
          seller_name: string | null
          seller_nip: string | null
          status: string
          updated_at: string
          vat_amount: number | null
          vat_rate: string | null
        }
        Insert: {
          buyer_building?: string | null
          buyer_city?: string | null
          buyer_email?: string | null
          buyer_name?: string | null
          buyer_nip?: string | null
          buyer_postal_code?: string | null
          buyer_street?: string | null
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          document_kind_code?: string | null
          document_number?: string | null
          document_type?: string | null
          error_message?: string | null
          fakturowo_api_number?: string | null
          gross_amount?: number | null
          html_url?: string | null
          id?: string
          investor_id?: string | null
          is_test?: boolean
          net_amount?: number | null
          payment_id?: string | null
          pdf_filename?: string | null
          pdf_url?: string | null
          product_name?: string | null
          product_quantity?: number
          product_unit?: string
          raw_response?: string | null
          related_id?: string | null
          related_type?: string | null
          seller_name?: string | null
          seller_nip?: string | null
          status?: string
          updated_at?: string
          vat_amount?: number | null
          vat_rate?: string | null
        }
        Update: {
          buyer_building?: string | null
          buyer_city?: string | null
          buyer_email?: string | null
          buyer_name?: string | null
          buyer_nip?: string | null
          buyer_postal_code?: string | null
          buyer_street?: string | null
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          document_kind_code?: string | null
          document_number?: string | null
          document_type?: string | null
          error_message?: string | null
          fakturowo_api_number?: string | null
          gross_amount?: number | null
          html_url?: string | null
          id?: string
          investor_id?: string | null
          is_test?: boolean
          net_amount?: number | null
          payment_id?: string | null
          pdf_filename?: string | null
          pdf_url?: string | null
          product_name?: string | null
          product_quantity?: number
          product_unit?: string
          raw_response?: string | null
          related_id?: string | null
          related_type?: string | null
          seller_name?: string | null
          seller_nip?: string | null
          status?: string
          updated_at?: string
          vat_amount?: number | null
          vat_rate?: string | null
        }
        Relationships: []
      }
      flood_risk_cache: {
        Row: {
          expires_at: string
          fetched_at: string
          flow_velocity: number | null
          geometry_hash: string | null
          id: string
          latitude: number | null
          longitude: number | null
          property_id: string | null
          query_bbox: string | null
          response_json: Json
          risk_level: string | null
          scenario_02_percent: boolean | null
          scenario_1_percent: boolean | null
          scenario_10_percent: boolean | null
          score: number | null
          special_flood_hazard_area: boolean | null
          water_depth: number | null
        }
        Insert: {
          expires_at?: string
          fetched_at?: string
          flow_velocity?: number | null
          geometry_hash?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          property_id?: string | null
          query_bbox?: string | null
          response_json?: Json
          risk_level?: string | null
          scenario_02_percent?: boolean | null
          scenario_1_percent?: boolean | null
          scenario_10_percent?: boolean | null
          score?: number | null
          special_flood_hazard_area?: boolean | null
          water_depth?: number | null
        }
        Update: {
          expires_at?: string
          fetched_at?: string
          flow_velocity?: number | null
          geometry_hash?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          property_id?: string | null
          query_bbox?: string | null
          response_json?: Json
          risk_level?: string | null
          scenario_02_percent?: boolean | null
          scenario_1_percent?: boolean | null
          scenario_10_percent?: boolean | null
          score?: number | null
          special_flood_hazard_area?: boolean | null
          water_depth?: number | null
        }
        Relationships: []
      }
      google_ad_drafts: {
        Row: {
          campaign_type: string
          created_at: string
          created_by: string | null
          daily_budget_pln: number
          descriptions: string[]
          display_path1: string | null
          display_path2: string | null
          external_ad_group_id: string | null
          external_ad_id: string | null
          external_campaign_id: string | null
          final_url: string | null
          headlines: string[]
          id: string
          keywords: string[]
          make_run_id: string | null
          name: string
          negative_keywords: string[]
          notes: string | null
          publish_error: string | null
          published_at: string | null
          status: string
          target_languages: string[]
          target_locations: string[]
          updated_at: string
        }
        Insert: {
          campaign_type?: string
          created_at?: string
          created_by?: string | null
          daily_budget_pln?: number
          descriptions?: string[]
          display_path1?: string | null
          display_path2?: string | null
          external_ad_group_id?: string | null
          external_ad_id?: string | null
          external_campaign_id?: string | null
          final_url?: string | null
          headlines?: string[]
          id?: string
          keywords?: string[]
          make_run_id?: string | null
          name: string
          negative_keywords?: string[]
          notes?: string | null
          publish_error?: string | null
          published_at?: string | null
          status?: string
          target_languages?: string[]
          target_locations?: string[]
          updated_at?: string
        }
        Update: {
          campaign_type?: string
          created_at?: string
          created_by?: string | null
          daily_budget_pln?: number
          descriptions?: string[]
          display_path1?: string | null
          display_path2?: string | null
          external_ad_group_id?: string | null
          external_ad_id?: string | null
          external_campaign_id?: string | null
          final_url?: string | null
          headlines?: string[]
          id?: string
          keywords?: string[]
          make_run_id?: string | null
          name?: string
          negative_keywords?: string[]
          notes?: string | null
          publish_error?: string | null
          published_at?: string | null
          status?: string
          target_languages?: string[]
          target_locations?: string[]
          updated_at?: string
        }
        Relationships: []
      }
      gus_bdl_cache: {
        Row: {
          cache_key: string
          expires_at: string
          fetched_at: string
          id: string
          payload: Json
        }
        Insert: {
          cache_key: string
          expires_at?: string
          fetched_at?: string
          id?: string
          payload: Json
        }
        Update: {
          cache_key?: string
          expires_at?: string
          fetched_at?: string
          id?: string
          payload?: Json
        }
        Relationships: []
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
          address: string | null
          bank_account: string | null
          city: string | null
          company_name: string | null
          country: string | null
          created_at: string
          email: string | null
          entity_type: string
          first_name: string | null
          id: string
          investor_type: Database["public"]["Enums"]["investor_type"]
          is_active: boolean
          krs: string | null
          last_name: string | null
          legal_form: string | null
          nip: string | null
          pesel: string | null
          phone: string | null
          postal_code: string | null
          regon: string | null
          representative_first_name: string | null
          representative_last_name: string | null
          representative_role: string | null
          street: string | null
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
          address?: string | null
          bank_account?: string | null
          city?: string | null
          company_name?: string | null
          country?: string | null
          created_at?: string
          email?: string | null
          entity_type?: string
          first_name?: string | null
          id?: string
          investor_type: Database["public"]["Enums"]["investor_type"]
          is_active?: boolean
          krs?: string | null
          last_name?: string | null
          legal_form?: string | null
          nip?: string | null
          pesel?: string | null
          phone?: string | null
          postal_code?: string | null
          regon?: string | null
          representative_first_name?: string | null
          representative_last_name?: string | null
          representative_role?: string | null
          street?: string | null
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
          address?: string | null
          bank_account?: string | null
          city?: string | null
          company_name?: string | null
          country?: string | null
          created_at?: string
          email?: string | null
          entity_type?: string
          first_name?: string | null
          id?: string
          investor_type?: Database["public"]["Enums"]["investor_type"]
          is_active?: boolean
          krs?: string | null
          last_name?: string | null
          legal_form?: string | null
          nip?: string | null
          pesel?: string | null
          phone?: string | null
          postal_code?: string | null
          regon?: string | null
          representative_first_name?: string | null
          representative_last_name?: string | null
          representative_role?: string | null
          street?: string | null
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
      krs_cache: {
        Row: {
          expires_at: string
          fetched_at: string
          id: string
          krs: string
          mapped_json: Json
          normalized_krs: string
          response_json: Json
          source: string
        }
        Insert: {
          expires_at?: string
          fetched_at?: string
          id?: string
          krs: string
          mapped_json: Json
          normalized_krs: string
          response_json: Json
          source?: string
        }
        Update: {
          expires_at?: string
          fetched_at?: string
          id?: string
          krs?: string
          mapped_json?: Json
          normalized_krs?: string
          response_json?: Json
          source?: string
        }
        Relationships: []
      }
      kw_analysis: {
        Row: {
          analysis_warning: string | null
          application_id: string | null
          created_at: string
          id: string
          investor_summary: string | null
          job_id: string | null
          kw_number: string
          legal_risk_score: number | null
          owners_json: Json | null
          property_json: Json | null
          risk_flags: Json | null
          section_i_o_json: Json | null
          section_i_sp_json: Json | null
          section_ii_json: Json | null
          section_iii_json: Json | null
          section_iv_json: Json | null
          updated_at: string
        }
        Insert: {
          analysis_warning?: string | null
          application_id?: string | null
          created_at?: string
          id?: string
          investor_summary?: string | null
          job_id?: string | null
          kw_number: string
          legal_risk_score?: number | null
          owners_json?: Json | null
          property_json?: Json | null
          risk_flags?: Json | null
          section_i_o_json?: Json | null
          section_i_sp_json?: Json | null
          section_ii_json?: Json | null
          section_iii_json?: Json | null
          section_iv_json?: Json | null
          updated_at?: string
        }
        Update: {
          analysis_warning?: string | null
          application_id?: string | null
          created_at?: string
          id?: string
          investor_summary?: string | null
          job_id?: string | null
          kw_number?: string
          legal_risk_score?: number | null
          owners_json?: Json | null
          property_json?: Json | null
          risk_flags?: Json | null
          section_i_o_json?: Json | null
          section_i_sp_json?: Json | null
          section_ii_json?: Json | null
          section_iii_json?: Json | null
          section_iv_json?: Json | null
          updated_at?: string
        }
        Relationships: []
      }
      kw_documents: {
        Row: {
          bill_in: number | null
          bill_out: number | null
          created_at: string
          dzial_1o: string | null
          dzial_1s: string | null
          dzial_2: string | null
          dzial_3: string | null
          dzial_4: string | null
          fetched_at: string | null
          id: string
          kw_number: string
          last_error: string | null
          okladka: string | null
          ordered_at: string | null
          ordered_by: string | null
          status: string
          updated_at: string
        }
        Insert: {
          bill_in?: number | null
          bill_out?: number | null
          created_at?: string
          dzial_1o?: string | null
          dzial_1s?: string | null
          dzial_2?: string | null
          dzial_3?: string | null
          dzial_4?: string | null
          fetched_at?: string | null
          id?: string
          kw_number: string
          last_error?: string | null
          okladka?: string | null
          ordered_at?: string | null
          ordered_by?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          bill_in?: number | null
          bill_out?: number | null
          created_at?: string
          dzial_1o?: string | null
          dzial_1s?: string | null
          dzial_2?: string | null
          dzial_3?: string | null
          dzial_4?: string | null
          fetched_at?: string | null
          id?: string
          kw_number?: string
          last_error?: string | null
          okladka?: string | null
          ordered_at?: string | null
          ordered_by?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      kw_fetch_attempts: {
        Row: {
          application_id: string | null
          attempt_number: number
          error_message: string | null
          failure_reason: string | null
          fetch_provider: string
          finished_at: string | null
          firecrawl_request: Json | null
          firecrawl_response: Json | null
          id: string
          job_id: string
          kw_number: string
          started_at: string
          status: string
        }
        Insert: {
          application_id?: string | null
          attempt_number: number
          error_message?: string | null
          failure_reason?: string | null
          fetch_provider?: string
          finished_at?: string | null
          firecrawl_request?: Json | null
          firecrawl_response?: Json | null
          id?: string
          job_id: string
          kw_number: string
          started_at?: string
          status: string
        }
        Update: {
          application_id?: string | null
          attempt_number?: number
          error_message?: string | null
          failure_reason?: string | null
          fetch_provider?: string
          finished_at?: string | null
          firecrawl_request?: Json | null
          firecrawl_response?: Json | null
          id?: string
          job_id?: string
          kw_number?: string
          started_at?: string
          status?: string
        }
        Relationships: []
      }
      kw_fetch_jobs: {
        Row: {
          application_id: string | null
          attempts: number
          created_at: string
          created_by: string | null
          error_message: string | null
          failure_reason: string | null
          fetch_provider: string
          fetched_at: string | null
          id: string
          kw_number: string
          last_attempt_at: string | null
          max_attempts: number
          missing_sections: Json | null
          next_attempt_at: string | null
          parsed_json: Json | null
          partial_success: boolean
          raw_html: string | null
          raw_text: string | null
          status: string
          summary_raw_html: string | null
          summary_raw_text: string | null
          updated_at: string
        }
        Insert: {
          application_id?: string | null
          attempts?: number
          created_at?: string
          created_by?: string | null
          error_message?: string | null
          failure_reason?: string | null
          fetch_provider?: string
          fetched_at?: string | null
          id?: string
          kw_number: string
          last_attempt_at?: string | null
          max_attempts?: number
          missing_sections?: Json | null
          next_attempt_at?: string | null
          parsed_json?: Json | null
          partial_success?: boolean
          raw_html?: string | null
          raw_text?: string | null
          status?: string
          summary_raw_html?: string | null
          summary_raw_text?: string | null
          updated_at?: string
        }
        Update: {
          application_id?: string | null
          attempts?: number
          created_at?: string
          created_by?: string | null
          error_message?: string | null
          failure_reason?: string | null
          fetch_provider?: string
          fetched_at?: string | null
          id?: string
          kw_number?: string
          last_attempt_at?: string | null
          max_attempts?: number
          missing_sections?: Json | null
          next_attempt_at?: string | null
          parsed_json?: Json | null
          partial_success?: boolean
          raw_html?: string | null
          raw_text?: string | null
          status?: string
          summary_raw_html?: string | null
          summary_raw_text?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      kw_section_sources: {
        Row: {
          application_id: string | null
          error_message: string | null
          fetched_at: string
          id: string
          job_id: string
          kw_number: string
          markdown: string | null
          raw_html: string | null
          raw_text: string | null
          screenshot_path: string | null
          screenshot_url: string | null
          section_key: string
          section_label: string
          success: boolean
          url: string | null
        }
        Insert: {
          application_id?: string | null
          error_message?: string | null
          fetched_at?: string
          id?: string
          job_id: string
          kw_number: string
          markdown?: string | null
          raw_html?: string | null
          raw_text?: string | null
          screenshot_path?: string | null
          screenshot_url?: string | null
          section_key: string
          section_label: string
          success?: boolean
          url?: string | null
        }
        Update: {
          application_id?: string | null
          error_message?: string | null
          fetched_at?: string
          id?: string
          job_id?: string
          kw_number?: string
          markdown?: string | null
          raw_html?: string | null
          raw_text?: string | null
          screenshot_path?: string | null
          screenshot_url?: string | null
          section_key?: string
          section_label?: string
          success?: boolean
          url?: string | null
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
          view_count: number
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
          view_count?: number
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
          view_count?: number
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
      meta_ad_accounts: {
        Row: {
          account_status: number | null
          amount_spent: number | null
          balance: number | null
          business_name: string | null
          created_at: string
          currency: string | null
          id: string
          is_active: boolean | null
          last_synced_at: string | null
          meta_account_id: string
          name: string
          updated_at: string
        }
        Insert: {
          account_status?: number | null
          amount_spent?: number | null
          balance?: number | null
          business_name?: string | null
          created_at?: string
          currency?: string | null
          id?: string
          is_active?: boolean | null
          last_synced_at?: string | null
          meta_account_id: string
          name: string
          updated_at?: string
        }
        Update: {
          account_status?: number | null
          amount_spent?: number | null
          balance?: number | null
          business_name?: string | null
          created_at?: string
          currency?: string | null
          id?: string
          is_active?: boolean | null
          last_synced_at?: string | null
          meta_account_id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      meta_ad_drafts: {
        Row: {
          ad_account_id: string | null
          created_at: string
          created_by: string | null
          creative: Json
          daily_budget: number
          end_time: string | null
          error_message: string | null
          id: string
          lead_form: Json
          meta_ad_id: string | null
          meta_adset_id: string | null
          meta_campaign_id: string | null
          meta_creative_id: string | null
          meta_form_id: string | null
          name: string
          objective: string
          page_id: string | null
          page_name: string | null
          published_at: string | null
          start_time: string | null
          status: string
          targeting: Json
          updated_at: string
        }
        Insert: {
          ad_account_id?: string | null
          created_at?: string
          created_by?: string | null
          creative?: Json
          daily_budget?: number
          end_time?: string | null
          error_message?: string | null
          id?: string
          lead_form?: Json
          meta_ad_id?: string | null
          meta_adset_id?: string | null
          meta_campaign_id?: string | null
          meta_creative_id?: string | null
          meta_form_id?: string | null
          name: string
          objective?: string
          page_id?: string | null
          page_name?: string | null
          published_at?: string | null
          start_time?: string | null
          status?: string
          targeting?: Json
          updated_at?: string
        }
        Update: {
          ad_account_id?: string | null
          created_at?: string
          created_by?: string | null
          creative?: Json
          daily_budget?: number
          end_time?: string | null
          error_message?: string | null
          id?: string
          lead_form?: Json
          meta_ad_id?: string | null
          meta_adset_id?: string | null
          meta_campaign_id?: string | null
          meta_creative_id?: string | null
          meta_form_id?: string | null
          name?: string
          objective?: string
          page_id?: string | null
          page_name?: string | null
          published_at?: string | null
          start_time?: string | null
          status?: string
          targeting?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "meta_ad_drafts_ad_account_id_fkey"
            columns: ["ad_account_id"]
            isOneToOne: false
            referencedRelation: "meta_ad_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_campaigns: {
        Row: {
          ad_account_id: string
          clicks: number | null
          cost_per_lead: number | null
          cpc: number | null
          created_at: string
          ctr: number | null
          daily_budget: number | null
          id: string
          impressions: number | null
          last_synced_at: string | null
          leads_count: number | null
          lifetime_budget: number | null
          meta_campaign_id: string
          name: string
          objective: string | null
          spend: number | null
          start_time: string | null
          status: string | null
          stop_time: string | null
          updated_at: string
        }
        Insert: {
          ad_account_id: string
          clicks?: number | null
          cost_per_lead?: number | null
          cpc?: number | null
          created_at?: string
          ctr?: number | null
          daily_budget?: number | null
          id?: string
          impressions?: number | null
          last_synced_at?: string | null
          leads_count?: number | null
          lifetime_budget?: number | null
          meta_campaign_id: string
          name: string
          objective?: string | null
          spend?: number | null
          start_time?: string | null
          status?: string | null
          stop_time?: string | null
          updated_at?: string
        }
        Update: {
          ad_account_id?: string
          clicks?: number | null
          cost_per_lead?: number | null
          cpc?: number | null
          created_at?: string
          ctr?: number | null
          daily_budget?: number | null
          id?: string
          impressions?: number | null
          last_synced_at?: string | null
          leads_count?: number | null
          lifetime_budget?: number | null
          meta_campaign_id?: string
          name?: string
          objective?: string | null
          spend?: number | null
          start_time?: string | null
          status?: string | null
          stop_time?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "meta_campaigns_ad_account_id_fkey"
            columns: ["ad_account_id"]
            isOneToOne: false
            referencedRelation: "meta_ad_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_leads: {
        Row: {
          campaign_id: string | null
          created_at: string
          email: string | null
          field_data: Json | null
          full_name: string | null
          id: string
          lead_application_id: string | null
          meta_campaign_id: string | null
          meta_form_id: string | null
          meta_lead_id: string
          phone: string | null
          received_at: string
        }
        Insert: {
          campaign_id?: string | null
          created_at?: string
          email?: string | null
          field_data?: Json | null
          full_name?: string | null
          id?: string
          lead_application_id?: string | null
          meta_campaign_id?: string | null
          meta_form_id?: string | null
          meta_lead_id: string
          phone?: string | null
          received_at?: string
        }
        Update: {
          campaign_id?: string | null
          created_at?: string
          email?: string | null
          field_data?: Json | null
          full_name?: string | null
          id?: string
          lead_application_id?: string | null
          meta_campaign_id?: string | null
          meta_form_id?: string | null
          meta_lead_id?: string
          phone?: string | null
          received_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "meta_leads_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "meta_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meta_leads_lead_application_id_fkey"
            columns: ["lead_application_id"]
            isOneToOne: false
            referencedRelation: "loan_applications"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_sync_log: {
        Row: {
          error_message: string | null
          finished_at: string | null
          id: string
          items_synced: number | null
          started_at: string
          status: string
          sync_type: string
        }
        Insert: {
          error_message?: string | null
          finished_at?: string | null
          id?: string
          items_synced?: number | null
          started_at?: string
          status: string
          sync_type: string
        }
        Update: {
          error_message?: string | null
          finished_at?: string | null
          id?: string
          items_synced?: number | null
          started_at?: string
          status?: string
          sync_type?: string
        }
        Relationships: []
      }
      nbp_real_estate_cache: {
        Row: {
          cache_key: string
          expires_at: string
          fetched_at: string
          id: string
          payload: Json
        }
        Insert: {
          cache_key: string
          expires_at?: string
          fetched_at?: string
          id?: string
          payload: Json
        }
        Update: {
          cache_key?: string
          expires_at?: string
          fetched_at?: string
          id?: string
          payload?: Json
        }
        Relationships: []
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
      property_analyses: {
        Row: {
          application_id: string
          collateral_category: string | null
          collateral_score: number | null
          created_at: string
          created_by: string | null
          error_message: string | null
          estimated_value_pln: number | null
          id: string
          ltv_percent: number | null
          main_source: string | null
          property_id: string | null
          result_json: Json | null
          sources_used: Json | null
          status: string
          updated_at: string
          warnings: Json | null
        }
        Insert: {
          application_id: string
          collateral_category?: string | null
          collateral_score?: number | null
          created_at?: string
          created_by?: string | null
          error_message?: string | null
          estimated_value_pln?: number | null
          id?: string
          ltv_percent?: number | null
          main_source?: string | null
          property_id?: string | null
          result_json?: Json | null
          sources_used?: Json | null
          status?: string
          updated_at?: string
          warnings?: Json | null
        }
        Update: {
          application_id?: string
          collateral_category?: string | null
          collateral_score?: number | null
          created_at?: string
          created_by?: string | null
          error_message?: string | null
          estimated_value_pln?: number | null
          id?: string
          ltv_percent?: number | null
          main_source?: string | null
          property_id?: string | null
          result_json?: Json | null
          sources_used?: Json | null
          status?: string
          updated_at?: string
          warnings?: Json | null
        }
        Relationships: []
      }
      property_analysis_logs: {
        Row: {
          analysis_id: string | null
          application_id: string | null
          collateral_score: number | null
          created_at: string
          document_extraction_status: string | null
          error_message: string | null
          google_maps_status: string | null
          gus_bdl_status: string | null
          id: string
          nbp_status: string | null
          property_id: string | null
          rcn_status: string | null
          sources_used: Json | null
        }
        Insert: {
          analysis_id?: string | null
          application_id?: string | null
          collateral_score?: number | null
          created_at?: string
          document_extraction_status?: string | null
          error_message?: string | null
          google_maps_status?: string | null
          gus_bdl_status?: string | null
          id?: string
          nbp_status?: string | null
          property_id?: string | null
          rcn_status?: string | null
          sources_used?: Json | null
        }
        Update: {
          analysis_id?: string | null
          application_id?: string | null
          collateral_score?: number | null
          created_at?: string
          document_extraction_status?: string | null
          error_message?: string | null
          google_maps_status?: string | null
          gus_bdl_status?: string | null
          id?: string
          nbp_status?: string | null
          property_id?: string | null
          rcn_status?: string | null
          sources_used?: Json | null
        }
        Relationships: []
      }
      property_document_extractions: {
        Row: {
          application_id: string | null
          created_at: string
          doc_kind: string | null
          document_id: string
          extracted_json: Json | null
          file_hash: string | null
          id: string
          model: string | null
          raw_text: string | null
          updated_at: string
        }
        Insert: {
          application_id?: string | null
          created_at?: string
          doc_kind?: string | null
          document_id: string
          extracted_json?: Json | null
          file_hash?: string | null
          id?: string
          model?: string | null
          raw_text?: string | null
          updated_at?: string
        }
        Update: {
          application_id?: string | null
          created_at?: string
          doc_kind?: string | null
          document_id?: string
          extracted_json?: Json | null
          file_hash?: string | null
          id?: string
          model?: string | null
          raw_text?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      property_location_analysis_cache: {
        Row: {
          analysis_json: Json
          city: string | null
          expires_at: string
          fetched_at: string
          id: string
          latitude: number | null
          longitude: number | null
          normalized_address: string
          postal_code: string | null
          property_address: string | null
          property_type: string | null
        }
        Insert: {
          analysis_json: Json
          city?: string | null
          expires_at?: string
          fetched_at?: string
          id?: string
          latitude?: number | null
          longitude?: number | null
          normalized_address: string
          postal_code?: string | null
          property_address?: string | null
          property_type?: string | null
        }
        Update: {
          analysis_json?: Json
          city?: string | null
          expires_at?: string
          fetched_at?: string
          id?: string
          latitude?: number | null
          longitude?: number | null
          normalized_address?: string
          postal_code?: string | null
          property_address?: string | null
          property_type?: string | null
        }
        Relationships: []
      }
      rcn_cache: {
        Row: {
          cache_key: string
          expires_at: string
          fetched_at: string
          id: string
          payload: Json
        }
        Insert: {
          cache_key: string
          expires_at?: string
          fetched_at?: string
          id?: string
          payload: Json
        }
        Update: {
          cache_key?: string
          expires_at?: string
          fetched_at?: string
          id?: string
          payload?: Json
        }
        Relationships: []
      }
      representation_web_enrichment_cache: {
        Row: {
          cache_key: string
          company_name: string | null
          expires_at: string
          fetched_at: string
          final_display_value: string
          full_name: string | null
          function: string | null
          id: string
          krs: string | null
          masked_person: string
          nip: string | null
          original_value: string
          raw_internal_results: Json | null
          was_auto_enriched: boolean
        }
        Insert: {
          cache_key: string
          company_name?: string | null
          expires_at?: string
          fetched_at?: string
          final_display_value: string
          full_name?: string | null
          function?: string | null
          id?: string
          krs?: string | null
          masked_person: string
          nip?: string | null
          original_value: string
          raw_internal_results?: Json | null
          was_auto_enriched?: boolean
        }
        Update: {
          cache_key?: string
          company_name?: string | null
          expires_at?: string
          fetched_at?: string
          final_display_value?: string
          full_name?: string | null
          function?: string | null
          id?: string
          krs?: string | null
          masked_person?: string
          nip?: string | null
          original_value?: string
          raw_internal_results?: Json | null
          was_auto_enriched?: boolean
        }
        Relationships: []
      }
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
        }
        Relationships: []
      }
      tracking_settings: {
        Row: {
          client_pixel_id: string | null
          id: number
          investor_pixel_id: string | null
          track_contact: boolean
          track_lead: boolean
          track_registration: boolean
          track_subscribe: boolean
          updated_at: string
        }
        Insert: {
          client_pixel_id?: string | null
          id?: number
          investor_pixel_id?: string | null
          track_contact?: boolean
          track_lead?: boolean
          track_registration?: boolean
          track_subscribe?: boolean
          updated_at?: string
        }
        Update: {
          client_pixel_id?: string | null
          id?: number
          investor_pixel_id?: string | null
          track_contact?: boolean
          track_lead?: boolean
          track_registration?: boolean
          track_subscribe?: boolean
          updated_at?: string
        }
        Relationships: []
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
      voicebot_settings: {
        Row: {
          agent_id: string | null
          agent_phone_number_id: string | null
          call_delay_seconds: number
          call_trigger: string
          id: number
          retry_count: number
          retry_delay_minutes: number
          sms_delay_seconds: number
          sms_enabled: boolean
          sms_from: string | null
          sms_template: string | null
          sms_trigger: string
          updated_at: string
        }
        Insert: {
          agent_id?: string | null
          agent_phone_number_id?: string | null
          call_delay_seconds?: number
          call_trigger?: string
          id?: number
          retry_count?: number
          retry_delay_minutes?: number
          sms_delay_seconds?: number
          sms_enabled?: boolean
          sms_from?: string | null
          sms_template?: string | null
          sms_trigger?: string
          updated_at?: string
        }
        Update: {
          agent_id?: string | null
          agent_phone_number_id?: string | null
          call_delay_seconds?: number
          call_trigger?: string
          id?: number
          retry_count?: number
          retry_delay_minutes?: number
          sms_delay_seconds?: number
          sms_enabled?: boolean
          sms_from?: string | null
          sms_template?: string | null
          sms_trigger?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      increment_loan_view: { Args: { _loan_id: string }; Returns: undefined }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
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
