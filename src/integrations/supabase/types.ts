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
      access_audit_logs: {
        Row: {
          action: string
          actor_role: string | null
          actor_user_id: string | null
          after: Json | null
          audience: string | null
          before: Json | null
          created_at: string
          id: string
          reason: string | null
          target_user_id: string | null
        }
        Insert: {
          action: string
          actor_role?: string | null
          actor_user_id?: string | null
          after?: Json | null
          audience?: string | null
          before?: Json | null
          created_at?: string
          id?: string
          reason?: string | null
          target_user_id?: string | null
        }
        Update: {
          action?: string
          actor_role?: string | null
          actor_user_id?: string | null
          after?: Json | null
          audience?: string | null
          before?: Json | null
          created_at?: string
          id?: string
          reason?: string | null
          target_user_id?: string | null
        }
        Relationships: []
      }
      access_entitlements: {
        Row: {
          active_from: string | null
          active_until: string | null
          audience: string
          created_at: string
          id: string
          last_payment_id: string | null
          last_product_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          active_from?: string | null
          active_until?: string | null
          audience: string
          created_at?: string
          id?: string
          last_payment_id?: string | null
          last_product_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          active_from?: string | null
          active_until?: string | null
          audience?: string
          created_at?: string
          id?: string
          last_payment_id?: string | null
          last_product_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "access_entitlements_last_payment_fk"
            columns: ["last_payment_id"]
            isOneToOne: false
            referencedRelation: "access_payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "access_entitlements_last_product_id_fkey"
            columns: ["last_product_id"]
            isOneToOne: false
            referencedRelation: "access_products"
            referencedColumns: ["id"]
          },
        ]
      }
      access_expiry_notifications: {
        Row: {
          active_until: string
          audience: string
          id: string
          kind: string
          sent_at: string
          user_id: string
        }
        Insert: {
          active_until: string
          audience: string
          id?: string
          kind: string
          sent_at?: string
          user_id: string
        }
        Update: {
          active_until?: string
          audience?: string
          id?: string
          kind?: string
          sent_at?: string
          user_id?: string
        }
        Relationships: []
      }
      access_payments: {
        Row: {
          affiliate_event_id: string | null
          audience: string
          buyer_city: string | null
          buyer_country: string
          buyer_email: string | null
          buyer_name: string | null
          buyer_nip: string | null
          buyer_postal_code: string | null
          buyer_street: string | null
          buyer_type: string
          consents: Json
          created_at: string
          currency: string
          expected_amount_grosz: number
          failure_reason: string | null
          granted_from: string | null
          granted_until: string | null
          id: string
          invoice_error: string | null
          invoice_id: string | null
          needs_review: boolean
          paid_amount_grosz: number | null
          processed_at: string | null
          product_id: string
          provider: string
          provider_transaction_id: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          affiliate_event_id?: string | null
          audience: string
          buyer_city?: string | null
          buyer_country?: string
          buyer_email?: string | null
          buyer_name?: string | null
          buyer_nip?: string | null
          buyer_postal_code?: string | null
          buyer_street?: string | null
          buyer_type: string
          consents?: Json
          created_at?: string
          currency?: string
          expected_amount_grosz: number
          failure_reason?: string | null
          granted_from?: string | null
          granted_until?: string | null
          id?: string
          invoice_error?: string | null
          invoice_id?: string | null
          needs_review?: boolean
          paid_amount_grosz?: number | null
          processed_at?: string | null
          product_id: string
          provider?: string
          provider_transaction_id?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          affiliate_event_id?: string | null
          audience?: string
          buyer_city?: string | null
          buyer_country?: string
          buyer_email?: string | null
          buyer_name?: string | null
          buyer_nip?: string | null
          buyer_postal_code?: string | null
          buyer_street?: string | null
          buyer_type?: string
          consents?: Json
          created_at?: string
          currency?: string
          expected_amount_grosz?: number
          failure_reason?: string | null
          granted_from?: string | null
          granted_until?: string | null
          id?: string
          invoice_error?: string | null
          invoice_id?: string | null
          needs_review?: boolean
          paid_amount_grosz?: number | null
          processed_at?: string | null
          product_id?: string
          provider?: string
          provider_transaction_id?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "access_payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "sales_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "access_payments_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "access_products"
            referencedColumns: ["id"]
          },
        ]
      }
      access_products: {
        Row: {
          active: boolean
          amount_grosz: number
          audience: string
          code: string
          created_at: string
          currency: string
          duration_days: number
          id: string
          label: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          amount_grosz: number
          audience: string
          code: string
          created_at?: string
          currency?: string
          duration_days: number
          id?: string
          label: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          amount_grosz?: number
          audience?: string
          code?: string
          created_at?: string
          currency?: string
          duration_days?: number
          id?: string
          label?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      access_webhook_logs: {
        Row: {
          created_at: string
          error: string | null
          id: string
          payload: Json | null
          payment_id: string | null
          provider: string
          provider_transaction_id: string | null
          result: string | null
        }
        Insert: {
          created_at?: string
          error?: string | null
          id?: string
          payload?: Json | null
          payment_id?: string | null
          provider?: string
          provider_transaction_id?: string | null
          result?: string | null
        }
        Update: {
          created_at?: string
          error?: string | null
          id?: string
          payload?: Json | null
          payment_id?: string | null
          provider?: string
          provider_transaction_id?: string | null
          result?: string | null
        }
        Relationships: []
      }
      accounting_documents: {
        Row: {
          counterparty_address: string | null
          counterparty_name: string | null
          counterparty_nip: string | null
          created_at: string
          currency: string
          direction: string
          due_date: string | null
          entity_id: string
          external_id: string | null
          gross_amount: number
          id: string
          imported_at: string
          invoice_number: string | null
          issue_date: string | null
          items: Json
          ksef_reference_number: string | null
          ksef_status: string | null
          net_amount: number
          pdf_url: string | null
          raw_payload: Json | null
          sale_date: string | null
          source: string
          updated_at: string
          vat_amount: number
          vat_rate: string | null
          xml_content: string | null
        }
        Insert: {
          counterparty_address?: string | null
          counterparty_name?: string | null
          counterparty_nip?: string | null
          created_at?: string
          currency?: string
          direction: string
          due_date?: string | null
          entity_id: string
          external_id?: string | null
          gross_amount?: number
          id?: string
          imported_at?: string
          invoice_number?: string | null
          issue_date?: string | null
          items?: Json
          ksef_reference_number?: string | null
          ksef_status?: string | null
          net_amount?: number
          pdf_url?: string | null
          raw_payload?: Json | null
          sale_date?: string | null
          source: string
          updated_at?: string
          vat_amount?: number
          vat_rate?: string | null
          xml_content?: string | null
        }
        Update: {
          counterparty_address?: string | null
          counterparty_name?: string | null
          counterparty_nip?: string | null
          created_at?: string
          currency?: string
          direction?: string
          due_date?: string | null
          entity_id?: string
          external_id?: string | null
          gross_amount?: number
          id?: string
          imported_at?: string
          invoice_number?: string | null
          issue_date?: string | null
          items?: Json
          ksef_reference_number?: string | null
          ksef_status?: string | null
          net_amount?: number
          pdf_url?: string | null
          raw_payload?: Json | null
          sale_date?: string | null
          source?: string
          updated_at?: string
          vat_amount?: number
          vat_rate?: string | null
          xml_content?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "accounting_documents_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "accounting_entities"
            referencedColumns: ["id"]
          },
        ]
      }
      accounting_entities: {
        Row: {
          active: boolean
          address_city: string | null
          address_country: string | null
          address_postal_code: string | null
          address_street: string | null
          bank_account: string | null
          created_at: string
          default_vat_rate: string
          email: string | null
          fakturowo_api_id_encrypted: string | null
          id: string
          invoice_next_number: number
          invoice_prefix: string
          is_default: boolean
          ksef_environment: string
          ksef_nip: string | null
          ksef_token_encrypted: string | null
          legal_name: string
          name: string
          nip: string | null
          phone: string | null
          provider: string
          regon: string | null
          updated_at: string
          vat_payer: boolean
        }
        Insert: {
          active?: boolean
          address_city?: string | null
          address_country?: string | null
          address_postal_code?: string | null
          address_street?: string | null
          bank_account?: string | null
          created_at?: string
          default_vat_rate?: string
          email?: string | null
          fakturowo_api_id_encrypted?: string | null
          id?: string
          invoice_next_number?: number
          invoice_prefix?: string
          is_default?: boolean
          ksef_environment?: string
          ksef_nip?: string | null
          ksef_token_encrypted?: string | null
          legal_name: string
          name: string
          nip?: string | null
          phone?: string | null
          provider?: string
          regon?: string | null
          updated_at?: string
          vat_payer?: boolean
        }
        Update: {
          active?: boolean
          address_city?: string | null
          address_country?: string | null
          address_postal_code?: string | null
          address_street?: string | null
          bank_account?: string | null
          created_at?: string
          default_vat_rate?: string
          email?: string | null
          fakturowo_api_id_encrypted?: string | null
          id?: string
          invoice_next_number?: number
          invoice_prefix?: string
          is_default?: boolean
          ksef_environment?: string
          ksef_nip?: string | null
          ksef_token_encrypted?: string | null
          legal_name?: string
          name?: string
          nip?: string | null
          phone?: string | null
          provider?: string
          regon?: string | null
          updated_at?: string
          vat_payer?: boolean
        }
        Relationships: []
      }
      accounting_sync_status: {
        Row: {
          created_at: string
          direction: string
          documents_synced: number
          entity_id: string
          id: string
          last_error: string | null
          last_run_at: string | null
          last_success_at: string | null
          source: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          direction: string
          documents_synced?: number
          entity_id: string
          id?: string
          last_error?: string | null
          last_run_at?: string | null
          last_success_at?: string | null
          source: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          direction?: string
          documents_synced?: number
          entity_id?: string
          id?: string
          last_error?: string | null
          last_run_at?: string | null
          last_success_at?: string | null
          source?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "accounting_sync_status_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "accounting_entities"
            referencedColumns: ["id"]
          },
        ]
      }
      affiliate_audit_logs: {
        Row: {
          action: string
          actor_role: string | null
          actor_user_id: string | null
          after: Json | null
          before: Json | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          reason: string | null
        }
        Insert: {
          action: string
          actor_role?: string | null
          actor_user_id?: string | null
          after?: Json | null
          before?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          reason?: string | null
        }
        Update: {
          action?: string
          actor_role?: string | null
          actor_user_id?: string | null
          after?: Json | null
          before?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          reason?: string | null
        }
        Relationships: []
      }
      affiliate_commission_events: {
        Row: {
          application_id: string | null
          cancellation_reason: string | null
          cancelled_at: string | null
          confirmed_at: string | null
          created_at: string
          currency: string
          customer_id: string | null
          direct_partner_id: string
          event_status: string
          event_type: string
          external_ref: string | null
          finance_you_fee_amount: number | null
          gross_payment_amount: number | null
          id: string
          loan_amount: number | null
          net_revenue_amount: number | null
          occurred_at: string
          paid_account_id: string | null
          payment_id: string | null
          processed_at: string | null
          product_id: string | null
          refund_window_until: string | null
          source_entity_id: string | null
          source_entity_type: string | null
          updated_at: string
        }
        Insert: {
          application_id?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          confirmed_at?: string | null
          created_at?: string
          currency?: string
          customer_id?: string | null
          direct_partner_id: string
          event_status?: string
          event_type: string
          external_ref?: string | null
          finance_you_fee_amount?: number | null
          gross_payment_amount?: number | null
          id?: string
          loan_amount?: number | null
          net_revenue_amount?: number | null
          occurred_at?: string
          paid_account_id?: string | null
          payment_id?: string | null
          processed_at?: string | null
          product_id?: string | null
          refund_window_until?: string | null
          source_entity_id?: string | null
          source_entity_type?: string | null
          updated_at?: string
        }
        Update: {
          application_id?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          confirmed_at?: string | null
          created_at?: string
          currency?: string
          customer_id?: string | null
          direct_partner_id?: string
          event_status?: string
          event_type?: string
          external_ref?: string | null
          finance_you_fee_amount?: number | null
          gross_payment_amount?: number | null
          id?: string
          loan_amount?: number | null
          net_revenue_amount?: number | null
          occurred_at?: string
          paid_account_id?: string | null
          payment_id?: string | null
          processed_at?: string | null
          product_id?: string | null
          refund_window_until?: string | null
          source_entity_id?: string | null
          source_entity_type?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "affiliate_commission_events_direct_partner_id_fkey"
            columns: ["direct_partner_id"]
            isOneToOne: false
            referencedRelation: "affiliate_partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "affiliate_commission_events_direct_partner_id_fkey"
            columns: ["direct_partner_id"]
            isOneToOne: false
            referencedRelation: "partner_operator_role_audit"
            referencedColumns: ["partner_id"]
          },
        ]
      }
      affiliate_commission_rules: {
        Row: {
          active: boolean
          basis_type: string
          created_at: string
          event_type: string
          fixed_amount: number | null
          id: string
          max_commission: number | null
          min_commission: number | null
          name: string
          network_level: number
          percent_rate: number | null
          product_id: string | null
          refund_window_days: number
          requires_admin_approval: boolean
          settlement_type_filter: string | null
          updated_at: string
          valid_from: string | null
          valid_to: string | null
        }
        Insert: {
          active?: boolean
          basis_type: string
          created_at?: string
          event_type: string
          fixed_amount?: number | null
          id?: string
          max_commission?: number | null
          min_commission?: number | null
          name: string
          network_level: number
          percent_rate?: number | null
          product_id?: string | null
          refund_window_days?: number
          requires_admin_approval?: boolean
          settlement_type_filter?: string | null
          updated_at?: string
          valid_from?: string | null
          valid_to?: string | null
        }
        Update: {
          active?: boolean
          basis_type?: string
          created_at?: string
          event_type?: string
          fixed_amount?: number | null
          id?: string
          max_commission?: number | null
          min_commission?: number | null
          name?: string
          network_level?: number
          percent_rate?: number | null
          product_id?: string | null
          refund_window_days?: number
          requires_admin_approval?: boolean
          settlement_type_filter?: string | null
          updated_at?: string
          valid_from?: string | null
          valid_to?: string | null
        }
        Relationships: []
      }
      affiliate_commissions: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          basis_amount: number
          basis_type: string
          cancellation_reason: string | null
          cancelled_at: string | null
          commission_event_id: string
          commission_rate: number | null
          created_at: string
          currency: string
          direct_partner_id: string | null
          gross_amount: number
          id: string
          invoice_id: string | null
          network_level: number
          paid_at: string | null
          partner_id: string
          payable_at: string | null
          payout_batch_id: string | null
          requires_business_registration: boolean
          requires_invoice: boolean
          requires_unregistered_activity_statement: boolean
          rule_id: string | null
          settlement_type: string
          status: string
          tax_quarter: number
          tax_year: number
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          basis_amount?: number
          basis_type: string
          cancellation_reason?: string | null
          cancelled_at?: string | null
          commission_event_id: string
          commission_rate?: number | null
          created_at?: string
          currency?: string
          direct_partner_id?: string | null
          gross_amount?: number
          id?: string
          invoice_id?: string | null
          network_level: number
          paid_at?: string | null
          partner_id: string
          payable_at?: string | null
          payout_batch_id?: string | null
          requires_business_registration?: boolean
          requires_invoice?: boolean
          requires_unregistered_activity_statement?: boolean
          rule_id?: string | null
          settlement_type: string
          status?: string
          tax_quarter: number
          tax_year: number
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          basis_amount?: number
          basis_type?: string
          cancellation_reason?: string | null
          cancelled_at?: string | null
          commission_event_id?: string
          commission_rate?: number | null
          created_at?: string
          currency?: string
          direct_partner_id?: string | null
          gross_amount?: number
          id?: string
          invoice_id?: string | null
          network_level?: number
          paid_at?: string | null
          partner_id?: string
          payable_at?: string | null
          payout_batch_id?: string | null
          requires_business_registration?: boolean
          requires_invoice?: boolean
          requires_unregistered_activity_statement?: boolean
          rule_id?: string | null
          settlement_type?: string
          status?: string
          tax_quarter?: number
          tax_year?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "affiliate_commissions_commission_event_id_fkey"
            columns: ["commission_event_id"]
            isOneToOne: false
            referencedRelation: "affiliate_commission_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "affiliate_commissions_direct_partner_id_fkey"
            columns: ["direct_partner_id"]
            isOneToOne: false
            referencedRelation: "affiliate_partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "affiliate_commissions_direct_partner_id_fkey"
            columns: ["direct_partner_id"]
            isOneToOne: false
            referencedRelation: "partner_operator_role_audit"
            referencedColumns: ["partner_id"]
          },
          {
            foreignKeyName: "affiliate_commissions_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "affiliate_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "affiliate_commissions_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "affiliate_partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "affiliate_commissions_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partner_operator_role_audit"
            referencedColumns: ["partner_id"]
          },
          {
            foreignKeyName: "affiliate_commissions_payout_batch_id_fkey"
            columns: ["payout_batch_id"]
            isOneToOne: false
            referencedRelation: "affiliate_payout_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "affiliate_commissions_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "affiliate_commission_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      affiliate_invoices: {
        Row: {
          created_at: string
          currency: string
          file_url: string | null
          gross_amount: number
          id: string
          invoice_number: string | null
          issue_date: string | null
          net_amount: number
          partner_id: string
          status: string
          vat_amount: number | null
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          created_at?: string
          currency?: string
          file_url?: string | null
          gross_amount?: number
          id?: string
          invoice_number?: string | null
          issue_date?: string | null
          net_amount?: number
          partner_id: string
          status?: string
          vat_amount?: number | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          created_at?: string
          currency?: string
          file_url?: string | null
          gross_amount?: number
          id?: string
          invoice_number?: string | null
          issue_date?: string | null
          net_amount?: number
          partner_id?: string
          status?: string
          vat_amount?: number | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "affiliate_invoices_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "affiliate_partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "affiliate_invoices_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partner_operator_role_audit"
            referencedColumns: ["partner_id"]
          },
        ]
      }
      affiliate_network_closure: {
        Row: {
          ancestor_partner_id: string
          created_at: string
          depth: number
          descendant_partner_id: string
        }
        Insert: {
          ancestor_partner_id: string
          created_at?: string
          depth: number
          descendant_partner_id: string
        }
        Update: {
          ancestor_partner_id?: string
          created_at?: string
          depth?: number
          descendant_partner_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "affiliate_network_closure_ancestor_partner_id_fkey"
            columns: ["ancestor_partner_id"]
            isOneToOne: false
            referencedRelation: "affiliate_partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "affiliate_network_closure_ancestor_partner_id_fkey"
            columns: ["ancestor_partner_id"]
            isOneToOne: false
            referencedRelation: "partner_operator_role_audit"
            referencedColumns: ["partner_id"]
          },
          {
            foreignKeyName: "affiliate_network_closure_descendant_partner_id_fkey"
            columns: ["descendant_partner_id"]
            isOneToOne: false
            referencedRelation: "affiliate_partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "affiliate_network_closure_descendant_partner_id_fkey"
            columns: ["descendant_partner_id"]
            isOneToOne: false
            referencedRelation: "partner_operator_role_audit"
            referencedColumns: ["partner_id"]
          },
        ]
      }
      affiliate_partners: {
        Row: {
          address_city: string | null
          address_country: string | null
          address_postal_code: string | null
          address_street: string | null
          approved_at: string | null
          approved_by: string | null
          bank_account_encrypted: string | null
          billing_email: string | null
          company_name: string | null
          created_at: string
          email: string | null
          first_name: string | null
          id: string
          last_name: string | null
          nip: string | null
          pesel_encrypted: string | null
          phone: string | null
          referral_code: string | null
          referral_slug: string | null
          regon: string | null
          settlement_type: string
          source_description: string | null
          sponsor_partner_id: string | null
          status: string
          tax_office: string | null
          terms_accepted_at: string | null
          terms_version: string | null
          updated_at: string
          user_id: string | null
          vat_payer: boolean | null
          website_url: string | null
        }
        Insert: {
          address_city?: string | null
          address_country?: string | null
          address_postal_code?: string | null
          address_street?: string | null
          approved_at?: string | null
          approved_by?: string | null
          bank_account_encrypted?: string | null
          billing_email?: string | null
          company_name?: string | null
          created_at?: string
          email?: string | null
          first_name?: string | null
          id?: string
          last_name?: string | null
          nip?: string | null
          pesel_encrypted?: string | null
          phone?: string | null
          referral_code?: string | null
          referral_slug?: string | null
          regon?: string | null
          settlement_type: string
          source_description?: string | null
          sponsor_partner_id?: string | null
          status?: string
          tax_office?: string | null
          terms_accepted_at?: string | null
          terms_version?: string | null
          updated_at?: string
          user_id?: string | null
          vat_payer?: boolean | null
          website_url?: string | null
        }
        Update: {
          address_city?: string | null
          address_country?: string | null
          address_postal_code?: string | null
          address_street?: string | null
          approved_at?: string | null
          approved_by?: string | null
          bank_account_encrypted?: string | null
          billing_email?: string | null
          company_name?: string | null
          created_at?: string
          email?: string | null
          first_name?: string | null
          id?: string
          last_name?: string | null
          nip?: string | null
          pesel_encrypted?: string | null
          phone?: string | null
          referral_code?: string | null
          referral_slug?: string | null
          regon?: string | null
          settlement_type?: string
          source_description?: string | null
          sponsor_partner_id?: string | null
          status?: string
          tax_office?: string | null
          terms_accepted_at?: string | null
          terms_version?: string | null
          updated_at?: string
          user_id?: string | null
          vat_payer?: boolean | null
          website_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "affiliate_partners_sponsor_partner_id_fkey"
            columns: ["sponsor_partner_id"]
            isOneToOne: false
            referencedRelation: "affiliate_partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "affiliate_partners_sponsor_partner_id_fkey"
            columns: ["sponsor_partner_id"]
            isOneToOne: false
            referencedRelation: "partner_operator_role_audit"
            referencedColumns: ["partner_id"]
          },
        ]
      }
      affiliate_payout_batches: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          created_by: string | null
          currency: string
          id: string
          name: string
          paid_at: string | null
          paid_by: string | null
          payout_count: number
          status: string
          total_amount: number
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          id?: string
          name: string
          paid_at?: string | null
          paid_by?: string | null
          payout_count?: number
          status?: string
          total_amount?: number
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          id?: string
          name?: string
          paid_at?: string | null
          paid_by?: string | null
          payout_count?: number
          status?: string
          total_amount?: number
        }
        Relationships: []
      }
      affiliate_payout_items: {
        Row: {
          amount: number
          bank_account_snapshot_encrypted: string | null
          commission_id: string
          created_at: string
          id: string
          paid_at: string | null
          partner_id: string
          payout_batch_id: string
          status: string
          transfer_title: string | null
        }
        Insert: {
          amount?: number
          bank_account_snapshot_encrypted?: string | null
          commission_id: string
          created_at?: string
          id?: string
          paid_at?: string | null
          partner_id: string
          payout_batch_id: string
          status?: string
          transfer_title?: string | null
        }
        Update: {
          amount?: number
          bank_account_snapshot_encrypted?: string | null
          commission_id?: string
          created_at?: string
          id?: string
          paid_at?: string | null
          partner_id?: string
          payout_batch_id?: string
          status?: string
          transfer_title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "affiliate_payout_items_commission_id_fkey"
            columns: ["commission_id"]
            isOneToOne: false
            referencedRelation: "affiliate_commissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "affiliate_payout_items_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "affiliate_partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "affiliate_payout_items_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partner_operator_role_audit"
            referencedColumns: ["partner_id"]
          },
          {
            foreignKeyName: "affiliate_payout_items_payout_batch_id_fkey"
            columns: ["payout_batch_id"]
            isOneToOne: false
            referencedRelation: "affiliate_payout_batches"
            referencedColumns: ["id"]
          },
        ]
      }
      affiliate_unregistered_activity_limits: {
        Row: {
          active: boolean
          created_at: string
          currency: string
          id: string
          limit_amount: number
          quarter: number
          source_note: string | null
          updated_at: string
          year: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          currency?: string
          id?: string
          limit_amount: number
          quarter: number
          source_note?: string | null
          updated_at?: string
          year: number
        }
        Update: {
          active?: boolean
          created_at?: string
          currency?: string
          id?: string
          limit_amount?: number
          quarter?: number
          source_note?: string | null
          updated_at?: string
          year?: number
        }
        Relationships: []
      }
      ai_admin_audit_log: {
        Row: {
          conversation_id: string | null
          created_at: string
          error: string | null
          id: string
          success: boolean
          tool_input: Json | null
          tool_name: string
          tool_output: Json | null
          user_id: string
        }
        Insert: {
          conversation_id?: string | null
          created_at?: string
          error?: string | null
          id?: string
          success?: boolean
          tool_input?: Json | null
          tool_name: string
          tool_output?: Json | null
          user_id: string
        }
        Update: {
          conversation_id?: string | null
          created_at?: string
          error?: string | null
          id?: string
          success?: boolean
          tool_input?: Json | null
          tool_name?: string
          tool_output?: Json | null
          user_id?: string
        }
        Relationships: []
      }
      ai_admin_conversations: {
        Row: {
          created_at: string
          id: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      ai_admin_messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          id: string
          role: string
          tokens_in: number | null
          tokens_out: number | null
          tool_calls: Json | null
          tool_results: Json | null
        }
        Insert: {
          content?: string
          conversation_id: string
          created_at?: string
          id?: string
          role: string
          tokens_in?: number | null
          tokens_out?: number | null
          tool_calls?: Json | null
          tool_results?: Json | null
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          role?: string
          tokens_in?: number | null
          tokens_out?: number | null
          tool_calls?: Json | null
          tool_results?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_admin_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "ai_admin_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_admin_settings: {
        Row: {
          enable_db_read: boolean
          enable_db_write: boolean
          enable_file_read: boolean
          enable_file_write: boolean
          id: string
          max_tokens: number
          model: string
          singleton: boolean
          system_prompt: string
          temperature: number
          updated_at: string
        }
        Insert: {
          enable_db_read?: boolean
          enable_db_write?: boolean
          enable_file_read?: boolean
          enable_file_write?: boolean
          id?: string
          max_tokens?: number
          model?: string
          singleton?: boolean
          system_prompt?: string
          temperature?: number
          updated_at?: string
        }
        Update: {
          enable_db_read?: boolean
          enable_db_write?: boolean
          enable_file_read?: boolean
          enable_file_write?: boolean
          id?: string
          max_tokens?: number
          model?: string
          singleton?: boolean
          system_prompt?: string
          temperature?: number
          updated_at?: string
        }
        Relationships: []
      }
      ai_backlinks: {
        Row: {
          anchor_text: string | null
          created_at: string
          created_by: string | null
          dofollow: boolean
          domain_authority: number | null
          first_seen_at: string
          id: string
          last_checked_at: string | null
          link_type: string
          notes: string | null
          outreach_target_id: string | null
          source_domain: string
          source_url: string
          status: string
          target_url: string
          updated_at: string
        }
        Insert: {
          anchor_text?: string | null
          created_at?: string
          created_by?: string | null
          dofollow?: boolean
          domain_authority?: number | null
          first_seen_at?: string
          id?: string
          last_checked_at?: string | null
          link_type?: string
          notes?: string | null
          outreach_target_id?: string | null
          source_domain: string
          source_url: string
          status?: string
          target_url: string
          updated_at?: string
        }
        Update: {
          anchor_text?: string | null
          created_at?: string
          created_by?: string | null
          dofollow?: boolean
          domain_authority?: number | null
          first_seen_at?: string
          id?: string
          last_checked_at?: string | null
          link_type?: string
          notes?: string | null
          outreach_target_id?: string | null
          source_domain?: string
          source_url?: string
          status?: string
          target_url?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_backlinks_outreach_target_id_fkey"
            columns: ["outreach_target_id"]
            isOneToOne: false
            referencedRelation: "ai_outreach_targets"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_competitor_snapshots: {
        Row: {
          ai_analysis: Json | null
          change_summary: string | null
          changed: boolean
          checked_at: string
          competitor_id: string
          content: string | null
          content_hash: string
          created_at: string
          description: string | null
          id: string
          title: string | null
          url: string
          user_id: string
        }
        Insert: {
          ai_analysis?: Json | null
          change_summary?: string | null
          changed?: boolean
          checked_at?: string
          competitor_id: string
          content?: string | null
          content_hash: string
          created_at?: string
          description?: string | null
          id?: string
          title?: string | null
          url: string
          user_id: string
        }
        Update: {
          ai_analysis?: Json | null
          change_summary?: string | null
          changed?: boolean
          checked_at?: string
          competitor_id?: string
          content?: string | null
          content_hash?: string
          created_at?: string
          description?: string | null
          id?: string
          title?: string | null
          url?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_competitor_snapshots_competitor_id_fkey"
            columns: ["competitor_id"]
            isOneToOne: false
            referencedRelation: "ai_competitors"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_competitors: {
        Row: {
          created_at: string
          domain: string
          id: string
          is_active: boolean
          last_checked_at: string | null
          name: string
          notes: string | null
          tags: string[] | null
          updated_at: string
          urls: string[]
          user_id: string
        }
        Insert: {
          created_at?: string
          domain: string
          id?: string
          is_active?: boolean
          last_checked_at?: string | null
          name: string
          notes?: string | null
          tags?: string[] | null
          updated_at?: string
          urls?: string[]
          user_id: string
        }
        Update: {
          created_at?: string
          domain?: string
          id?: string
          is_active?: boolean
          last_checked_at?: string | null
          name?: string
          notes?: string | null
          tags?: string[] | null
          updated_at?: string
          urls?: string[]
          user_id?: string
        }
        Relationships: []
      }
      ai_funnel_events: {
        Row: {
          campaign: string | null
          country: string | null
          created_at: string
          device: string | null
          event_type: string
          id: string
          landing_id: string | null
          medium: string | null
          metadata: Json | null
          referrer: string | null
          session_id: string
          source: string | null
          step: string
          step_order: number
          user_agent: string | null
          value: number | null
        }
        Insert: {
          campaign?: string | null
          country?: string | null
          created_at?: string
          device?: string | null
          event_type?: string
          id?: string
          landing_id?: string | null
          medium?: string | null
          metadata?: Json | null
          referrer?: string | null
          session_id: string
          source?: string | null
          step: string
          step_order?: number
          user_agent?: string | null
          value?: number | null
        }
        Update: {
          campaign?: string | null
          country?: string | null
          created_at?: string
          device?: string | null
          event_type?: string
          id?: string
          landing_id?: string | null
          medium?: string | null
          metadata?: Json | null
          referrer?: string | null
          session_id?: string
          source?: string | null
          step?: string
          step_order?: number
          user_agent?: string | null
          value?: number | null
        }
        Relationships: []
      }
      ai_funnel_insights: {
        Row: {
          bottlenecks: Json | null
          created_at: string
          id: string
          landing_id: string | null
          metrics: Json | null
          period_from: string
          period_to: string
          recommendations: Json | null
          summary: string
          user_id: string
        }
        Insert: {
          bottlenecks?: Json | null
          created_at?: string
          id?: string
          landing_id?: string | null
          metrics?: Json | null
          period_from: string
          period_to: string
          recommendations?: Json | null
          summary: string
          user_id: string
        }
        Update: {
          bottlenecks?: Json | null
          created_at?: string
          id?: string
          landing_id?: string | null
          metrics?: Json | null
          period_from?: string
          period_to?: string
          recommendations?: Json | null
          summary?: string
          user_id?: string
        }
        Relationships: []
      }
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
      ai_landing_optimizations: {
        Row: {
          applied_variant_id: string | null
          created_at: string
          created_by: string | null
          error_message: string | null
          expected_lift_pct: number | null
          id: string
          kind: string
          landing_id: string
          payload: Json
          rationale: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          applied_variant_id?: string | null
          created_at?: string
          created_by?: string | null
          error_message?: string | null
          expected_lift_pct?: number | null
          id?: string
          kind: string
          landing_id: string
          payload?: Json
          rationale?: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          applied_variant_id?: string | null
          created_at?: string
          created_by?: string | null
          error_message?: string | null
          expected_lift_pct?: number | null
          id?: string
          kind?: string
          landing_id?: string
          payload?: Json
          rationale?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_landing_optimizations_applied_variant_id_fkey"
            columns: ["applied_variant_id"]
            isOneToOne: false
            referencedRelation: "ai_landing_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_landing_optimizations_landing_id_fkey"
            columns: ["landing_id"]
            isOneToOne: false
            referencedRelation: "ai_landings"
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
      ai_linkbuilding_suggestions: {
        Row: {
          contact_hint: string | null
          created_at: string
          created_by: string | null
          expected_da: number | null
          id: string
          priority: number
          rationale: string
          status: string
          strategy: string
          target_domain: string
          updated_at: string
        }
        Insert: {
          contact_hint?: string | null
          created_at?: string
          created_by?: string | null
          expected_da?: number | null
          id?: string
          priority?: number
          rationale?: string
          status?: string
          strategy: string
          target_domain: string
          updated_at?: string
        }
        Update: {
          contact_hint?: string | null
          created_at?: string
          created_by?: string | null
          expected_da?: number | null
          id?: string
          priority?: number
          rationale?: string
          status?: string
          strategy?: string
          target_domain?: string
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
          audience: string
          content_md: string
          content_refreshed_at: string | null
          cover_image_alt: string | null
          cover_image_url: string | null
          created_at: string
          created_by: string | null
          cta_label: string | null
          cta_url: string | null
          excerpt: string | null
          external_links: Json | null
          id: string
          internal_link_slugs: string[] | null
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
          audience?: string
          content_md: string
          content_refreshed_at?: string | null
          cover_image_alt?: string | null
          cover_image_url?: string | null
          created_at?: string
          created_by?: string | null
          cta_label?: string | null
          cta_url?: string | null
          excerpt?: string | null
          external_links?: Json | null
          id?: string
          internal_link_slugs?: string[] | null
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
          audience?: string
          content_md?: string
          content_refreshed_at?: string | null
          cover_image_alt?: string | null
          cover_image_url?: string | null
          created_at?: string
          created_by?: string | null
          cta_label?: string | null
          cta_url?: string | null
          excerpt?: string | null
          external_links?: Json | null
          id?: string
          internal_link_slugs?: string[] | null
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
      ai_serp_keywords: {
        Row: {
          created_at: string
          difficulty: number | null
          id: string
          intent: string | null
          is_active: boolean
          keyword: string
          language: string
          location: string
          search_volume: number | null
          tags: string[] | null
          target_url: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          difficulty?: number | null
          id?: string
          intent?: string | null
          is_active?: boolean
          keyword: string
          language?: string
          location?: string
          search_volume?: number | null
          tags?: string[] | null
          target_url?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          difficulty?: number | null
          id?: string
          intent?: string | null
          is_active?: boolean
          keyword?: string
          language?: string
          location?: string
          search_volume?: number | null
          tags?: string[] | null
          target_url?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      ai_serp_rankings: {
        Row: {
          checked_at: string
          created_at: string
          id: string
          keyword_id: string
          position: number | null
          previous_position: number | null
          serp_features: string[] | null
          url: string | null
          user_id: string
        }
        Insert: {
          checked_at?: string
          created_at?: string
          id?: string
          keyword_id: string
          position?: number | null
          previous_position?: number | null
          serp_features?: string[] | null
          url?: string | null
          user_id: string
        }
        Update: {
          checked_at?: string
          created_at?: string
          id?: string
          keyword_id?: string
          position?: number | null
          previous_position?: number | null
          serp_features?: string[] | null
          url?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_serp_rankings_keyword_id_fkey"
            columns: ["keyword_id"]
            isOneToOne: false
            referencedRelation: "ai_serp_keywords"
            referencedColumns: ["id"]
          },
        ]
      }
      aml_attachments: {
        Row: {
          case_id: string | null
          content_type: string | null
          created_at: string
          file_name: string
          id: string
          report_id: string | null
          sha256: string | null
          size_bytes: number | null
          storage_path: string
          user_id: string
        }
        Insert: {
          case_id?: string | null
          content_type?: string | null
          created_at?: string
          file_name: string
          id?: string
          report_id?: string | null
          sha256?: string | null
          size_bytes?: number | null
          storage_path: string
          user_id: string
        }
        Update: {
          case_id?: string | null
          content_type?: string | null
          created_at?: string
          file_name?: string
          id?: string
          report_id?: string | null
          sha256?: string | null
          size_bytes?: number | null
          storage_path?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "aml_attachments_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "aml_cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aml_attachments_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "aml_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      aml_audit_log: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          details: Json
          entity_id: string | null
          entity_type: string
          id: number
          user_id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          details?: Json
          entity_id?: string | null
          entity_type: string
          id?: never
          user_id: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          details?: Json
          entity_id?: string | null
          entity_type?: string
          id?: never
          user_id?: string
        }
        Relationships: []
      }
      aml_case_transactions: {
        Row: {
          case_id: string
          transaction_id: string
          user_id: string
        }
        Insert: {
          case_id: string
          transaction_id: string
          user_id: string
        }
        Update: {
          case_id?: string
          transaction_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "aml_case_transactions_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "aml_cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aml_case_transactions_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "aml_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      aml_cases: {
        Row: {
          accounts: Json
          amounts: Json
          case_no: string
          chronology: Json
          contract_ref: string | null
          created_at: string
          customer_id: string | null
          decisions: Json
          description: string | null
          id: string
          justification: string | null
          origin: string
          parties: Json
          risk_assessment_id: string | null
          screening_id: string | null
          status: Database["public"]["Enums"]["aml_case_status"]
          threshold_entry_id: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          accounts?: Json
          amounts?: Json
          case_no: string
          chronology?: Json
          contract_ref?: string | null
          created_at?: string
          customer_id?: string | null
          decisions?: Json
          description?: string | null
          id?: string
          justification?: string | null
          origin?: string
          parties?: Json
          risk_assessment_id?: string | null
          screening_id?: string | null
          status?: Database["public"]["Enums"]["aml_case_status"]
          threshold_entry_id?: string | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          accounts?: Json
          amounts?: Json
          case_no?: string
          chronology?: Json
          contract_ref?: string | null
          created_at?: string
          customer_id?: string | null
          decisions?: Json
          description?: string | null
          id?: string
          justification?: string | null
          origin?: string
          parties?: Json
          risk_assessment_id?: string | null
          screening_id?: string | null
          status?: Database["public"]["Enums"]["aml_case_status"]
          threshold_entry_id?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "aml_cases_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "aml_customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aml_cases_risk_assessment_id_fkey"
            columns: ["risk_assessment_id"]
            isOneToOne: false
            referencedRelation: "aml_risk_assessments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aml_cases_screening_id_fkey"
            columns: ["screening_id"]
            isOneToOne: false
            referencedRelation: "aml_screenings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aml_cases_threshold_entry_id_fkey"
            columns: ["threshold_entry_id"]
            isOneToOne: false
            referencedRelation: "aml_threshold_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      aml_certificates: {
        Row: {
          certificate_pem: string | null
          created_at: string
          csr_pem: string
          environment: string
          id: string
          kms_key_ref: string
          matches_csr: boolean | null
          mtls_tested_at: string | null
          serial_number: string | null
          status: string
          subject_dn: string | null
          updated_at: string
          user_id: string
          valid_from: string | null
          valid_to: string | null
        }
        Insert: {
          certificate_pem?: string | null
          created_at?: string
          csr_pem: string
          environment?: string
          id?: string
          kms_key_ref: string
          matches_csr?: boolean | null
          mtls_tested_at?: string | null
          serial_number?: string | null
          status?: string
          subject_dn?: string | null
          updated_at?: string
          user_id: string
          valid_from?: string | null
          valid_to?: string | null
        }
        Update: {
          certificate_pem?: string | null
          created_at?: string
          csr_pem?: string
          environment?: string
          id?: string
          kms_key_ref?: string
          matches_csr?: boolean | null
          mtls_tested_at?: string | null
          serial_number?: string | null
          status?: string
          subject_dn?: string | null
          updated_at?: string
          user_id?: string
          valid_from?: string | null
          valid_to?: string | null
        }
        Relationships: []
      }
      aml_customers: {
        Row: {
          address: string | null
          beneficial_owners: Json
          citizenship: string | null
          client_id: string | null
          company_name: string | null
          country_activity: string
          country_residence: string
          crbr_data: Json | null
          crbr_discrepancies: Json
          crbr_fetched_at: string | null
          created_at: string
          dob: string | null
          document_number: string | null
          document_type: string | null
          entity_type: string
          financing_purpose: string | null
          first_name: string | null
          id: string
          krs: string | null
          last_name: string | null
          loan_application_id: string | null
          nip: string | null
          pep_status: boolean | null
          pesel: string | null
          regon: string | null
          repayment_source: string | null
          representatives: Json
          risk_assessed_at: string | null
          risk_level: Database["public"]["Enums"]["aml_risk_level"] | null
          sanction_hit: boolean | null
          screening_fingerprint: string | null
          screening_status: Database["public"]["Enums"]["aml_screening_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          address?: string | null
          beneficial_owners?: Json
          citizenship?: string | null
          client_id?: string | null
          company_name?: string | null
          country_activity?: string
          country_residence?: string
          crbr_data?: Json | null
          crbr_discrepancies?: Json
          crbr_fetched_at?: string | null
          created_at?: string
          dob?: string | null
          document_number?: string | null
          document_type?: string | null
          entity_type?: string
          financing_purpose?: string | null
          first_name?: string | null
          id?: string
          krs?: string | null
          last_name?: string | null
          loan_application_id?: string | null
          nip?: string | null
          pep_status?: boolean | null
          pesel?: string | null
          regon?: string | null
          repayment_source?: string | null
          representatives?: Json
          risk_assessed_at?: string | null
          risk_level?: Database["public"]["Enums"]["aml_risk_level"] | null
          sanction_hit?: boolean | null
          screening_fingerprint?: string | null
          screening_status?: Database["public"]["Enums"]["aml_screening_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          address?: string | null
          beneficial_owners?: Json
          citizenship?: string | null
          client_id?: string | null
          company_name?: string | null
          country_activity?: string
          country_residence?: string
          crbr_data?: Json | null
          crbr_discrepancies?: Json
          crbr_fetched_at?: string | null
          created_at?: string
          dob?: string | null
          document_number?: string | null
          document_type?: string | null
          entity_type?: string
          financing_purpose?: string | null
          first_name?: string | null
          id?: string
          krs?: string | null
          last_name?: string | null
          loan_application_id?: string | null
          nip?: string | null
          pep_status?: boolean | null
          pesel?: string | null
          regon?: string | null
          repayment_source?: string | null
          representatives?: Json
          risk_assessed_at?: string | null
          risk_level?: Database["public"]["Enums"]["aml_risk_level"] | null
          sanction_hit?: boolean | null
          screening_fingerprint?: string | null
          screening_status?: Database["public"]["Enums"]["aml_screening_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      aml_report_versions: {
        Row: {
          created_at: string
          created_by: string
          id: string
          payload: Json
          pdf_sha256: string | null
          pdf_storage_path: string | null
          report_id: string
          user_id: string
          version: number
          xml_sha256: string | null
          xml_storage_path: string | null
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          payload: Json
          pdf_sha256?: string | null
          pdf_storage_path?: string | null
          report_id: string
          user_id: string
          version: number
          xml_sha256?: string | null
          xml_storage_path?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          payload?: Json
          pdf_sha256?: string | null
          pdf_storage_path?: string | null
          report_id?: string
          user_id?: string
          version?: number
          xml_sha256?: string | null
          xml_storage_path?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "aml_report_versions_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "aml_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      aml_reports: {
        Row: {
          case_id: string | null
          completeness: Json
          content_approved_at: string | null
          content_approved_by: string | null
          created_at: string
          current_version: number
          encryption_cert_fingerprint: string | null
          giif_response: Json | null
          giif_status: string | null
          giif_status_checked_at: string | null
          giif_submission_id: string | null
          id: string
          payload: Json
          pdf_sha256: string | null
          pdf_storage_path: string | null
          report_type: Database["public"]["Enums"]["aml_report_type"]
          signature_verified_at: string | null
          signed_sha256: string | null
          signed_storage_path: string | null
          signer_subject: string | null
          status: Database["public"]["Enums"]["aml_report_status"]
          submitted_at: string | null
          threshold_entry_id: string | null
          updated_at: string
          upo_received_at: string | null
          upo_storage_path: string | null
          user_id: string
          xml_sha256: string | null
          xml_storage_path: string | null
        }
        Insert: {
          case_id?: string | null
          completeness?: Json
          content_approved_at?: string | null
          content_approved_by?: string | null
          created_at?: string
          current_version?: number
          encryption_cert_fingerprint?: string | null
          giif_response?: Json | null
          giif_status?: string | null
          giif_status_checked_at?: string | null
          giif_submission_id?: string | null
          id?: string
          payload?: Json
          pdf_sha256?: string | null
          pdf_storage_path?: string | null
          report_type: Database["public"]["Enums"]["aml_report_type"]
          signature_verified_at?: string | null
          signed_sha256?: string | null
          signed_storage_path?: string | null
          signer_subject?: string | null
          status?: Database["public"]["Enums"]["aml_report_status"]
          submitted_at?: string | null
          threshold_entry_id?: string | null
          updated_at?: string
          upo_received_at?: string | null
          upo_storage_path?: string | null
          user_id: string
          xml_sha256?: string | null
          xml_storage_path?: string | null
        }
        Update: {
          case_id?: string | null
          completeness?: Json
          content_approved_at?: string | null
          content_approved_by?: string | null
          created_at?: string
          current_version?: number
          encryption_cert_fingerprint?: string | null
          giif_response?: Json | null
          giif_status?: string | null
          giif_status_checked_at?: string | null
          giif_submission_id?: string | null
          id?: string
          payload?: Json
          pdf_sha256?: string | null
          pdf_storage_path?: string | null
          report_type?: Database["public"]["Enums"]["aml_report_type"]
          signature_verified_at?: string | null
          signed_sha256?: string | null
          signed_storage_path?: string | null
          signer_subject?: string | null
          status?: Database["public"]["Enums"]["aml_report_status"]
          submitted_at?: string | null
          threshold_entry_id?: string | null
          updated_at?: string
          upo_received_at?: string | null
          upo_storage_path?: string | null
          user_id?: string
          xml_sha256?: string | null
          xml_storage_path?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "aml_reports_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "aml_cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aml_reports_threshold_entry_id_fkey"
            columns: ["threshold_entry_id"]
            isOneToOne: false
            referencedRelation: "aml_threshold_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      aml_risk_assessments: {
        Row: {
          created_at: string
          customer_id: string
          decided_by: string
          final_level: Database["public"]["Enums"]["aml_risk_level"]
          id: string
          override_justification: string | null
          proposed_factors: Json
          proposed_level: Database["public"]["Enums"]["aml_risk_level"]
          user_id: string
        }
        Insert: {
          created_at?: string
          customer_id: string
          decided_by: string
          final_level: Database["public"]["Enums"]["aml_risk_level"]
          id?: string
          override_justification?: string | null
          proposed_factors?: Json
          proposed_level: Database["public"]["Enums"]["aml_risk_level"]
          user_id: string
        }
        Update: {
          created_at?: string
          customer_id?: string
          decided_by?: string
          final_level?: Database["public"]["Enums"]["aml_risk_level"]
          id?: string
          override_justification?: string | null
          proposed_factors?: Json
          proposed_level?: Database["public"]["Enums"]["aml_risk_level"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "aml_risk_assessments_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "aml_customers"
            referencedColumns: ["id"]
          },
        ]
      }
      aml_screenings: {
        Row: {
          created_at: string
          customer_id: string
          error_message: string | null
          fingerprint: string | null
          hit_resolution:
            | Database["public"]["Enums"]["aml_hit_resolution"]
            | null
          id: string
          invalidated_at: string | null
          invalidated_reason: string | null
          query: Json
          raw_result: Json | null
          resolution_note: string | null
          resolved_at: string | null
          resolved_by: string | null
          search_type: string
          status: Database["public"]["Enums"]["aml_screening_status"]
          subject_dob: string | null
          subject_kind: string
          subject_name: string
          total_hits: number | null
          user_id: string
        }
        Insert: {
          created_at?: string
          customer_id: string
          error_message?: string | null
          fingerprint?: string | null
          hit_resolution?:
            | Database["public"]["Enums"]["aml_hit_resolution"]
            | null
          id?: string
          invalidated_at?: string | null
          invalidated_reason?: string | null
          query: Json
          raw_result?: Json | null
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          search_type: string
          status?: Database["public"]["Enums"]["aml_screening_status"]
          subject_dob?: string | null
          subject_kind?: string
          subject_name: string
          total_hits?: number | null
          user_id: string
        }
        Update: {
          created_at?: string
          customer_id?: string
          error_message?: string | null
          fingerprint?: string | null
          hit_resolution?:
            | Database["public"]["Enums"]["aml_hit_resolution"]
            | null
          id?: string
          invalidated_at?: string | null
          invalidated_reason?: string | null
          query?: Json
          raw_result?: Json | null
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          search_type?: string
          status?: Database["public"]["Enums"]["aml_screening_status"]
          subject_dob?: string | null
          subject_kind?: string
          subject_name?: string
          total_hits?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "aml_screenings_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "aml_customers"
            referencedColumns: ["id"]
          },
        ]
      }
      aml_settings: {
        Row: {
          additional_person: Json | null
          created_at: string
          giif_connection_status: Database["public"]["Enums"]["aml_giif_connection_status"]
          giif_environment: string
          giif_institution_id: string | null
          id: string
          institution: Json
          responsible_person: Json
          signer_person: Json | null
          updated_at: string
          user_id: string
        }
        Insert: {
          additional_person?: Json | null
          created_at?: string
          giif_connection_status?: Database["public"]["Enums"]["aml_giif_connection_status"]
          giif_environment?: string
          giif_institution_id?: string | null
          id?: string
          institution?: Json
          responsible_person?: Json
          signer_person?: Json | null
          updated_at?: string
          user_id: string
        }
        Update: {
          additional_person?: Json | null
          created_at?: string
          giif_connection_status?: Database["public"]["Enums"]["aml_giif_connection_status"]
          giif_environment?: string
          giif_institution_id?: string | null
          id?: string
          institution?: Json
          responsible_person?: Json
          signer_person?: Json | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      aml_submission_queue: {
        Row: {
          attempts: number
          created_at: string
          delivered_at: string | null
          id: string
          idempotency_key: string
          last_error: string | null
          last_http_status: number | null
          max_attempts: number
          next_attempt_at: string
          report_id: string
          state: Database["public"]["Enums"]["aml_queue_state"]
          updated_at: string
          user_id: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          delivered_at?: string | null
          id?: string
          idempotency_key: string
          last_error?: string | null
          last_http_status?: number | null
          max_attempts?: number
          next_attempt_at?: string
          report_id: string
          state?: Database["public"]["Enums"]["aml_queue_state"]
          updated_at?: string
          user_id: string
        }
        Update: {
          attempts?: number
          created_at?: string
          delivered_at?: string | null
          id?: string
          idempotency_key?: string
          last_error?: string | null
          last_http_status?: number | null
          max_attempts?: number
          next_attempt_at?: string
          report_id?: string
          state?: Database["public"]["Enums"]["aml_queue_state"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "aml_submission_queue_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "aml_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      aml_threshold_entries: {
        Row: {
          created_at: string
          deadline_at: string
          decided_at: string | null
          decided_by: string | null
          decision: Database["public"]["Enums"]["aml_threshold_decision"] | null
          decision_note: string | null
          eur_equivalent: number
          id: string
          nbp_rate: number
          nbp_table_date: string
          nbp_table_no: string
          report_id: string | null
          reported_by_bank: boolean
          transaction_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          deadline_at: string
          decided_at?: string | null
          decided_by?: string | null
          decision?:
            | Database["public"]["Enums"]["aml_threshold_decision"]
            | null
          decision_note?: string | null
          eur_equivalent: number
          id?: string
          nbp_rate: number
          nbp_table_date: string
          nbp_table_no: string
          report_id?: string | null
          reported_by_bank?: boolean
          transaction_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          deadline_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision?:
            | Database["public"]["Enums"]["aml_threshold_decision"]
            | null
          decision_note?: string | null
          eur_equivalent?: number
          id?: string
          nbp_rate?: number
          nbp_table_date?: string
          nbp_table_no?: string
          report_id?: string | null
          reported_by_bank?: boolean
          transaction_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "aml_threshold_entries_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: true
            referencedRelation: "aml_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      aml_transactions: {
        Row: {
          above_threshold: boolean
          amount: number
          contract_ref: string | null
          counterparty_name: string | null
          created_at: string
          currency: string
          customer_id: string | null
          description: string | null
          eur_equivalent: number | null
          executed: boolean
          execution_confirmed_at: string | null
          execution_confirmed_by: string | null
          id: string
          loan_application_id: string | null
          nbp_rate: number | null
          nbp_table_date: string | null
          nbp_table_no: string | null
          receiver_account: string | null
          sender_account: string | null
          source: Database["public"]["Enums"]["aml_transaction_source"]
          transaction_date: string
          transaction_type: Database["public"]["Enums"]["aml_transaction_type"]
          updated_at: string
          user_id: string
        }
        Insert: {
          above_threshold?: boolean
          amount: number
          contract_ref?: string | null
          counterparty_name?: string | null
          created_at?: string
          currency?: string
          customer_id?: string | null
          description?: string | null
          eur_equivalent?: number | null
          executed?: boolean
          execution_confirmed_at?: string | null
          execution_confirmed_by?: string | null
          id?: string
          loan_application_id?: string | null
          nbp_rate?: number | null
          nbp_table_date?: string | null
          nbp_table_no?: string | null
          receiver_account?: string | null
          sender_account?: string | null
          source?: Database["public"]["Enums"]["aml_transaction_source"]
          transaction_date: string
          transaction_type: Database["public"]["Enums"]["aml_transaction_type"]
          updated_at?: string
          user_id: string
        }
        Update: {
          above_threshold?: boolean
          amount?: number
          contract_ref?: string | null
          counterparty_name?: string | null
          created_at?: string
          currency?: string
          customer_id?: string | null
          description?: string | null
          eur_equivalent?: number | null
          executed?: boolean
          execution_confirmed_at?: string | null
          execution_confirmed_by?: string | null
          id?: string
          loan_application_id?: string | null
          nbp_rate?: number | null
          nbp_table_date?: string | null
          nbp_table_no?: string | null
          receiver_account?: string | null
          sender_account?: string | null
          source?: Database["public"]["Enums"]["aml_transaction_source"]
          transaction_date?: string
          transaction_type?: Database["public"]["Enums"]["aml_transaction_type"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "aml_transactions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "aml_customers"
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
          {
            foreignKeyName: "automation_events_loan_application_id_fkey"
            columns: ["loan_application_id"]
            isOneToOne: false
            referencedRelation: "public_loan_teasers"
            referencedColumns: ["id"]
          },
        ]
      }
      avatar_faqs: {
        Row: {
          answer_text: string
          avatar_id: string
          created_at: string
          id: string
          is_intro: boolean
          is_published: boolean
          last_error: string | null
          question: string
          sort_order: number
          thumbnail_url: string | null
          updated_at: string
          video_id: string | null
          video_status: string
          video_url: string | null
          voice_id: string
        }
        Insert: {
          answer_text: string
          avatar_id?: string
          created_at?: string
          id?: string
          is_intro?: boolean
          is_published?: boolean
          last_error?: string | null
          question: string
          sort_order?: number
          thumbnail_url?: string | null
          updated_at?: string
          video_id?: string | null
          video_status?: string
          video_url?: string | null
          voice_id?: string
        }
        Update: {
          answer_text?: string
          avatar_id?: string
          created_at?: string
          id?: string
          is_intro?: boolean
          is_published?: boolean
          last_error?: string | null
          question?: string
          sort_order?: number
          thumbnail_url?: string | null
          updated_at?: string
          video_id?: string | null
          video_status?: string
          video_url?: string | null
          voice_id?: string
        }
        Relationships: []
      }
      broker_settlements: {
        Row: {
          amount: number
          broker_user_id: string
          client_name: string | null
          created_at: string
          currency: string
          id: string
          loan_application_id: string | null
          notes: string | null
          paid_at: string | null
          period_label: string | null
          status: string
          updated_at: string
        }
        Insert: {
          amount?: number
          broker_user_id: string
          client_name?: string | null
          created_at?: string
          currency?: string
          id?: string
          loan_application_id?: string | null
          notes?: string | null
          paid_at?: string | null
          period_label?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          broker_user_id?: string
          client_name?: string | null
          created_at?: string
          currency?: string
          id?: string
          loan_application_id?: string | null
          notes?: string | null
          paid_at?: string | null
          period_label?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "broker_settlements_loan_application_id_fkey"
            columns: ["loan_application_id"]
            isOneToOne: false
            referencedRelation: "loan_applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "broker_settlements_loan_application_id_fkey"
            columns: ["loan_application_id"]
            isOneToOne: false
            referencedRelation: "public_loan_teasers"
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
          {
            foreignKeyName: "call_queue_loan_application_id_fkey"
            columns: ["loan_application_id"]
            isOneToOne: false
            referencedRelation: "public_loan_teasers"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_clicks: {
        Row: {
          campaign_id: string
          country: string | null
          created_at: string
          device: string | null
          id: string
          ip_hash: string | null
          referrer: string | null
          user_agent: string | null
        }
        Insert: {
          campaign_id: string
          country?: string | null
          created_at?: string
          device?: string | null
          id?: string
          ip_hash?: string | null
          referrer?: string | null
          user_agent?: string | null
        }
        Update: {
          campaign_id?: string
          country?: string | null
          created_at?: string
          device?: string | null
          id?: string
          ip_hash?: string | null
          referrer?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_clicks_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "marketing_campaigns"
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
          {
            foreignKeyName: "chat_threads_loan_application_id_fkey"
            columns: ["loan_application_id"]
            isOneToOne: false
            referencedRelation: "public_loan_teasers"
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
          {
            foreignKeyName: "client_profiles_source_application_id_fkey"
            columns: ["source_application_id"]
            isOneToOne: false
            referencedRelation: "public_loan_teasers"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          address: string | null
          assigned_user_id: string | null
          bank_account: string | null
          bank_account_document_path: string | null
          bank_account_holder_ocr: string | null
          bank_account_verified_at: string | null
          bik_report_name: string | null
          bik_report_path: string | null
          bik_report_uploaded_at: string | null
          city: string | null
          company_name: string | null
          consent_email: boolean
          consent_marketing: boolean
          consent_phone: boolean
          consent_rodo: boolean
          consent_sms: boolean
          consent_terms: boolean
          consent_versions: Json
          consents_accepted_at: string | null
          country: string | null
          created_at: string
          do_not_call: boolean
          do_not_call_at: string | null
          do_not_call_reason: string | null
          do_not_call_source: string | null
          do_not_email: boolean
          do_not_sms: boolean
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
          phone_otp_attempts: number
          phone_otp_expires_at: string | null
          phone_otp_hash: string | null
          phone_otp_sent_at: string | null
          phone_otp_target: string | null
          phone_raw: string | null
          phone_valid: boolean | null
          phone_verified_at: string | null
          phone_verified_value: string | null
          postal_code: string | null
          regon: string | null
          source: string | null
          street: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          address?: string | null
          assigned_user_id?: string | null
          bank_account?: string | null
          bank_account_document_path?: string | null
          bank_account_holder_ocr?: string | null
          bank_account_verified_at?: string | null
          bik_report_name?: string | null
          bik_report_path?: string | null
          bik_report_uploaded_at?: string | null
          city?: string | null
          company_name?: string | null
          consent_email?: boolean
          consent_marketing?: boolean
          consent_phone?: boolean
          consent_rodo?: boolean
          consent_sms?: boolean
          consent_terms?: boolean
          consent_versions?: Json
          consents_accepted_at?: string | null
          country?: string | null
          created_at?: string
          do_not_call?: boolean
          do_not_call_at?: string | null
          do_not_call_reason?: string | null
          do_not_call_source?: string | null
          do_not_email?: boolean
          do_not_sms?: boolean
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
          phone_otp_attempts?: number
          phone_otp_expires_at?: string | null
          phone_otp_hash?: string | null
          phone_otp_sent_at?: string | null
          phone_otp_target?: string | null
          phone_raw?: string | null
          phone_valid?: boolean | null
          phone_verified_at?: string | null
          phone_verified_value?: string | null
          postal_code?: string | null
          regon?: string | null
          source?: string | null
          street?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          address?: string | null
          assigned_user_id?: string | null
          bank_account?: string | null
          bank_account_document_path?: string | null
          bank_account_holder_ocr?: string | null
          bank_account_verified_at?: string | null
          bik_report_name?: string | null
          bik_report_path?: string | null
          bik_report_uploaded_at?: string | null
          city?: string | null
          company_name?: string | null
          consent_email?: boolean
          consent_marketing?: boolean
          consent_phone?: boolean
          consent_rodo?: boolean
          consent_sms?: boolean
          consent_terms?: boolean
          consent_versions?: Json
          consents_accepted_at?: string | null
          country?: string | null
          created_at?: string
          do_not_call?: boolean
          do_not_call_at?: string | null
          do_not_call_reason?: string | null
          do_not_call_source?: string | null
          do_not_email?: boolean
          do_not_sms?: boolean
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
          phone_otp_attempts?: number
          phone_otp_expires_at?: string | null
          phone_otp_hash?: string | null
          phone_otp_sent_at?: string | null
          phone_otp_target?: string | null
          phone_raw?: string | null
          phone_valid?: boolean | null
          phone_verified_at?: string | null
          phone_verified_value?: string | null
          postal_code?: string | null
          regon?: string | null
          source?: string | null
          street?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      consent_documents: {
        Row: {
          content: string
          created_at: string
          id: string
          is_active: boolean
          kind: Database["public"]["Enums"]["consent_kind"]
          title: string
          updated_at: string
          version: number
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          is_active?: boolean
          kind: Database["public"]["Enums"]["consent_kind"]
          title: string
          updated_at?: string
          version?: number
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          is_active?: boolean
          kind?: Database["public"]["Enums"]["consent_kind"]
          title?: string
          updated_at?: string
          version?: number
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
          {
            foreignKeyName: "contact_events_loan_application_id_fkey"
            columns: ["loan_application_id"]
            isOneToOne: false
            referencedRelation: "public_loan_teasers"
            referencedColumns: ["id"]
          },
        ]
      }
      crbr_cache: {
        Row: {
          beneficjenci: Json
          created_at: string
          error_code: string | null
          error_message: string | null
          expires_at: string
          fetched_at: string
          forma_organizacyjna: string | null
          id: string
          krs: string | null
          nazwa_spolki: string | null
          nip: string
          raw_response: Json | null
          updated_at: string
        }
        Insert: {
          beneficjenci?: Json
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          expires_at?: string
          fetched_at?: string
          forma_organizacyjna?: string | null
          id?: string
          krs?: string | null
          nazwa_spolki?: string | null
          nip: string
          raw_response?: Json | null
          updated_at?: string
        }
        Update: {
          beneficjenci?: Json
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          expires_at?: string
          fetched_at?: string
          forma_organizacyjna?: string | null
          id?: string
          krs?: string | null
          nazwa_spolki?: string | null
          nip?: string
          raw_response?: Json | null
          updated_at?: string
        }
        Relationships: []
      }
      didit_verifications: {
        Row: {
          aml_customer_id: string | null
          created_at: string
          decided_at: string | null
          decision: Json | null
          features: string | null
          id: string
          metadata: Json | null
          session_id: string
          session_number: number | null
          status: string
          updated_at: string
          user_id: string
          vendor_data: string | null
          verification_url: string | null
          warnings: Json
          workflow_id: string | null
          workflow_type: string | null
        }
        Insert: {
          aml_customer_id?: string | null
          created_at?: string
          decided_at?: string | null
          decision?: Json | null
          features?: string | null
          id?: string
          metadata?: Json | null
          session_id: string
          session_number?: number | null
          status?: string
          updated_at?: string
          user_id: string
          vendor_data?: string | null
          verification_url?: string | null
          warnings?: Json
          workflow_id?: string | null
          workflow_type?: string | null
        }
        Update: {
          aml_customer_id?: string | null
          created_at?: string
          decided_at?: string | null
          decision?: Json | null
          features?: string | null
          id?: string
          metadata?: Json | null
          session_id?: string
          session_number?: number | null
          status?: string
          updated_at?: string
          user_id?: string
          vendor_data?: string | null
          verification_url?: string | null
          warnings?: Json
          workflow_id?: string | null
          workflow_type?: string | null
        }
        Relationships: []
      }
      dilisense_cache: {
        Row: {
          cache_key: string
          error_code: string | null
          error_message: string | null
          expires_at: string
          fetched_at: string
          query: Json
          result: Json | null
          search_type: string
          total_hits: number | null
        }
        Insert: {
          cache_key: string
          error_code?: string | null
          error_message?: string | null
          expires_at: string
          fetched_at?: string
          query: Json
          result?: Json | null
          search_type: string
          total_hits?: number | null
        }
        Update: {
          cache_key?: string
          error_code?: string | null
          error_message?: string | null
          expires_at?: string
          fetched_at?: string
          query?: Json
          result?: Json | null
          search_type?: string
          total_hits?: number | null
        }
        Relationships: []
      }
      document_templates: {
        Row: {
          audience: string[] | null
          category: string | null
          content_html: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          name: string
          output_format: string
          placeholders: Json
          slug: string | null
          sort_order: number | null
          template_file_path: string | null
          updated_at: string
          use_case: string
        }
        Insert: {
          audience?: string[] | null
          category?: string | null
          content_html?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
          output_format?: string
          placeholders?: Json
          slug?: string | null
          sort_order?: number | null
          template_file_path?: string | null
          updated_at?: string
          use_case?: string
        }
        Update: {
          audience?: string[] | null
          category?: string | null
          content_html?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
          output_format?: string
          placeholders?: Json
          slug?: string | null
          sort_order?: number | null
          template_file_path?: string | null
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
          thumbnail_path: string | null
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
          thumbnail_path?: string | null
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
          thumbnail_path?: string | null
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
            foreignKeyName: "documents_loan_application_id_fkey"
            columns: ["loan_application_id"]
            isOneToOne: false
            referencedRelation: "public_loan_teasers"
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
          bounced_at: string | null
          campaign_id: string
          clicked_at: string | null
          complained_at: string | null
          created_at: string
          delivered_at: string | null
          error_message: string | null
          id: string
          opened_at: string | null
          recipient_email: string
          recipient_name: string | null
          resend_id: string | null
          sent_at: string | null
          status: string
          subscriber_id: string | null
          user_id: string | null
        }
        Insert: {
          bounced_at?: string | null
          campaign_id: string
          clicked_at?: string | null
          complained_at?: string | null
          created_at?: string
          delivered_at?: string | null
          error_message?: string | null
          id?: string
          opened_at?: string | null
          recipient_email: string
          recipient_name?: string | null
          resend_id?: string | null
          sent_at?: string | null
          status?: string
          subscriber_id?: string | null
          user_id?: string | null
        }
        Update: {
          bounced_at?: string | null
          campaign_id?: string
          clicked_at?: string | null
          complained_at?: string | null
          created_at?: string
          delivered_at?: string | null
          error_message?: string | null
          id?: string
          opened_at?: string | null
          recipient_email?: string
          recipient_name?: string | null
          resend_id?: string | null
          sent_at?: string | null
          status?: string
          subscriber_id?: string | null
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
          {
            foreignKeyName: "email_campaign_recipients_subscriber_id_fkey"
            columns: ["subscriber_id"]
            isOneToOne: false
            referencedRelation: "email_subscribers"
            referencedColumns: ["id"]
          },
        ]
      }
      email_campaigns: {
        Row: {
          ai_brief: string | null
          audience_filter: Json
          audience_type: string
          bounced_count: number
          clicked_count: number
          complained_count: number
          created_at: string
          created_by: string | null
          delivered_count: number
          error_message: string | null
          failed_count: number
          finished_at: string | null
          from_email: string | null
          from_name: string | null
          html_body: string
          id: string
          name: string
          opened_count: number
          preview_text: string | null
          recipients_total: number
          reply_to: string | null
          scheduled_at: string | null
          segment_id: string | null
          sent_count: number
          started_at: string | null
          status: string
          subject: string
          text_body: string | null
          unsubscribed_count: number
          updated_at: string
        }
        Insert: {
          ai_brief?: string | null
          audience_filter?: Json
          audience_type?: string
          bounced_count?: number
          clicked_count?: number
          complained_count?: number
          created_at?: string
          created_by?: string | null
          delivered_count?: number
          error_message?: string | null
          failed_count?: number
          finished_at?: string | null
          from_email?: string | null
          from_name?: string | null
          html_body?: string
          id?: string
          name: string
          opened_count?: number
          preview_text?: string | null
          recipients_total?: number
          reply_to?: string | null
          scheduled_at?: string | null
          segment_id?: string | null
          sent_count?: number
          started_at?: string | null
          status?: string
          subject: string
          text_body?: string | null
          unsubscribed_count?: number
          updated_at?: string
        }
        Update: {
          ai_brief?: string | null
          audience_filter?: Json
          audience_type?: string
          bounced_count?: number
          clicked_count?: number
          complained_count?: number
          created_at?: string
          created_by?: string | null
          delivered_count?: number
          error_message?: string | null
          failed_count?: number
          finished_at?: string | null
          from_email?: string | null
          from_name?: string | null
          html_body?: string
          id?: string
          name?: string
          opened_count?: number
          preview_text?: string | null
          recipients_total?: number
          reply_to?: string | null
          scheduled_at?: string | null
          segment_id?: string | null
          sent_count?: number
          started_at?: string | null
          status?: string
          subject?: string
          text_body?: string | null
          unsubscribed_count?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_campaigns_segment_id_fkey"
            columns: ["segment_id"]
            isOneToOne: false
            referencedRelation: "email_segments"
            referencedColumns: ["id"]
          },
        ]
      }
      email_segments: {
        Row: {
          created_at: string
          description: string | null
          filters: Json
          id: string
          name: string
          subscriber_count: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          filters?: Json
          id?: string
          name: string
          subscriber_count?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          filters?: Json
          id?: string
          name?: string
          subscriber_count?: number
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
      email_subscribers: {
        Row: {
          bounced_at: string | null
          created_at: string
          email: string
          first_name: string | null
          id: string
          last_name: string | null
          source: string
          source_id: string | null
          status: string
          tags: string[]
          unsubscribed_at: string | null
          updated_at: string
          utm_campaign: string | null
          utm_medium: string | null
          utm_source: string | null
        }
        Insert: {
          bounced_at?: string | null
          created_at?: string
          email: string
          first_name?: string | null
          id?: string
          last_name?: string | null
          source?: string
          source_id?: string | null
          status?: string
          tags?: string[]
          unsubscribed_at?: string | null
          updated_at?: string
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Update: {
          bounced_at?: string | null
          created_at?: string
          email?: string
          first_name?: string | null
          id?: string
          last_name?: string | null
          source?: string
          source_id?: string | null
          status?: string
          tags?: string[]
          unsubscribed_at?: string | null
          updated_at?: string
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
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
      generated_documents: {
        Row: {
          commission_added_to_costs: boolean | null
          commission_amount: number | null
          created_at: string
          created_by: string | null
          docx_path: string | null
          file_size_bytes: number | null
          form_data: Json
          id: string
          investor_offer_id: string | null
          lead_id: string | null
          loan_application_id: string | null
          pdf_path: string | null
          template_id: string | null
          template_name: string | null
          template_slug: string | null
          updated_at: string
        }
        Insert: {
          commission_added_to_costs?: boolean | null
          commission_amount?: number | null
          created_at?: string
          created_by?: string | null
          docx_path?: string | null
          file_size_bytes?: number | null
          form_data?: Json
          id?: string
          investor_offer_id?: string | null
          lead_id?: string | null
          loan_application_id?: string | null
          pdf_path?: string | null
          template_id?: string | null
          template_name?: string | null
          template_slug?: string | null
          updated_at?: string
        }
        Update: {
          commission_added_to_costs?: boolean | null
          commission_amount?: number | null
          created_at?: string
          created_by?: string | null
          docx_path?: string | null
          file_size_bytes?: number | null
          form_data?: Json
          id?: string
          investor_offer_id?: string | null
          lead_id?: string | null
          loan_application_id?: string | null
          pdf_path?: string | null
          template_id?: string | null
          template_name?: string | null
          template_slug?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "generated_documents_investor_offer_id_fkey"
            columns: ["investor_offer_id"]
            isOneToOne: false
            referencedRelation: "investor_offers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "generated_documents_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "generated_documents_loan_application_id_fkey"
            columns: ["loan_application_id"]
            isOneToOne: false
            referencedRelation: "loan_applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "generated_documents_loan_application_id_fkey"
            columns: ["loan_application_id"]
            isOneToOne: false
            referencedRelation: "public_loan_teasers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "generated_documents_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "document_templates"
            referencedColumns: ["id"]
          },
        ]
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
      individual_sales_register: {
        Row: {
          buyer_address: string | null
          buyer_city: string | null
          buyer_email: string | null
          buyer_name: string | null
          buyer_postal_code: string | null
          created_at: string
          currency: string
          description: string
          gross_amount: number
          id: string
          invoice_id: string | null
          invoice_requested_at: string | null
          notes: string | null
          paid_at: string
          transaction_id: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          buyer_address?: string | null
          buyer_city?: string | null
          buyer_email?: string | null
          buyer_name?: string | null
          buyer_postal_code?: string | null
          created_at?: string
          currency?: string
          description: string
          gross_amount: number
          id?: string
          invoice_id?: string | null
          invoice_requested_at?: string | null
          notes?: string | null
          paid_at?: string
          transaction_id: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          buyer_address?: string | null
          buyer_city?: string | null
          buyer_email?: string | null
          buyer_name?: string | null
          buyer_postal_code?: string | null
          created_at?: string
          currency?: string
          description?: string
          gross_amount?: number
          id?: string
          invoice_id?: string | null
          invoice_requested_at?: string | null
          notes?: string | null
          paid_at?: string
          transaction_id?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "individual_sales_register_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "sales_invoices"
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
      investment_risk_assessments: {
        Row: {
          application_id: string
          client_id: string | null
          created_at: string
          created_by: string | null
          data_sources: Json | null
          error_message: string | null
          forced_sale_floor_pln: number | null
          id: string
          investment_score: number | null
          master_valuation_status: string | null
          property_id: string | null
          recommendation: string | null
          result_json: Json | null
          risk_grade: string | null
          saleability_score: number | null
          updated_at: string
          warnings: Json | null
        }
        Insert: {
          application_id: string
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          data_sources?: Json | null
          error_message?: string | null
          forced_sale_floor_pln?: number | null
          id?: string
          investment_score?: number | null
          master_valuation_status?: string | null
          property_id?: string | null
          recommendation?: string | null
          result_json?: Json | null
          risk_grade?: string | null
          saleability_score?: number | null
          updated_at?: string
          warnings?: Json | null
        }
        Update: {
          application_id?: string
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          data_sources?: Json | null
          error_message?: string | null
          forced_sale_floor_pln?: number | null
          id?: string
          investment_score?: number | null
          master_valuation_status?: string | null
          property_id?: string | null
          recommendation?: string | null
          result_json?: Json | null
          risk_grade?: string | null
          saleability_score?: number | null
          updated_at?: string
          warnings?: Json | null
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
          {
            foreignKeyName: "investor_offers_loan_application_id_fkey"
            columns: ["loan_application_id"]
            isOneToOne: false
            referencedRelation: "public_loan_teasers"
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
          thumbnail_path: string | null
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
          thumbnail_path?: string | null
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
          thumbnail_path?: string | null
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
      landing_leads: {
        Row: {
          created_at: string
          custom_fields: Json
          email: string
          id: string
          ip_address: string | null
          landing_page_id: string
          name: string | null
          phone: string | null
          source: string | null
          user_agent: string | null
          utm: Json | null
        }
        Insert: {
          created_at?: string
          custom_fields?: Json
          email: string
          id?: string
          ip_address?: string | null
          landing_page_id: string
          name?: string | null
          phone?: string | null
          source?: string | null
          user_agent?: string | null
          utm?: Json | null
        }
        Update: {
          created_at?: string
          custom_fields?: Json
          email?: string
          id?: string
          ip_address?: string | null
          landing_page_id?: string
          name?: string | null
          phone?: string | null
          source?: string | null
          user_agent?: string | null
          utm?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "landing_leads_landing_page_id_fkey"
            columns: ["landing_page_id"]
            isOneToOne: false
            referencedRelation: "landing_pages"
            referencedColumns: ["id"]
          },
        ]
      }
      landing_pages: {
        Row: {
          conversion_count: number
          created_at: string
          created_by: string
          cta_text: string
          form_fields: Json
          headline: string
          hero_image_url: string | null
          id: string
          meta_description: string | null
          og_image_url: string | null
          published: boolean
          redirect_url: string | null
          sections: Json
          slug: string
          subheadline: string | null
          thank_you_message: string
          theme: Json
          title: string
          updated_at: string
          view_count: number
        }
        Insert: {
          conversion_count?: number
          created_at?: string
          created_by: string
          cta_text?: string
          form_fields?: Json
          headline: string
          hero_image_url?: string | null
          id?: string
          meta_description?: string | null
          og_image_url?: string | null
          published?: boolean
          redirect_url?: string | null
          sections?: Json
          slug: string
          subheadline?: string | null
          thank_you_message?: string
          theme?: Json
          title: string
          updated_at?: string
          view_count?: number
        }
        Update: {
          conversion_count?: number
          created_at?: string
          created_by?: string
          cta_text?: string
          form_fields?: Json
          headline?: string
          hero_image_url?: string | null
          id?: string
          meta_description?: string | null
          og_image_url?: string | null
          published?: boolean
          redirect_url?: string | null
          sections?: Json
          slug?: string
          subheadline?: string | null
          thank_you_message?: string
          theme?: Json
          title?: string
          updated_at?: string
          view_count?: number
        }
        Relationships: []
      }
      lead_attributions: {
        Row: {
          campaign_id: string | null
          created_at: string
          id: string
          landing_url: string | null
          lead_id: string | null
          referrer: string | null
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
        }
        Insert: {
          campaign_id?: string | null
          created_at?: string
          id?: string
          landing_url?: string | null
          lead_id?: string | null
          referrer?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Update: {
          campaign_id?: string | null
          created_at?: string
          id?: string
          landing_url?: string | null
          lead_id?: string | null
          referrer?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_attributions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "marketing_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_communications: {
        Row: {
          agent_id: string | null
          attachments: Json
          channel: string
          content: string | null
          created_at: string
          created_by: string | null
          direction: string
          duration_seconds: number | null
          elevenlabs_conversation_id: string | null
          email: string | null
          error_message: string | null
          external_id: string | null
          id: string
          lead_id: string | null
          metadata: Json
          phone_normalized: string | null
          recording_url: string | null
          status: string | null
          subject: string | null
          thread_external_id: string | null
          transcript: Json | null
          updated_at: string
        }
        Insert: {
          agent_id?: string | null
          attachments?: Json
          channel: string
          content?: string | null
          created_at?: string
          created_by?: string | null
          direction?: string
          duration_seconds?: number | null
          elevenlabs_conversation_id?: string | null
          email?: string | null
          error_message?: string | null
          external_id?: string | null
          id?: string
          lead_id?: string | null
          metadata?: Json
          phone_normalized?: string | null
          recording_url?: string | null
          status?: string | null
          subject?: string | null
          thread_external_id?: string | null
          transcript?: Json | null
          updated_at?: string
        }
        Update: {
          agent_id?: string | null
          attachments?: Json
          channel?: string
          content?: string | null
          created_at?: string
          created_by?: string | null
          direction?: string
          duration_seconds?: number | null
          elevenlabs_conversation_id?: string | null
          email?: string | null
          error_message?: string | null
          external_id?: string | null
          id?: string
          lead_id?: string | null
          metadata?: Json
          phone_normalized?: string | null
          recording_url?: string | null
          status?: string | null
          subject?: string | null
          thread_external_id?: string | null
          transcript?: Json | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_communications_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_follow_up_schedule: {
        Row: {
          attempts: number
          channel: string
          created_at: string
          error_message: string | null
          external_id: string | null
          id: string
          lead_id: string
          metadata: Json | null
          scheduled_at: string
          sent_at: string | null
          status: string
          step_index: number
          updated_at: string
        }
        Insert: {
          attempts?: number
          channel: string
          created_at?: string
          error_message?: string | null
          external_id?: string | null
          id?: string
          lead_id: string
          metadata?: Json | null
          scheduled_at: string
          sent_at?: string | null
          status?: string
          step_index: number
          updated_at?: string
        }
        Update: {
          attempts?: number
          channel?: string
          created_at?: string
          error_message?: string | null
          external_id?: string | null
          id?: string
          lead_id?: string
          metadata?: Json | null
          scheduled_at?: string
          sent_at?: string | null
          status?: string
          step_index?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_follow_up_schedule_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          application_data: Json
          assigned_to: string | null
          broker_notes: string | null
          client_id: string | null
          consent_email: boolean
          consent_marketing: boolean
          consent_phone: boolean
          consent_rodo: boolean
          consent_sms: boolean
          created_at: string
          current_form_step: number | null
          email: string | null
          first_name: string | null
          google_ads_id: string | null
          id: string
          instagram_igsid: string | null
          investor_id: string | null
          kw_number: string | null
          last_name: string | null
          loan_application_id: string | null
          marked_bad_lead: boolean | null
          marked_bad_reason: string | null
          marked_by: string | null
          messenger_psid: string | null
          meta_campaign_id: string | null
          meta_capi_last_event: string | null
          meta_capi_last_sent_at: string | null
          meta_form_id: string | null
          meta_lead_id: string | null
          notes: string | null
          phone_normalized: string | null
          phone_raw: string | null
          quality_reason: string | null
          quality_score: number | null
          quality_tier: string | null
          return_link: string | null
          return_link_token: string | null
          source: string | null
          status: string
          type: string
          updated_at: string
          user_id: string | null
          utm_campaign: string | null
          utm_medium: string | null
          utm_source: string | null
        }
        Insert: {
          application_data?: Json
          assigned_to?: string | null
          broker_notes?: string | null
          client_id?: string | null
          consent_email?: boolean
          consent_marketing?: boolean
          consent_phone?: boolean
          consent_rodo?: boolean
          consent_sms?: boolean
          created_at?: string
          current_form_step?: number | null
          email?: string | null
          first_name?: string | null
          google_ads_id?: string | null
          id?: string
          instagram_igsid?: string | null
          investor_id?: string | null
          kw_number?: string | null
          last_name?: string | null
          loan_application_id?: string | null
          marked_bad_lead?: boolean | null
          marked_bad_reason?: string | null
          marked_by?: string | null
          messenger_psid?: string | null
          meta_campaign_id?: string | null
          meta_capi_last_event?: string | null
          meta_capi_last_sent_at?: string | null
          meta_form_id?: string | null
          meta_lead_id?: string | null
          notes?: string | null
          phone_normalized?: string | null
          phone_raw?: string | null
          quality_reason?: string | null
          quality_score?: number | null
          quality_tier?: string | null
          return_link?: string | null
          return_link_token?: string | null
          source?: string | null
          status?: string
          type?: string
          updated_at?: string
          user_id?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Update: {
          application_data?: Json
          assigned_to?: string | null
          broker_notes?: string | null
          client_id?: string | null
          consent_email?: boolean
          consent_marketing?: boolean
          consent_phone?: boolean
          consent_rodo?: boolean
          consent_sms?: boolean
          created_at?: string
          current_form_step?: number | null
          email?: string | null
          first_name?: string | null
          google_ads_id?: string | null
          id?: string
          instagram_igsid?: string | null
          investor_id?: string | null
          kw_number?: string | null
          last_name?: string | null
          loan_application_id?: string | null
          marked_bad_lead?: boolean | null
          marked_bad_reason?: string | null
          marked_by?: string | null
          messenger_psid?: string | null
          meta_campaign_id?: string | null
          meta_capi_last_event?: string | null
          meta_capi_last_sent_at?: string | null
          meta_form_id?: string | null
          meta_lead_id?: string | null
          notes?: string | null
          phone_normalized?: string | null
          phone_raw?: string | null
          quality_reason?: string | null
          quality_score?: number | null
          quality_tier?: string | null
          return_link?: string | null
          return_link_token?: string | null
          source?: string | null
          status?: string
          type?: string
          updated_at?: string
          user_id?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leads_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_investor_id_fkey"
            columns: ["investor_id"]
            isOneToOne: false
            referencedRelation: "investors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_loan_application_id_fkey"
            columns: ["loan_application_id"]
            isOneToOne: false
            referencedRelation: "loan_applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_loan_application_id_fkey"
            columns: ["loan_application_id"]
            isOneToOne: false
            referencedRelation: "public_loan_teasers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_meta_lead_id_fkey"
            columns: ["meta_lead_id"]
            isOneToOne: false
            referencedRelation: "meta_leads"
            referencedColumns: ["id"]
          },
        ]
      }
      loan_applications: {
        Row: {
          accepted_annual_rate: number | null
          accepted_loan_amount: number | null
          accepted_max_monthly_payment: number | null
          accepted_period_months: number | null
          accepted_terms: Json | null
          accepted_terms_at: string | null
          admin_decision: string | null
          aml_checked_at: string | null
          aml_status: string | null
          annual_investor_rate: number | null
          archived_at: string | null
          assigned_operator: string | null
          automation_paused: boolean
          automation_status:
            | Database["public"]["Enums"]["automation_status"]
            | null
          available_to_investors: boolean
          broker_notes: string | null
          business_legal_form: string | null
          business_nip_verified_at: string | null
          business_status: string | null
          client_id: string
          completeness_percent: number
          contact_attempts_email: number
          contact_attempts_phone: number
          contact_attempts_sms: number
          created_at: string
          created_by_partner_user_id: string | null
          current_form_step: number
          decision_at: string | null
          decision_by: string | null
          decision_reason: string | null
          deleted_at: string | null
          deleted_by: string | null
          estimated_ltv: number | null
          external_id: string | null
          fast_decision: boolean | null
          first_reminder_at: string | null
          id: string
          initial_score: number | null
          interest_score: number | null
          investor_description: string | null
          investor_interest_count: number
          investor_purpose: string | null
          is_startup: boolean
          kw_status: string | null
          last_automation_error: string | null
          last_contact_at: string | null
          last_reminder_at: string | null
          last_webhook_at: string | null
          loan_amount: number | null
          location_quality: string | null
          make_scenario_id: string | null
          max_monthly_payment: number | null
          merged_into_id: string | null
          missing_documents_snapshot: Json
          missing_fields: Json | null
          next_contact_at: string | null
          next_reminder_at: string | null
          nip: string | null
          offer_card_token: string | null
          preferred_contact_channel:
            | Database["public"]["Enums"]["contact_channel"]
            | null
          preferred_email_hour: number | null
          preferred_period_months: number | null
          property_quality: string | null
          referred_by_partner_id: string | null
          reminder_attempts: number
          reminder_email_count: number
          reminder_email_first_sent_at: string | null
          reminder_email_last_sent_at: string | null
          reminder_email_unsubscribed: boolean
          reminder_email_unsubscribed_at: string | null
          reminder_paused: boolean
          reminder_sms_count: number
          reminder_sms_last_sent_at: string | null
          return_link: string | null
          return_link_token: string | null
          risk_level: string | null
          situation_description: string | null
          source: string | null
          startup_funding_dependency: boolean | null
          status: Database["public"]["Enums"]["loan_status"]
          updated_at: string
          view_count: number
          visibility_level: Database["public"]["Enums"]["visibility_level"]
          webhook_status: string | null
        }
        Insert: {
          accepted_annual_rate?: number | null
          accepted_loan_amount?: number | null
          accepted_max_monthly_payment?: number | null
          accepted_period_months?: number | null
          accepted_terms?: Json | null
          accepted_terms_at?: string | null
          admin_decision?: string | null
          aml_checked_at?: string | null
          aml_status?: string | null
          annual_investor_rate?: number | null
          archived_at?: string | null
          assigned_operator?: string | null
          automation_paused?: boolean
          automation_status?:
            | Database["public"]["Enums"]["automation_status"]
            | null
          available_to_investors?: boolean
          broker_notes?: string | null
          business_legal_form?: string | null
          business_nip_verified_at?: string | null
          business_status?: string | null
          client_id: string
          completeness_percent?: number
          contact_attempts_email?: number
          contact_attempts_phone?: number
          contact_attempts_sms?: number
          created_at?: string
          created_by_partner_user_id?: string | null
          current_form_step?: number
          decision_at?: string | null
          decision_by?: string | null
          decision_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          estimated_ltv?: number | null
          external_id?: string | null
          fast_decision?: boolean | null
          first_reminder_at?: string | null
          id?: string
          initial_score?: number | null
          interest_score?: number | null
          investor_description?: string | null
          investor_interest_count?: number
          investor_purpose?: string | null
          is_startup?: boolean
          kw_status?: string | null
          last_automation_error?: string | null
          last_contact_at?: string | null
          last_reminder_at?: string | null
          last_webhook_at?: string | null
          loan_amount?: number | null
          location_quality?: string | null
          make_scenario_id?: string | null
          max_monthly_payment?: number | null
          merged_into_id?: string | null
          missing_documents_snapshot?: Json
          missing_fields?: Json | null
          next_contact_at?: string | null
          next_reminder_at?: string | null
          nip?: string | null
          offer_card_token?: string | null
          preferred_contact_channel?:
            | Database["public"]["Enums"]["contact_channel"]
            | null
          preferred_email_hour?: number | null
          preferred_period_months?: number | null
          property_quality?: string | null
          referred_by_partner_id?: string | null
          reminder_attempts?: number
          reminder_email_count?: number
          reminder_email_first_sent_at?: string | null
          reminder_email_last_sent_at?: string | null
          reminder_email_unsubscribed?: boolean
          reminder_email_unsubscribed_at?: string | null
          reminder_paused?: boolean
          reminder_sms_count?: number
          reminder_sms_last_sent_at?: string | null
          return_link?: string | null
          return_link_token?: string | null
          risk_level?: string | null
          situation_description?: string | null
          source?: string | null
          startup_funding_dependency?: boolean | null
          status?: Database["public"]["Enums"]["loan_status"]
          updated_at?: string
          view_count?: number
          visibility_level?: Database["public"]["Enums"]["visibility_level"]
          webhook_status?: string | null
        }
        Update: {
          accepted_annual_rate?: number | null
          accepted_loan_amount?: number | null
          accepted_max_monthly_payment?: number | null
          accepted_period_months?: number | null
          accepted_terms?: Json | null
          accepted_terms_at?: string | null
          admin_decision?: string | null
          aml_checked_at?: string | null
          aml_status?: string | null
          annual_investor_rate?: number | null
          archived_at?: string | null
          assigned_operator?: string | null
          automation_paused?: boolean
          automation_status?:
            | Database["public"]["Enums"]["automation_status"]
            | null
          available_to_investors?: boolean
          broker_notes?: string | null
          business_legal_form?: string | null
          business_nip_verified_at?: string | null
          business_status?: string | null
          client_id?: string
          completeness_percent?: number
          contact_attempts_email?: number
          contact_attempts_phone?: number
          contact_attempts_sms?: number
          created_at?: string
          created_by_partner_user_id?: string | null
          current_form_step?: number
          decision_at?: string | null
          decision_by?: string | null
          decision_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          estimated_ltv?: number | null
          external_id?: string | null
          fast_decision?: boolean | null
          first_reminder_at?: string | null
          id?: string
          initial_score?: number | null
          interest_score?: number | null
          investor_description?: string | null
          investor_interest_count?: number
          investor_purpose?: string | null
          is_startup?: boolean
          kw_status?: string | null
          last_automation_error?: string | null
          last_contact_at?: string | null
          last_reminder_at?: string | null
          last_webhook_at?: string | null
          loan_amount?: number | null
          location_quality?: string | null
          make_scenario_id?: string | null
          max_monthly_payment?: number | null
          merged_into_id?: string | null
          missing_documents_snapshot?: Json
          missing_fields?: Json | null
          next_contact_at?: string | null
          next_reminder_at?: string | null
          nip?: string | null
          offer_card_token?: string | null
          preferred_contact_channel?:
            | Database["public"]["Enums"]["contact_channel"]
            | null
          preferred_email_hour?: number | null
          preferred_period_months?: number | null
          property_quality?: string | null
          referred_by_partner_id?: string | null
          reminder_attempts?: number
          reminder_email_count?: number
          reminder_email_first_sent_at?: string | null
          reminder_email_last_sent_at?: string | null
          reminder_email_unsubscribed?: boolean
          reminder_email_unsubscribed_at?: string | null
          reminder_paused?: boolean
          reminder_sms_count?: number
          reminder_sms_last_sent_at?: string | null
          return_link?: string | null
          return_link_token?: string | null
          risk_level?: string | null
          situation_description?: string | null
          source?: string | null
          startup_funding_dependency?: boolean | null
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
          {
            foreignKeyName: "loan_applications_merged_into_id_fkey"
            columns: ["merged_into_id"]
            isOneToOne: false
            referencedRelation: "loan_applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loan_applications_merged_into_id_fkey"
            columns: ["merged_into_id"]
            isOneToOne: false
            referencedRelation: "public_loan_teasers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loan_applications_referred_by_partner_id_fkey"
            columns: ["referred_by_partner_id"]
            isOneToOne: false
            referencedRelation: "affiliate_partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loan_applications_referred_by_partner_id_fkey"
            columns: ["referred_by_partner_id"]
            isOneToOne: false
            referencedRelation: "partner_operator_role_audit"
            referencedColumns: ["partner_id"]
          },
        ]
      }
      loan_proposals: {
        Row: {
          amount: number
          annual_rate: number
          balloon: number
          capped_rata: number
          client_email: string | null
          client_name: string | null
          client_phone: string | null
          commission_pct: number
          commission_pln: number
          created_at: string
          created_by: string | null
          id: string
          is_public: boolean
          max_payment: number
          months: number
          nominal_rata: number
          note: string | null
          schedule: Json
          source_application_id: string | null
          status: string
          total_cost: number
          total_interest: number
          total_to_repay: number
          updated_at: string
        }
        Insert: {
          amount: number
          annual_rate: number
          balloon?: number
          capped_rata?: number
          client_email?: string | null
          client_name?: string | null
          client_phone?: string | null
          commission_pct?: number
          commission_pln?: number
          created_at?: string
          created_by?: string | null
          id?: string
          is_public?: boolean
          max_payment?: number
          months: number
          nominal_rata?: number
          note?: string | null
          schedule?: Json
          source_application_id?: string | null
          status?: string
          total_cost?: number
          total_interest?: number
          total_to_repay?: number
          updated_at?: string
        }
        Update: {
          amount?: number
          annual_rate?: number
          balloon?: number
          capped_rata?: number
          client_email?: string | null
          client_name?: string | null
          client_phone?: string | null
          commission_pct?: number
          commission_pln?: number
          created_at?: string
          created_by?: string | null
          id?: string
          is_public?: boolean
          max_payment?: number
          months?: number
          nominal_rata?: number
          note?: string | null
          schedule?: Json
          source_application_id?: string | null
          status?: string
          total_cost?: number
          total_interest?: number
          total_to_repay?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "loan_proposals_source_application_id_fkey"
            columns: ["source_application_id"]
            isOneToOne: false
            referencedRelation: "loan_applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loan_proposals_source_application_id_fkey"
            columns: ["source_application_id"]
            isOneToOne: false
            referencedRelation: "public_loan_teasers"
            referencedColumns: ["id"]
          },
        ]
      }
      loan_reminder_email_sends: {
        Row: {
          click_count: number
          clicked_at: string | null
          created_at: string
          error_message: string | null
          id: string
          loan_application_id: string
          mg_message_id: string | null
          open_count: number
          opened_at: string | null
          recipient_email: string
          sent_at: string
          sent_hour_warsaw: number
          sequence_number: number | null
          subject: string
          variant_id: string | null
        }
        Insert: {
          click_count?: number
          clicked_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          loan_application_id: string
          mg_message_id?: string | null
          open_count?: number
          opened_at?: string | null
          recipient_email: string
          sent_at?: string
          sent_hour_warsaw: number
          sequence_number?: number | null
          subject: string
          variant_id?: string | null
        }
        Update: {
          click_count?: number
          clicked_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          loan_application_id?: string
          mg_message_id?: string | null
          open_count?: number
          opened_at?: string | null
          recipient_email?: string
          sent_at?: string
          sent_hour_warsaw?: number
          sequence_number?: number | null
          subject?: string
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "loan_reminder_email_sends_loan_application_id_fkey"
            columns: ["loan_application_id"]
            isOneToOne: false
            referencedRelation: "loan_applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loan_reminder_email_sends_loan_application_id_fkey"
            columns: ["loan_application_id"]
            isOneToOne: false
            referencedRelation: "public_loan_teasers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loan_reminder_email_sends_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "loan_reminder_email_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      loan_reminder_email_variants: {
        Row: {
          active: boolean
          body_html: string
          category: string
          clicked_count: number
          created_at: string
          day_index: number | null
          id: string
          opened_count: number
          phase: string | null
          preview_text: string | null
          seed_tag: string | null
          sent_count: number
          sequence_index: number | null
          slot: string | null
          subject: string
          updated_at: string
          weight: number
        }
        Insert: {
          active?: boolean
          body_html: string
          category?: string
          clicked_count?: number
          created_at?: string
          day_index?: number | null
          id?: string
          opened_count?: number
          phase?: string | null
          preview_text?: string | null
          seed_tag?: string | null
          sent_count?: number
          sequence_index?: number | null
          slot?: string | null
          subject: string
          updated_at?: string
          weight?: number
        }
        Update: {
          active?: boolean
          body_html?: string
          category?: string
          clicked_count?: number
          created_at?: string
          day_index?: number | null
          id?: string
          opened_count?: number
          phase?: string | null
          preview_text?: string | null
          seed_tag?: string | null
          sent_count?: number
          sequence_index?: number | null
          slot?: string | null
          subject?: string
          updated_at?: string
          weight?: number
        }
        Relationships: []
      }
      marketing_campaigns: {
        Row: {
          cost: number | null
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          name: string
          notes: string | null
          short_code: string
          slug: string
          target_url: string
          updated_at: string
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
        }
        Insert: {
          cost?: number | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          short_code: string
          slug: string
          target_url: string
          updated_at?: string
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Update: {
          cost?: number | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          short_code?: string
          slug?: string
          target_url?: string
          updated_at?: string
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Relationships: []
      }
      marketing_materials: {
        Row: {
          ai_description: string | null
          audience: Database["public"]["Enums"]["marketing_audience"]
          created_at: string
          description: string | null
          file_size: number | null
          id: string
          media_type: Database["public"]["Enums"]["marketing_media_type"]
          mime_type: string | null
          storage_path: string
          thumbnail_path: string | null
          title: string
          updated_at: string
          uploaded_by: string | null
        }
        Insert: {
          ai_description?: string | null
          audience: Database["public"]["Enums"]["marketing_audience"]
          created_at?: string
          description?: string | null
          file_size?: number | null
          id?: string
          media_type: Database["public"]["Enums"]["marketing_media_type"]
          mime_type?: string | null
          storage_path: string
          thumbnail_path?: string | null
          title: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Update: {
          ai_description?: string | null
          audience?: Database["public"]["Enums"]["marketing_audience"]
          created_at?: string
          description?: string | null
          file_size?: number | null
          id?: string
          media_type?: Database["public"]["Enums"]["marketing_media_type"]
          mime_type?: string | null
          storage_path?: string
          thumbnail_path?: string | null
          title?: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Relationships: []
      }
      messenger_outbox: {
        Row: {
          body: string
          created_at: string
          error_message: string | null
          id: string
          lead_id: string
          sent_at: string | null
          status: string
        }
        Insert: {
          body: string
          created_at?: string
          error_message?: string | null
          id?: string
          lead_id: string
          sent_at?: string | null
          status?: string
        }
        Update: {
          body?: string
          created_at?: string
          error_message?: string | null
          id?: string
          lead_id?: string
          sent_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "messenger_outbox_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
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
      meta_capi_events: {
        Row: {
          created_at: string
          currency: string | null
          error: string | null
          event_id: string
          event_name: string
          id: string
          lead_id: string | null
          loan_amount: number | null
          payload: Json | null
          pixel_id: string
          response: Json | null
          sent_at: string | null
          status: string
          tier: string | null
          value: number | null
        }
        Insert: {
          created_at?: string
          currency?: string | null
          error?: string | null
          event_id: string
          event_name: string
          id?: string
          lead_id?: string | null
          loan_amount?: number | null
          payload?: Json | null
          pixel_id: string
          response?: Json | null
          sent_at?: string | null
          status?: string
          tier?: string | null
          value?: number | null
        }
        Update: {
          created_at?: string
          currency?: string | null
          error?: string | null
          event_id?: string
          event_name?: string
          id?: string
          lead_id?: string | null
          loan_amount?: number | null
          payload?: Json | null
          pixel_id?: string
          response?: Json | null
          sent_at?: string | null
          status?: string
          tier?: string | null
          value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "meta_capi_events_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_lead_forms: {
        Row: {
          assigned_role: Database["public"]["Enums"]["app_role"]
          assigned_user_id: string | null
          created_at: string
          form_name: string | null
          id: string
          is_enabled: boolean
          last_error: string | null
          last_lead_at: string | null
          last_synced_at: string | null
          meta_form_id: string
          meta_page_id: string | null
          page_name: string | null
          total_leads_pulled: number
          updated_at: string
          voicebot_enabled: boolean
        }
        Insert: {
          assigned_role?: Database["public"]["Enums"]["app_role"]
          assigned_user_id?: string | null
          created_at?: string
          form_name?: string | null
          id?: string
          is_enabled?: boolean
          last_error?: string | null
          last_lead_at?: string | null
          last_synced_at?: string | null
          meta_form_id: string
          meta_page_id?: string | null
          page_name?: string | null
          total_leads_pulled?: number
          updated_at?: string
          voicebot_enabled?: boolean
        }
        Update: {
          assigned_role?: Database["public"]["Enums"]["app_role"]
          assigned_user_id?: string | null
          created_at?: string
          form_name?: string | null
          id?: string
          is_enabled?: boolean
          last_error?: string | null
          last_lead_at?: string | null
          last_synced_at?: string | null
          meta_form_id?: string
          meta_page_id?: string | null
          page_name?: string | null
          total_leads_pulled?: number
          updated_at?: string
          voicebot_enabled?: boolean
        }
        Relationships: []
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
          {
            foreignKeyName: "meta_leads_lead_application_id_fkey"
            columns: ["lead_application_id"]
            isOneToOne: false
            referencedRelation: "public_loan_teasers"
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
      offer_distribution_messages: {
        Row: {
          attachments: Json
          content: string | null
          created_at: string
          direction: string
          distribution_id: string | null
          from_email: string | null
          html: string | null
          id: string
          in_reply_to: string | null
          investor_id: string | null
          loan_application_id: string
          message_id: string | null
          subject: string | null
          to_email: string | null
        }
        Insert: {
          attachments?: Json
          content?: string | null
          created_at?: string
          direction: string
          distribution_id?: string | null
          from_email?: string | null
          html?: string | null
          id?: string
          in_reply_to?: string | null
          investor_id?: string | null
          loan_application_id: string
          message_id?: string | null
          subject?: string | null
          to_email?: string | null
        }
        Update: {
          attachments?: Json
          content?: string | null
          created_at?: string
          direction?: string
          distribution_id?: string | null
          from_email?: string | null
          html?: string | null
          id?: string
          in_reply_to?: string | null
          investor_id?: string | null
          loan_application_id?: string
          message_id?: string | null
          subject?: string | null
          to_email?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "offer_distribution_messages_distribution_id_fkey"
            columns: ["distribution_id"]
            isOneToOne: false
            referencedRelation: "offer_distributions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offer_distribution_messages_investor_id_fkey"
            columns: ["investor_id"]
            isOneToOne: false
            referencedRelation: "investors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offer_distribution_messages_loan_application_id_fkey"
            columns: ["loan_application_id"]
            isOneToOne: false
            referencedRelation: "loan_applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offer_distribution_messages_loan_application_id_fkey"
            columns: ["loan_application_id"]
            isOneToOne: false
            referencedRelation: "public_loan_teasers"
            referencedColumns: ["id"]
          },
        ]
      }
      offer_distributions: {
        Row: {
          additional_info_request: string | null
          created_at: string
          distribution_status: Database["public"]["Enums"]["distribution_status"]
          email_error: string | null
          email_message_id: string | null
          email_status: string | null
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
          email_error?: string | null
          email_message_id?: string | null
          email_status?: string | null
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
          email_error?: string | null
          email_message_id?: string | null
          email_status?: string | null
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
          {
            foreignKeyName: "offer_distributions_loan_application_id_fkey"
            columns: ["loan_application_id"]
            isOneToOne: false
            referencedRelation: "public_loan_teasers"
            referencedColumns: ["id"]
          },
        ]
      }
      operator_invites: {
        Row: {
          created_at: string
          created_by: string | null
          email: string | null
          expires_at: string
          id: string
          max_uses: number | null
          note: string | null
          token: string
          updated_at: string
          used_at: string | null
          used_by_user_id: string | null
          uses_count: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          email?: string | null
          expires_at?: string
          id?: string
          max_uses?: number | null
          note?: string | null
          token?: string
          updated_at?: string
          used_at?: string | null
          used_by_user_id?: string | null
          uses_count?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          email?: string | null
          expires_at?: string
          id?: string
          max_uses?: number | null
          note?: string | null
          token?: string
          updated_at?: string
          used_at?: string | null
          used_by_user_id?: string | null
          uses_count?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          city: string | null
          created_at: string
          email: string | null
          first_name: string | null
          id: string
          job_title: string | null
          last_name: string | null
          phone: string | null
          referral_captured_at: string | null
          referral_code: string | null
          referred_by_partner_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          city?: string | null
          created_at?: string
          email?: string | null
          first_name?: string | null
          id?: string
          job_title?: string | null
          last_name?: string | null
          phone?: string | null
          referral_captured_at?: string | null
          referral_code?: string | null
          referred_by_partner_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          city?: string | null
          created_at?: string
          email?: string | null
          first_name?: string | null
          id?: string
          job_title?: string | null
          last_name?: string | null
          phone?: string | null
          referral_captured_at?: string | null
          referral_code?: string | null
          referred_by_partner_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_referred_by_partner_id_fkey"
            columns: ["referred_by_partner_id"]
            isOneToOne: false
            referencedRelation: "affiliate_partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_referred_by_partner_id_fkey"
            columns: ["referred_by_partner_id"]
            isOneToOne: false
            referencedRelation: "partner_operator_role_audit"
            referencedColumns: ["partner_id"]
          },
        ]
      }
      properties: {
        Row: {
          additional_land_register_numbers: string[]
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
          additional_land_register_numbers?: string[]
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
          additional_land_register_numbers?: string[]
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
          {
            foreignKeyName: "properties_loan_application_id_fkey"
            columns: ["loan_application_id"]
            isOneToOne: false
            referencedRelation: "public_loan_teasers"
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
      reminder_email_schedule: {
        Row: {
          cron_expression: string
          enabled: boolean
          id: number
          last_result: Json | null
          last_run_at: string | null
          last_tick_at: string | null
          sample_sent_at: string | null
          timezone: string
          updated_at: string
        }
        Insert: {
          cron_expression?: string
          enabled?: boolean
          id?: number
          last_result?: Json | null
          last_run_at?: string | null
          last_tick_at?: string | null
          sample_sent_at?: string | null
          timezone?: string
          updated_at?: string
        }
        Update: {
          cron_expression?: string
          enabled?: boolean
          id?: number
          last_result?: Json | null
          last_run_at?: string | null
          last_tick_at?: string | null
          sample_sent_at?: string | null
          timezone?: string
          updated_at?: string
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
      sales_invoices: {
        Row: {
          buyer_city: string | null
          buyer_country: string | null
          buyer_email: string | null
          buyer_name: string | null
          buyer_nip: string | null
          buyer_postal_code: string | null
          buyer_street: string | null
          buyer_user_id: string | null
          created_at: string
          created_by: string | null
          currency: string
          due_date: string | null
          entity_id: string | null
          error_message: string | null
          fakturowo_document_id: string | null
          gross_amount: number
          id: string
          invoice_number: string | null
          issue_date: string | null
          items: Json
          ksef_element_reference: string | null
          ksef_reference_number: string | null
          ksef_status: string
          ksef_upo_xml: string | null
          net_amount: number
          payment_id: string | null
          pdf_url: string | null
          provider: string | null
          sale_date: string | null
          source_id: string | null
          source_type: string
          status: string
          updated_at: string
          vat_amount: number
          vat_rate: string
        }
        Insert: {
          buyer_city?: string | null
          buyer_country?: string | null
          buyer_email?: string | null
          buyer_name?: string | null
          buyer_nip?: string | null
          buyer_postal_code?: string | null
          buyer_street?: string | null
          buyer_user_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          due_date?: string | null
          entity_id?: string | null
          error_message?: string | null
          fakturowo_document_id?: string | null
          gross_amount?: number
          id?: string
          invoice_number?: string | null
          issue_date?: string | null
          items?: Json
          ksef_element_reference?: string | null
          ksef_reference_number?: string | null
          ksef_status?: string
          ksef_upo_xml?: string | null
          net_amount?: number
          payment_id?: string | null
          pdf_url?: string | null
          provider?: string | null
          sale_date?: string | null
          source_id?: string | null
          source_type?: string
          status?: string
          updated_at?: string
          vat_amount?: number
          vat_rate?: string
        }
        Update: {
          buyer_city?: string | null
          buyer_country?: string | null
          buyer_email?: string | null
          buyer_name?: string | null
          buyer_nip?: string | null
          buyer_postal_code?: string | null
          buyer_street?: string | null
          buyer_user_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          due_date?: string | null
          entity_id?: string | null
          error_message?: string | null
          fakturowo_document_id?: string | null
          gross_amount?: number
          id?: string
          invoice_number?: string | null
          issue_date?: string | null
          items?: Json
          ksef_element_reference?: string | null
          ksef_reference_number?: string | null
          ksef_status?: string
          ksef_upo_xml?: string | null
          net_amount?: number
          payment_id?: string | null
          pdf_url?: string | null
          provider?: string | null
          sale_date?: string | null
          source_id?: string | null
          source_type?: string
          status?: string
          updated_at?: string
          vat_amount?: number
          vat_rate?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_invoices_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "accounting_entities"
            referencedColumns: ["id"]
          },
        ]
      }
      social_posts: {
        Row: {
          ai_model: string | null
          ai_prompt: string | null
          campaign: string | null
          content: string
          created_at: string
          created_by: string | null
          hashtags: string[] | null
          id: string
          image_url: string | null
          link_url: string | null
          platform: string
          published_at: string | null
          scheduled_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          ai_model?: string | null
          ai_prompt?: string | null
          campaign?: string | null
          content: string
          created_at?: string
          created_by?: string | null
          hashtags?: string[] | null
          id?: string
          image_url?: string | null
          link_url?: string | null
          platform: string
          published_at?: string | null
          scheduled_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          ai_model?: string | null
          ai_prompt?: string | null
          campaign?: string | null
          content?: string
          created_at?: string
          created_by?: string | null
          hashtags?: string[] | null
          id?: string
          image_url?: string | null
          link_url?: string | null
          platform?: string
          published_at?: string | null
          scheduled_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      storage_migration_log: {
        Row: {
          created_at: string
          error: string | null
          id: string
          ok: boolean
          source_bucket: string
          source_path: string
          table_updated: string | null
          target_bucket: string
          target_path: string
        }
        Insert: {
          created_at?: string
          error?: string | null
          id?: string
          ok?: boolean
          source_bucket: string
          source_path: string
          table_updated?: string | null
          target_bucket?: string
          target_path: string
        }
        Update: {
          created_at?: string
          error?: string | null
          id?: string
          ok?: boolean
          source_bucket?: string
          source_path?: string
          table_updated?: string | null
          target_bucket?: string
          target_path?: string
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
      text_agent_knowledge: {
        Row: {
          content: string
          created_at: string
          created_by: string | null
          embedding: string | null
          id: string
          title: string
          updated_at: string
        }
        Insert: {
          content: string
          created_at?: string
          created_by?: string | null
          embedding?: string | null
          id?: string
          title: string
          updated_at?: string
        }
        Update: {
          content?: string
          created_at?: string
          created_by?: string | null
          embedding?: string | null
          id?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      text_agent_settings: {
        Row: {
          first_message: string | null
          id: number
          system_prompt: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          first_message?: string | null
          id?: number
          system_prompt?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          first_message?: string | null
          id?: number
          system_prompt?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      tpay_transaction_buyers: {
        Row: {
          buyer_address: string | null
          buyer_city: string | null
          buyer_country: string | null
          buyer_email: string | null
          buyer_name: string | null
          buyer_nip: string | null
          buyer_postal_code: string | null
          buyer_type: string
          created_at: string
          id: string
          transaction_id: string
          user_id: string
        }
        Insert: {
          buyer_address?: string | null
          buyer_city?: string | null
          buyer_country?: string | null
          buyer_email?: string | null
          buyer_name?: string | null
          buyer_nip?: string | null
          buyer_postal_code?: string | null
          buyer_type: string
          created_at?: string
          id?: string
          transaction_id: string
          user_id: string
        }
        Update: {
          buyer_address?: string | null
          buyer_city?: string | null
          buyer_country?: string | null
          buyer_email?: string | null
          buyer_name?: string | null
          buyer_nip?: string | null
          buyer_postal_code?: string | null
          buyer_type?: string
          created_at?: string
          id?: string
          transaction_id?: string
          user_id?: string
        }
        Relationships: []
      }
      tracking_settings: {
        Row: {
          client_pixel_id: string | null
          ga4_measurement_id: string | null
          google_ads_conversion_id: string | null
          google_ads_label_lead: string | null
          google_ads_label_registration: string | null
          google_ads_label_submit: string | null
          google_ads_label_subscribe: string | null
          gtm_container_id: string | null
          id: number
          investor_pixel_id: string | null
          meta_audience_converters_id: string | null
          meta_audience_visitors_id: string | null
          meta_audiences_account_id: string | null
          track_contact: boolean
          track_lead: boolean
          track_registration: boolean
          track_subscribe: boolean
          updated_at: string
        }
        Insert: {
          client_pixel_id?: string | null
          ga4_measurement_id?: string | null
          google_ads_conversion_id?: string | null
          google_ads_label_lead?: string | null
          google_ads_label_registration?: string | null
          google_ads_label_submit?: string | null
          google_ads_label_subscribe?: string | null
          gtm_container_id?: string | null
          id?: number
          investor_pixel_id?: string | null
          meta_audience_converters_id?: string | null
          meta_audience_visitors_id?: string | null
          meta_audiences_account_id?: string | null
          track_contact?: boolean
          track_lead?: boolean
          track_registration?: boolean
          track_subscribe?: boolean
          updated_at?: string
        }
        Update: {
          client_pixel_id?: string | null
          ga4_measurement_id?: string | null
          google_ads_conversion_id?: string | null
          google_ads_label_lead?: string | null
          google_ads_label_registration?: string | null
          google_ads_label_submit?: string | null
          google_ads_label_subscribe?: string | null
          gtm_container_id?: string | null
          id?: number
          investor_pixel_id?: string | null
          meta_audience_converters_id?: string | null
          meta_audience_visitors_id?: string | null
          meta_audiences_account_id?: string | null
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
          free_lesson: boolean
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
          free_lesson?: boolean
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
          free_lesson?: boolean
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
          document_reminder_agent_id: string | null
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
          document_reminder_agent_id?: string | null
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
          document_reminder_agent_id?: string | null
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
      wind_borrowers: {
        Row: {
          adres_do_doreczen: string | null
          adres_zamieszkania: string | null
          created_at: string
          dowod_osobisty: string | null
          email: string | null
          email_zgoda_doreczenia: boolean
          id: string
          imie_nazwisko: string
          investor_user_id: string
          nip: string | null
          notatki: string | null
          pesel: string | null
          telefon: string | null
          typ: Database["public"]["Enums"]["wind_borrower_type"]
          updated_at: string
        }
        Insert: {
          adres_do_doreczen?: string | null
          adres_zamieszkania?: string | null
          created_at?: string
          dowod_osobisty?: string | null
          email?: string | null
          email_zgoda_doreczenia?: boolean
          id?: string
          imie_nazwisko?: string
          investor_user_id?: string
          nip?: string | null
          notatki?: string | null
          pesel?: string | null
          telefon?: string | null
          typ?: Database["public"]["Enums"]["wind_borrower_type"]
          updated_at?: string
        }
        Update: {
          adres_do_doreczen?: string | null
          adres_zamieszkania?: string | null
          created_at?: string
          dowod_osobisty?: string | null
          email?: string | null
          email_zgoda_doreczenia?: boolean
          id?: string
          imie_nazwisko?: string
          investor_user_id?: string
          nip?: string | null
          notatki?: string | null
          pesel?: string | null
          telefon?: string | null
          typ?: Database["public"]["Enums"]["wind_borrower_type"]
          updated_at?: string
        }
        Relationships: []
      }
      wind_collection_cases: {
        Row: {
          created_at: string
          data_otwarcia: string
          data_zamkniecia: string | null
          etap: string
          id: string
          investor_user_id: string
          kwota_zalegla: number
          loan_id: string
          opoznienie_dni: number
          osoba_prowadzaca: string | null
          priorytet: Database["public"]["Enums"]["wind_priority"]
          sciezka: Database["public"]["Enums"]["wind_path"]
          updated_at: string
          wynik: Database["public"]["Enums"]["wind_case_result"] | null
        }
        Insert: {
          created_at?: string
          data_otwarcia?: string
          data_zamkniecia?: string | null
          etap?: string
          id?: string
          investor_user_id?: string
          kwota_zalegla?: number
          loan_id: string
          opoznienie_dni?: number
          osoba_prowadzaca?: string | null
          priorytet?: Database["public"]["Enums"]["wind_priority"]
          sciezka?: Database["public"]["Enums"]["wind_path"]
          updated_at?: string
          wynik?: Database["public"]["Enums"]["wind_case_result"] | null
        }
        Update: {
          created_at?: string
          data_otwarcia?: string
          data_zamkniecia?: string | null
          etap?: string
          id?: string
          investor_user_id?: string
          kwota_zalegla?: number
          loan_id?: string
          opoznienie_dni?: number
          osoba_prowadzaca?: string | null
          priorytet?: Database["public"]["Enums"]["wind_priority"]
          sciezka?: Database["public"]["Enums"]["wind_path"]
          updated_at?: string
          wynik?: Database["public"]["Enums"]["wind_case_result"] | null
        }
        Relationships: [
          {
            foreignKeyName: "wind_collection_cases_loan_id_fkey"
            columns: ["loan_id"]
            isOneToOne: false
            referencedRelation: "wind_loans"
            referencedColumns: ["id"]
          },
        ]
      }
      wind_documents: {
        Row: {
          case_id: string
          created_at: string
          event_id: string | null
          id: string
          investor_user_id: string
          plik_url: string | null
          status: Database["public"]["Enums"]["wind_document_status"]
          tresc: string | null
          typ: Database["public"]["Enums"]["wind_document_type"]
          tytul: string
        }
        Insert: {
          case_id: string
          created_at?: string
          event_id?: string | null
          id?: string
          investor_user_id?: string
          plik_url?: string | null
          status?: Database["public"]["Enums"]["wind_document_status"]
          tresc?: string | null
          typ: Database["public"]["Enums"]["wind_document_type"]
          tytul: string
        }
        Update: {
          case_id?: string
          created_at?: string
          event_id?: string | null
          id?: string
          investor_user_id?: string
          plik_url?: string | null
          status?: Database["public"]["Enums"]["wind_document_status"]
          tresc?: string | null
          typ?: Database["public"]["Enums"]["wind_document_type"]
          tytul?: string
        }
        Relationships: [
          {
            foreignKeyName: "wind_documents_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "wind_collection_cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wind_documents_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "wind_events"
            referencedColumns: ["id"]
          },
        ]
      }
      wind_events: {
        Row: {
          autor: string | null
          case_id: string
          created_at: string
          data_doreczenia: string | null
          data_zdarzenia: string
          id: string
          investor_user_id: string
          kategoria: Database["public"]["Enums"]["wind_event_category"]
          metadata: Json
          status_doreczenia:
            | Database["public"]["Enums"]["wind_delivery_status"]
            | null
          tresc: string | null
          typ: Database["public"]["Enums"]["wind_event_type"]
          tytul: string
          zalacznik_url: string | null
        }
        Insert: {
          autor?: string | null
          case_id: string
          created_at?: string
          data_doreczenia?: string | null
          data_zdarzenia?: string
          id?: string
          investor_user_id?: string
          kategoria?: Database["public"]["Enums"]["wind_event_category"]
          metadata?: Json
          status_doreczenia?:
            | Database["public"]["Enums"]["wind_delivery_status"]
            | null
          tresc?: string | null
          typ: Database["public"]["Enums"]["wind_event_type"]
          tytul: string
          zalacznik_url?: string | null
        }
        Update: {
          autor?: string | null
          case_id?: string
          created_at?: string
          data_doreczenia?: string | null
          data_zdarzenia?: string
          id?: string
          investor_user_id?: string
          kategoria?: Database["public"]["Enums"]["wind_event_category"]
          metadata?: Json
          status_doreczenia?:
            | Database["public"]["Enums"]["wind_delivery_status"]
            | null
          tresc?: string | null
          typ?: Database["public"]["Enums"]["wind_event_type"]
          tytul?: string
          zalacznik_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "wind_events_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "wind_collection_cases"
            referencedColumns: ["id"]
          },
        ]
      }
      wind_loans: {
        Row: {
          akt_notarialny_777: string | null
          borrower_id: string
          created_at: string
          data_ostatniej_wplaty: string | null
          data_umowy: string | null
          data_wypowiedzenia: string | null
          id: string
          investor_user_id: string
          kwota_777: number | null
          kwota_calkowita: number
          kwota_doplat: number | null
          kwota_hipoteki: number | null
          kwota_pozyczki: number
          numer_kw: string | null
          numer_umowy: string | null
          oprocentowanie_roczne: number
          prowizja: number
          rachunek_splaty: string | null
          saldo_pozostale: number
          status: Database["public"]["Enums"]["wind_loan_status"]
          stopa_odsetek_max: number
          termin_splaty: string | null
          updated_at: string
        }
        Insert: {
          akt_notarialny_777?: string | null
          borrower_id: string
          created_at?: string
          data_ostatniej_wplaty?: string | null
          data_umowy?: string | null
          data_wypowiedzenia?: string | null
          id?: string
          investor_user_id?: string
          kwota_777?: number | null
          kwota_calkowita?: number
          kwota_doplat?: number | null
          kwota_hipoteki?: number | null
          kwota_pozyczki?: number
          numer_kw?: string | null
          numer_umowy?: string | null
          oprocentowanie_roczne?: number
          prowizja?: number
          rachunek_splaty?: string | null
          saldo_pozostale?: number
          status?: Database["public"]["Enums"]["wind_loan_status"]
          stopa_odsetek_max?: number
          termin_splaty?: string | null
          updated_at?: string
        }
        Update: {
          akt_notarialny_777?: string | null
          borrower_id?: string
          created_at?: string
          data_ostatniej_wplaty?: string | null
          data_umowy?: string | null
          data_wypowiedzenia?: string | null
          id?: string
          investor_user_id?: string
          kwota_777?: number | null
          kwota_calkowita?: number
          kwota_doplat?: number | null
          kwota_hipoteki?: number | null
          kwota_pozyczki?: number
          numer_kw?: string | null
          numer_umowy?: string | null
          oprocentowanie_roczne?: number
          prowizja?: number
          rachunek_splaty?: string | null
          saldo_pozostale?: number
          status?: Database["public"]["Enums"]["wind_loan_status"]
          stopa_odsetek_max?: number
          termin_splaty?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "wind_loans_borrower_id_fkey"
            columns: ["borrower_id"]
            isOneToOne: false
            referencedRelation: "wind_borrowers"
            referencedColumns: ["id"]
          },
        ]
      }
      youtube_integration: {
        Row: {
          access_token: string | null
          access_token_expires_at: string | null
          channel_id: string | null
          channel_title: string | null
          connected_at: string | null
          created_at: string
          id: number
          last_error: string | null
          oauth_state: string | null
          oauth_state_expires_at: string | null
          refresh_token: string | null
          updated_at: string
        }
        Insert: {
          access_token?: string | null
          access_token_expires_at?: string | null
          channel_id?: string | null
          channel_title?: string | null
          connected_at?: string | null
          created_at?: string
          id?: number
          last_error?: string | null
          oauth_state?: string | null
          oauth_state_expires_at?: string | null
          refresh_token?: string | null
          updated_at?: string
        }
        Update: {
          access_token?: string | null
          access_token_expires_at?: string | null
          channel_id?: string | null
          channel_title?: string | null
          connected_at?: string | null
          created_at?: string
          id?: number
          last_error?: string | null
          oauth_state?: string | null
          oauth_state_expires_at?: string | null
          refresh_token?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      youtube_publish_queue: {
        Row: {
          attempt_count: number
          created_at: string
          created_by: string | null
          description: string
          id: string
          last_error: string | null
          privacy_status: string
          published_at: string | null
          scheduled_at: string
          source_video_url: string
          status: string
          tags: string[]
          title: string
          updated_at: string
          youtube_video_id: string | null
        }
        Insert: {
          attempt_count?: number
          created_at?: string
          created_by?: string | null
          description?: string
          id?: string
          last_error?: string | null
          privacy_status?: string
          published_at?: string | null
          scheduled_at?: string
          source_video_url: string
          status?: string
          tags?: string[]
          title: string
          updated_at?: string
          youtube_video_id?: string | null
        }
        Update: {
          attempt_count?: number
          created_at?: string
          created_by?: string | null
          description?: string
          id?: string
          last_error?: string | null
          privacy_status?: string
          published_at?: string | null
          scheduled_at?: string
          source_video_url?: string
          status?: string
          tags?: string[]
          title?: string
          updated_at?: string
          youtube_video_id?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      partner_operator_role_audit: {
        Row: {
          company_name: string | null
          email: string | null
          first_name: string | null
          has_posrednik_role: boolean | null
          last_name: string | null
          operator_role_granted_at: string | null
          partner_id: string | null
          partner_status: string | null
          user_id: string | null
        }
        Relationships: []
      }
      public_loan_teasers: {
        Row: {
          annual_investor_rate: number | null
          area_sqm: number | null
          city: string | null
          created_at: string | null
          estimated_value: number | null
          id: string | null
          loan_amount: number | null
          preferred_period_months: number | null
          property_type: string | null
          status: string | null
          voivodeship: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      admin_adjust_access: {
        Args: {
          _audience: string
          _new_until: string
          _reason: string
          _target_user_id: string
        }
        Returns: Json
      }
      affiliate_current_partner_id: { Args: never; Returns: string }
      aml_next_case_no: { Args: { _user_id: string }; Returns: string }
      apply_loan_auto_status: { Args: { _loan_id: string }; Returns: undefined }
      broker_has_paid_access: { Args: { _user_id: string }; Returns: boolean }
      broker_offer_usage: { Args: { _user_id: string }; Returns: Json }
      broker_soft_delete_application: {
        Args: { _application_id: string }
        Returns: Json
      }
      compute_loan_auto_status: {
        Args: { _loan_id: string }
        Returns: Database["public"]["Enums"]["loan_status"]
      }
      dedup_leads: {
        Args: never
        Returns: {
          merged_pairs: number
          remaining_leads: number
        }[]
      }
      dedup_loan_applications: { Args: never; Returns: number }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      email_queue_dispatch: { Args: never; Returns: undefined }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      exec_admin_any: { Args: { _sql: string }; Returns: Json }
      exec_admin_select: { Args: { _sql: string }; Returns: Json }
      exec_admin_write: { Args: { _sql: string }; Returns: Json }
      free_investor_usage: { Args: { _user_id: string }; Returns: Json }
      get_access_state: {
        Args: { _audience: string; _user_id: string }
        Returns: Json
      }
      get_operator_invite: {
        Args: { _token: string }
        Returns: {
          email: string
          expires_at: string
          is_valid: boolean
          used: boolean
        }[]
      }
      get_public_loan_proposal: {
        Args: { _id: string }
        Returns: {
          amount: number
          annual_rate: number
          balloon: number
          capped_rata: number
          commission_pct: number
          commission_pln: number
          created_at: string
          id: string
          is_public: boolean
          max_payment: number
          months: number
          nominal_rata: number
          note: string
          schedule: Json
          source_application_id: string
          status: string
          total_cost: number
          total_interest: number
          total_to_repay: number
          updated_at: string
        }[]
      }
      get_public_tracking_settings: {
        Args: never
        Returns: {
          client_pixel_id: string
          ga4_measurement_id: string
          google_ads_conversion_id: string
          google_ads_label_lead: string
          google_ads_label_registration: string
          google_ads_label_submit: string
          google_ads_label_subscribe: string
          gtm_container_id: string
          investor_pixel_id: string
          track_contact: boolean
          track_lead: boolean
          track_registration: boolean
          track_subscribe: boolean
        }[]
      }
      has_active_paid_access: {
        Args: { _audience: string; _user_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      increment_email_variant_clicked: {
        Args: { p_variant_id: string }
        Returns: undefined
      }
      increment_email_variant_opened: {
        Args: { p_variant_id: string }
        Returns: undefined
      }
      increment_email_variant_sent: {
        Args: { p_variant_id: string }
        Returns: undefined
      }
      increment_loan_view: { Args: { _loan_id: string }; Returns: undefined }
      investor_has_full_access: { Args: { _user_id: string }; Returns: boolean }
      investor_offer_teasers: {
        Args: never
        Returns: {
          annual_investor_rate: number
          area_sqm: number
          city: string
          created_at: string
          description: string
          estimated_ltv: number
          estimated_value: number
          id: string
          loan_amount: number
          photos: string[]
          preferred_period_months: number
          property_type: string
          voivodeship: string
        }[]
      }
      is_external_partner: { Args: { _user_id: string }; Returns: boolean }
      is_internal_staff: { Args: { _user_id: string }; Returns: boolean }
      list_public_loan_proposals: {
        Args: never
        Returns: {
          amount: number
          annual_rate: number
          balloon: number
          capped_rata: number
          commission_pct: number
          commission_pln: number
          created_at: string
          id: string
          is_public: boolean
          max_payment: number
          months: number
          nominal_rata: number
          note: string
          schedule: Json
          source_application_id: string
          status: string
          total_cost: number
          total_interest: number
          total_to_repay: number
          updated_at: string
        }[]
      }
      match_text_agent_knowledge: {
        Args: { match_count?: number; query_embedding: string }
        Returns: {
          content: string
          id: string
          similarity: number
          title: string
        }[]
      }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      partner_owns_application: {
        Args: { _application_id: string; _uid: string }
        Returns: boolean
      }
      partner_owns_client: {
        Args: { _client_id: string; _uid: string }
        Returns: boolean
      }
      pl_first_name_canonical: { Args: { _name: string }; Returns: string }
      pl_strip_diacritics: { Args: { _s: string }; Returns: string }
      process_access_payment_paid: {
        Args: {
          _paid_amount_grosz: number
          _payment_id: string
          _provider_transaction_id?: string
        }
        Returns: Json
      }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
      reconcile_object_names: {
        Args: { p_limit: number; p_offset: number }
        Returns: {
          name: string
        }[]
      }
      reconcile_shadow_delete: {
        Args: { p_name: string; p_src_bucket: string }
        Returns: undefined
      }
      reconcile_shadow_upsert: {
        Args: { p_name: string; p_src_bucket: string }
        Returns: boolean
      }
      redeem_operator_invite: { Args: { _token: string }; Returns: Json }
    }
    Enums: {
      aml_case_status:
        | "new"
        | "in_analysis"
        | "awaiting_information"
        | "no_basis_for_report"
        | "suspicion_confirmed"
        | "report_in_preparation"
        | "ready_for_signature"
        | "signed"
        | "submitted"
        | "upo_received"
        | "rejected"
        | "correction_required"
        | "closed"
      aml_giif_connection_status:
        | "not_connected"
        | "registration_in_progress"
        | "csr_generated"
        | "documents_signed"
        | "submitted_to_giif"
        | "certificate_issued"
        | "mtls_verified"
        | "active"
        | "expired"
        | "error"
      aml_hit_resolution:
        | "false_positive"
        | "confirmed_pep"
        | "confirmed_sanction"
        | "confirmed_criminal"
        | "unresolved"
      aml_queue_state:
        | "pending"
        | "in_flight"
        | "retry_scheduled"
        | "delivered"
        | "failed"
        | "cancelled"
      aml_report_status:
        | "draft"
        | "complete"
        | "content_approved"
        | "awaiting_signature"
        | "signed"
        | "encrypted"
        | "queued"
        | "submitted"
        | "status_pending"
        | "accepted"
        | "upo_received"
        | "rejected"
        | "correction_required"
        | "error"
      aml_report_type:
        | "transakcja_ponadprogowa"
        | "okolicznosci_podejrzane"
        | "planowana_transakcja_podejrzana"
        | "transakcja_przeprowadzona"
      aml_risk_level: "low" | "standard" | "high" | "unacceptable"
      aml_screening_status:
        | "not_started"
        | "in_progress"
        | "clear"
        | "review_required"
        | "approved_after_review"
        | "blocked"
        | "error"
        | "invalidated"
      aml_threshold_decision:
        | "reportable"
        | "not_reportable"
        | "verification_required"
        | "report_prepared"
        | "submitted"
        | "accepted"
        | "correction_required"
      aml_transaction_source: "auto" | "manual" | "bank_integration"
      aml_transaction_type:
        | "wyplata_finansowania"
        | "splata_kapitalu"
        | "odsetki"
        | "oplaty"
        | "wplata_gotowkowa"
        | "wyplata_gotowkowa"
        | "przelew_przychodzacy"
        | "przelew_wychodzacy"
        | "inna_operacja"
      app_role:
        | "administrator"
        | "operator"
        | "klient"
        | "inwestor"
        | "ksiegowosc"
        | "operator_wewnetrzny"
        | "posrednik"
      automation_status: "aktywna" | "wstrzymana" | "zakonczona" | "blad"
      consent_kind: "privacy" | "marketing" | "terms" | "terms_investor"
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
        | "oczekuje_podpisania_umowy"
        | "umowa_podpisana"
        | "oczekuje_ustanowienia_zabezpieczen"
        | "zabezpieczenia_ustanowione"
        | "dokumenty_dostarczone_do_inwestora"
        | "oczekuje_wyplaty"
        | "wyplacony"
        | "wniosek_odrzucony"
        | "brak_kontaktu"
        | "brak_kwoty"
        | "kontakt"
        | "kompletowanie_danych"
        | "szukamy_inwestora"
        | "warunki_zaakceptowane"
        | "dokumenty_przygotowanie_umowy"
        | "notariusz"
        | "zamkniete"
        | "brak_kw"
        | "brak_zdjec_dokumentow"
      marketing_audience: "klient" | "inwestor" | "posrednik"
      marketing_media_type: "image" | "video"
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
      wind_borrower_type: "osoba_fizyczna" | "firma"
      wind_case_result:
        | "splacona"
        | "ugoda"
        | "egzekucja_w_toku"
        | "umorzona"
        | "przekazana_karna"
      wind_delivery_status:
        | "oczekuje"
        | "doreczone"
        | "awizowane"
        | "termin_uplynal"
        | "zwrot"
      wind_document_status: "szkic" | "gotowy" | "wyslany"
      wind_document_type:
        | "wezwanie"
        | "wypowiedzenie"
        | "wniosek_klauzula"
        | "wniosek_komornik"
        | "aneks"
        | "porozumienie"
        | "ugoda"
        | "zawiadomienie_286"
        | "zawiadomienie_297"
        | "notatka"
      wind_event_category: "automatyczne" | "manualne" | "systemowe"
      wind_event_type:
        | "sms"
        | "email"
        | "telefon"
        | "pismo_nadane"
        | "pismo_doreczone"
        | "pismo_awizo"
        | "pismo_zwrot"
        | "wplata"
        | "dokument_wygenerowany"
        | "zmiana_etapu"
        | "notatka"
        | "czynnosc_sadowa"
      wind_loan_status:
        | "aktywna"
        | "w_zwloce"
        | "wypowiedziana"
        | "windykacja_komornicza"
        | "splacona"
        | "windykacja_karna"
      wind_path: "miekka" | "standardowa" | "twarda" | "karna"
      wind_priority: "niski" | "sredni" | "wysoki" | "krytyczny"
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
      aml_case_status: [
        "new",
        "in_analysis",
        "awaiting_information",
        "no_basis_for_report",
        "suspicion_confirmed",
        "report_in_preparation",
        "ready_for_signature",
        "signed",
        "submitted",
        "upo_received",
        "rejected",
        "correction_required",
        "closed",
      ],
      aml_giif_connection_status: [
        "not_connected",
        "registration_in_progress",
        "csr_generated",
        "documents_signed",
        "submitted_to_giif",
        "certificate_issued",
        "mtls_verified",
        "active",
        "expired",
        "error",
      ],
      aml_hit_resolution: [
        "false_positive",
        "confirmed_pep",
        "confirmed_sanction",
        "confirmed_criminal",
        "unresolved",
      ],
      aml_queue_state: [
        "pending",
        "in_flight",
        "retry_scheduled",
        "delivered",
        "failed",
        "cancelled",
      ],
      aml_report_status: [
        "draft",
        "complete",
        "content_approved",
        "awaiting_signature",
        "signed",
        "encrypted",
        "queued",
        "submitted",
        "status_pending",
        "accepted",
        "upo_received",
        "rejected",
        "correction_required",
        "error",
      ],
      aml_report_type: [
        "transakcja_ponadprogowa",
        "okolicznosci_podejrzane",
        "planowana_transakcja_podejrzana",
        "transakcja_przeprowadzona",
      ],
      aml_risk_level: ["low", "standard", "high", "unacceptable"],
      aml_screening_status: [
        "not_started",
        "in_progress",
        "clear",
        "review_required",
        "approved_after_review",
        "blocked",
        "error",
        "invalidated",
      ],
      aml_threshold_decision: [
        "reportable",
        "not_reportable",
        "verification_required",
        "report_prepared",
        "submitted",
        "accepted",
        "correction_required",
      ],
      aml_transaction_source: ["auto", "manual", "bank_integration"],
      aml_transaction_type: [
        "wyplata_finansowania",
        "splata_kapitalu",
        "odsetki",
        "oplaty",
        "wplata_gotowkowa",
        "wyplata_gotowkowa",
        "przelew_przychodzacy",
        "przelew_wychodzacy",
        "inna_operacja",
      ],
      app_role: [
        "administrator",
        "operator",
        "klient",
        "inwestor",
        "ksiegowosc",
        "operator_wewnetrzny",
        "posrednik",
      ],
      automation_status: ["aktywna", "wstrzymana", "zakonczona", "blad"],
      consent_kind: ["privacy", "marketing", "terms", "terms_investor"],
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
        "oczekuje_podpisania_umowy",
        "umowa_podpisana",
        "oczekuje_ustanowienia_zabezpieczen",
        "zabezpieczenia_ustanowione",
        "dokumenty_dostarczone_do_inwestora",
        "oczekuje_wyplaty",
        "wyplacony",
        "wniosek_odrzucony",
        "brak_kontaktu",
        "brak_kwoty",
        "kontakt",
        "kompletowanie_danych",
        "szukamy_inwestora",
        "warunki_zaakceptowane",
        "dokumenty_przygotowanie_umowy",
        "notariusz",
        "zamkniete",
        "brak_kw",
        "brak_zdjec_dokumentow",
      ],
      marketing_audience: ["klient", "inwestor", "posrednik"],
      marketing_media_type: ["image", "video"],
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
      wind_borrower_type: ["osoba_fizyczna", "firma"],
      wind_case_result: [
        "splacona",
        "ugoda",
        "egzekucja_w_toku",
        "umorzona",
        "przekazana_karna",
      ],
      wind_delivery_status: [
        "oczekuje",
        "doreczone",
        "awizowane",
        "termin_uplynal",
        "zwrot",
      ],
      wind_document_status: ["szkic", "gotowy", "wyslany"],
      wind_document_type: [
        "wezwanie",
        "wypowiedzenie",
        "wniosek_klauzula",
        "wniosek_komornik",
        "aneks",
        "porozumienie",
        "ugoda",
        "zawiadomienie_286",
        "zawiadomienie_297",
        "notatka",
      ],
      wind_event_category: ["automatyczne", "manualne", "systemowe"],
      wind_event_type: [
        "sms",
        "email",
        "telefon",
        "pismo_nadane",
        "pismo_doreczone",
        "pismo_awizo",
        "pismo_zwrot",
        "wplata",
        "dokument_wygenerowany",
        "zmiana_etapu",
        "notatka",
        "czynnosc_sadowa",
      ],
      wind_loan_status: [
        "aktywna",
        "w_zwloce",
        "wypowiedziana",
        "windykacja_komornicza",
        "splacona",
        "windykacja_karna",
      ],
      wind_path: ["miekka", "standardowa", "twarda", "karna"],
      wind_priority: ["niski", "sredni", "wysoki", "krytyczny"],
    },
  },
} as const
