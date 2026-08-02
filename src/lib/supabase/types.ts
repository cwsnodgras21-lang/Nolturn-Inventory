export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type Timestamps = {
  created_at: string;
  updated_at: string;
};

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          display_name: string | null;
          email: string | null;
          avatar_url: string | null;
          status: string;
        } & Timestamps;
        Insert: {
          id: string;
          display_name?: string | null;
          email?: string | null;
          avatar_url?: string | null;
          status?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          display_name?: string | null;
          email?: string | null;
          avatar_url?: string | null;
          status?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      organizations: {
        Row: {
          id: string;
          name: string;
          slug: string;
          status: string;
          timezone: string;
          created_by: string | null;
        } & Timestamps;
        Insert: {
          id?: string;
          name: string;
          slug: string;
          status?: string;
          timezone?: string;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          slug?: string;
          status?: string;
          timezone?: string;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      organization_memberships: {
        Row: {
          id: string;
          organization_id: string;
          user_id: string;
          status: string;
          location_access_mode: string;
          invited_at: string | null;
          joined_at: string | null;
        } & Timestamps;
        Insert: {
          id?: string;
          organization_id: string;
          user_id: string;
          status?: string;
          location_access_mode?: string;
          invited_at?: string | null;
          joined_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          user_id?: string;
          status?: string;
          location_access_mode?: string;
          invited_at?: string | null;
          joined_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "organization_memberships_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "organization_memberships_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      locations: {
        Row: {
          id: string;
          organization_id: string;
          name: string;
          code: string | null;
          timezone: string | null;
          status: string;
          address_line_1: string | null;
          address_line_2: string | null;
          city: string | null;
          state_region: string | null;
          postal_code: string | null;
          country_code: string | null;
        } & Timestamps;
        Insert: {
          id?: string;
          organization_id: string;
          name: string;
          code?: string | null;
          timezone?: string | null;
          status?: string;
          address_line_1?: string | null;
          address_line_2?: string | null;
          city?: string | null;
          state_region?: string | null;
          postal_code?: string | null;
          country_code?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          name?: string;
          code?: string | null;
          timezone?: string | null;
          status?: string;
          address_line_1?: string | null;
          address_line_2?: string | null;
          city?: string | null;
          state_region?: string | null;
          postal_code?: string | null;
          country_code?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      units_of_measure: {
        Row: {
          id: string;
          organization_id: string;
          name: string;
          symbol: string;
          dimension: string;
          precision: number;
          unit_kind: string;
          status: string;
          is_system: boolean;
          created_by: string | null;
          name_normalized: string;
          symbol_normalized: string;
        } & Timestamps;
        Insert: {
          id?: string;
          organization_id: string;
          name: string;
          symbol: string;
          dimension: string;
          precision?: number;
          unit_kind: string;
          status?: string;
          is_system?: boolean;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          name?: string;
          symbol?: string;
          dimension?: string;
          precision?: number;
          unit_kind?: string;
          status?: string;
          is_system?: boolean;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "units_of_measure_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      item_categories: {
        Row: {
          id: string;
          organization_id: string;
          parent_id: string | null;
          name: string;
          description: string | null;
          status: string;
          sort_order: number;
          created_by: string | null;
          name_normalized: string;
        } & Timestamps;
        Insert: {
          id?: string;
          organization_id: string;
          parent_id?: string | null;
          name: string;
          description?: string | null;
          status?: string;
          sort_order?: number;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          parent_id?: string | null;
          name?: string;
          description?: string | null;
          status?: string;
          sort_order?: number;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "item_categories_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "item_categories_parent_id_fkey";
            columns: ["parent_id"];
            isOneToOne: false;
            referencedRelation: "item_categories";
            referencedColumns: ["id"];
          },
        ];
      };
      items: {
        Row: {
          id: string;
          organization_id: string;
          name: string;
          description: string | null;
          category_id: string | null;
          base_unit_id: string;
          default_entry_unit_id: string;
          sku: string;
          status: string;
          requires_variant: boolean;
          allow_negative_stock: boolean;
          tracking_mode: string;
          created_by: string | null;
          sku_normalized: string;
          name_normalized: string;
        } & Timestamps;
        Insert: {
          id?: string;
          organization_id: string;
          name: string;
          description?: string | null;
          category_id?: string | null;
          base_unit_id: string;
          default_entry_unit_id: string;
          sku: string;
          status?: string;
          requires_variant?: boolean;
          allow_negative_stock?: boolean;
          tracking_mode?: string;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          name?: string;
          description?: string | null;
          category_id?: string | null;
          base_unit_id?: string;
          default_entry_unit_id?: string;
          sku?: string;
          status?: string;
          requires_variant?: boolean;
          allow_negative_stock?: boolean;
          tracking_mode?: string;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "items_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "items_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "item_categories";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "items_base_unit_id_fkey";
            columns: ["base_unit_id"];
            isOneToOne: false;
            referencedRelation: "units_of_measure";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "items_default_entry_unit_id_fkey";
            columns: ["default_entry_unit_id"];
            isOneToOne: false;
            referencedRelation: "units_of_measure";
            referencedColumns: ["id"];
          },
        ];
      };
      item_variants: {
        Row: {
          id: string;
          organization_id: string;
          item_id: string;
          name: string;
          sku: string | null;
          status: string;
          name_normalized: string;
          sku_normalized: string | null;
        } & Timestamps;
        Insert: {
          id?: string;
          organization_id: string;
          item_id: string;
          name: string;
          sku?: string | null;
          status?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          item_id?: string;
          name?: string;
          sku?: string | null;
          status?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "item_variants_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "item_variants_item_id_fkey";
            columns: ["item_id"];
            isOneToOne: false;
            referencedRelation: "items";
            referencedColumns: ["id"];
          },
        ];
      };
      item_unit_conversions: {
        Row: {
          id: string;
          organization_id: string;
          item_id: string;
          from_unit_id: string;
          to_unit_id: string;
          multiplier: number;
        } & Timestamps;
        Insert: {
          id?: string;
          organization_id: string;
          item_id: string;
          from_unit_id: string;
          to_unit_id: string;
          multiplier: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          item_id?: string;
          from_unit_id?: string;
          to_unit_id?: string;
          multiplier?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "item_unit_conversions_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "item_unit_conversions_item_id_fkey";
            columns: ["item_id"];
            isOneToOne: false;
            referencedRelation: "items";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "item_unit_conversions_from_unit_id_fkey";
            columns: ["from_unit_id"];
            isOneToOne: false;
            referencedRelation: "units_of_measure";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "item_unit_conversions_to_unit_id_fkey";
            columns: ["to_unit_id"];
            isOneToOne: false;
            referencedRelation: "units_of_measure";
            referencedColumns: ["id"];
          },
        ];
      };
      item_identifiers: {
        Row: {
          id: string;
          organization_id: string;
          item_id: string;
          variant_id: string | null;
          identifier_type: string;
          value_display: string;
          value_normalized: string;
          is_primary: boolean;
        } & Timestamps;
        Insert: {
          id?: string;
          organization_id: string;
          item_id: string;
          variant_id?: string | null;
          identifier_type: string;
          value_display: string;
          is_primary?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          item_id?: string;
          variant_id?: string | null;
          identifier_type?: string;
          value_display?: string;
          is_primary?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "item_identifiers_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "item_identifiers_item_id_fkey";
            columns: ["item_id"];
            isOneToOne: false;
            referencedRelation: "items";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "item_identifiers_variant_id_fkey";
            columns: ["variant_id"];
            isOneToOne: false;
            referencedRelation: "item_variants";
            referencedColumns: ["id"];
          },
        ];
      };
      storage_areas: {
        Row: {
          id: string;
          organization_id: string;
          location_id: string;
          parent_id: string | null;
          name: string;
          code: string | null;
          area_type: string;
          status: string;
          sort_order: number;
          created_by: string | null;
          name_normalized: string;
          code_normalized: string | null;
        } & Timestamps;
        Insert: {
          id?: string;
          organization_id: string;
          location_id: string;
          parent_id?: string | null;
          name: string;
          code?: string | null;
          area_type: string;
          status?: string;
          sort_order?: number;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          location_id?: string;
          parent_id?: string | null;
          name?: string;
          code?: string | null;
          area_type?: string;
          status?: string;
          sort_order?: number;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "storage_areas_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "storage_areas_location_id_fkey";
            columns: ["location_id"];
            isOneToOne: false;
            referencedRelation: "locations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "storage_areas_parent_id_fkey";
            columns: ["parent_id"];
            isOneToOne: false;
            referencedRelation: "storage_areas";
            referencedColumns: ["id"];
          },
        ];
      };
      storage_bins: {
        Row: {
          id: string;
          organization_id: string;
          storage_area_id: string;
          name: string;
          code: string | null;
          status: string;
          sort_order: number;
          created_by: string | null;
          name_normalized: string;
          code_normalized: string | null;
        } & Timestamps;
        Insert: {
          id?: string;
          organization_id: string;
          storage_area_id: string;
          name: string;
          code?: string | null;
          status?: string;
          sort_order?: number;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          storage_area_id?: string;
          name?: string;
          code?: string | null;
          status?: string;
          sort_order?: number;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "storage_bins_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "storage_bins_storage_area_id_fkey";
            columns: ["storage_area_id"];
            isOneToOne: false;
            referencedRelation: "storage_areas";
            referencedColumns: ["id"];
          },
        ];
      };
      inventory_transactions: {
        Row: {
          id: string;
          organization_id: string;
          transaction_number: string;
          transaction_type: string;
          status: string;
          notes: string | null;
          reference_text: string | null;
          purchase_order_id: string | null;
          created_by: string | null;
          completed_by: string | null;
          completed_at: string | null;
          reverses_transaction_id: string | null;
          reversed_by_transaction_id: string | null;
        } & Timestamps;
        Insert: {
          id?: string;
          organization_id: string;
          transaction_number?: string;
          transaction_type: string;
          status?: string;
          notes?: string | null;
          reference_text?: string | null;
          purchase_order_id?: string | null;
          created_by?: string | null;
          completed_by?: string | null;
          completed_at?: string | null;
          reverses_transaction_id?: string | null;
          reversed_by_transaction_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          transaction_number?: string;
          transaction_type?: string;
          status?: string;
          notes?: string | null;
          reference_text?: string | null;
          purchase_order_id?: string | null;
          created_by?: string | null;
          completed_by?: string | null;
          completed_at?: string | null;
          reverses_transaction_id?: string | null;
          reversed_by_transaction_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      inventory_transaction_lines: {
        Row: {
          id: string;
          organization_id: string;
          transaction_id: string;
          line_number: number;
          item_id: string;
          variant_id: string | null;
          lot_id: string | null;
          entered_quantity: number;
          entered_unit_id: string;
          conversion_multiplier: number;
          base_quantity: number;
          destination_location_id: string | null;
          destination_storage_area_id: string | null;
          destination_bin_id: string | null;
          source_location_id: string | null;
          source_storage_area_id: string | null;
          source_bin_id: string | null;
          unit_cost: number | null;
          notes: string | null;
          purchase_order_line_id: string | null;
        } & Timestamps;
        Insert: {
          id?: string;
          organization_id: string;
          transaction_id: string;
          line_number: number;
          item_id: string;
          variant_id?: string | null;
          lot_id?: string | null;
          entered_quantity: number;
          entered_unit_id: string;
          conversion_multiplier?: number;
          base_quantity: number;
          destination_location_id?: string | null;
          destination_storage_area_id?: string | null;
          destination_bin_id?: string | null;
          source_location_id?: string | null;
          source_storage_area_id?: string | null;
          source_bin_id?: string | null;
          unit_cost?: number | null;
          notes?: string | null;
          purchase_order_line_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          transaction_id?: string;
          line_number?: number;
          item_id?: string;
          variant_id?: string | null;
          lot_id?: string | null;
          entered_quantity?: number;
          entered_unit_id?: string;
          conversion_multiplier?: number;
          base_quantity?: number;
          destination_location_id?: string | null;
          destination_storage_area_id?: string | null;
          destination_bin_id?: string | null;
          source_location_id?: string | null;
          source_storage_area_id?: string | null;
          source_bin_id?: string | null;
          unit_cost?: number | null;
          notes?: string | null;
          purchase_order_line_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      inventory_ledger_entries: {
        Row: {
          id: string;
          organization_id: string;
          transaction_id: string;
          transaction_line_id: string;
          item_id: string;
          variant_id: string | null;
          lot_id: string | null;
          location_id: string;
          storage_area_id: string;
          bin_id: string | null;
          quantity_delta: number;
          effect_role: string;
          occurred_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          transaction_id: string;
          transaction_line_id: string;
          item_id: string;
          variant_id?: string | null;
          lot_id?: string | null;
          location_id: string;
          storage_area_id: string;
          bin_id?: string | null;
          quantity_delta: number;
          effect_role?: string;
          occurred_at?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          transaction_id?: string;
          transaction_line_id?: string;
          item_id?: string;
          variant_id?: string | null;
          lot_id?: string | null;
          location_id?: string;
          storage_area_id?: string;
          bin_id?: string | null;
          quantity_delta?: number;
          effect_role?: string;
          occurred_at?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      inventory_balances: {
        Row: {
          id: string;
          organization_id: string;
          item_id: string;
          variant_id: string | null;
          lot_id: string | null;
          location_id: string;
          storage_area_id: string;
          bin_id: string | null;
          quantity_on_hand: number;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          item_id: string;
          variant_id?: string | null;
          lot_id?: string | null;
          location_id: string;
          storage_area_id: string;
          bin_id?: string | null;
          quantity_on_hand?: number;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          item_id?: string;
          variant_id?: string | null;
          lot_id?: string | null;
          location_id?: string;
          storage_area_id?: string;
          bin_id?: string | null;
          quantity_on_hand?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      inventory_lots: {
        Row: {
          id: string;
          organization_id: string;
          item_id: string;
          variant_id: string | null;
          lot_number: string;
          expiration_date: string | null;
          status: string;
          notes: string | null;
          created_by: string | null;
        } & Timestamps;
        Insert: {
          id?: string;
          organization_id: string;
          item_id: string;
          variant_id?: string | null;
          lot_number: string;
          expiration_date?: string | null;
          status?: string;
          notes?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          item_id?: string;
          variant_id?: string | null;
          lot_number?: string;
          expiration_date?: string | null;
          status?: string;
          notes?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      inventory_recalls: {
        Row: {
          id: string;
          organization_id: string;
          title: string;
          recall_number: string;
          external_reference: string | null;
          source: string;
          severity: string;
          status: string;
          announced_date: string | null;
          notes: string | null;
          created_by: string | null;
          closed_by: string | null;
          closed_at: string | null;
        } & Timestamps;
        Insert: {
          id?: string;
          organization_id: string;
          title: string;
          recall_number: string;
          external_reference?: string | null;
          source?: string;
          severity?: string;
          status?: string;
          announced_date?: string | null;
          notes?: string | null;
          created_by?: string | null;
          closed_by?: string | null;
          closed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          title?: string;
          recall_number?: string;
          external_reference?: string | null;
          source?: string;
          severity?: string;
          status?: string;
          announced_date?: string | null;
          notes?: string | null;
          created_by?: string | null;
          closed_by?: string | null;
          closed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      inventory_recall_lots: {
        Row: {
          id: string;
          organization_id: string;
          recall_id: string;
          lot_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          recall_id: string;
          lot_id: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          recall_id?: string;
          lot_id?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      count_sessions: {
        Row: {
          id: string;
          organization_id: string;
          name: string;
          status: string;
          blind_count_enabled: boolean;
          notes: string | null;
          created_by: string | null;
          started_by: string | null;
          started_at: string | null;
          completed_by: string | null;
          completed_at: string | null;
        } & Timestamps;
        Insert: {
          id?: string;
          organization_id: string;
          name: string;
          status?: string;
          blind_count_enabled?: boolean;
          notes?: string | null;
          created_by?: string | null;
          started_by?: string | null;
          started_at?: string | null;
          completed_by?: string | null;
          completed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          name?: string;
          status?: string;
          blind_count_enabled?: boolean;
          notes?: string | null;
          created_by?: string | null;
          started_by?: string | null;
          started_at?: string | null;
          completed_by?: string | null;
          completed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      count_session_locations: {
        Row: {
          id: string;
          organization_id: string;
          count_session_id: string;
          location_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          count_session_id: string;
          location_id: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          count_session_id?: string;
          location_id?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      count_lines: {
        Row: {
          id: string;
          organization_id: string;
          count_session_id: string;
          item_id: string;
          variant_id: string | null;
          lot_id: string | null;
          location_id: string;
          storage_area_id: string;
          bin_id: string | null;
          expected_quantity: number;
          counted_quantity: number | null;
          variance: number | null;
          status: string;
          notes: string | null;
          counted_by: string | null;
          counted_at: string | null;
          reviewed_by: string | null;
          reviewed_at: string | null;
          reconciliation_transaction_id: string | null;
        } & Timestamps;
        Insert: {
          id?: string;
          organization_id: string;
          count_session_id: string;
          item_id: string;
          variant_id?: string | null;
          lot_id?: string | null;
          location_id: string;
          storage_area_id: string;
          bin_id?: string | null;
          expected_quantity?: number;
          counted_quantity?: number | null;
          variance?: number | null;
          status?: string;
          notes?: string | null;
          counted_by?: string | null;
          counted_at?: string | null;
          reviewed_by?: string | null;
          reviewed_at?: string | null;
          reconciliation_transaction_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          count_session_id?: string;
          item_id?: string;
          variant_id?: string | null;
          lot_id?: string | null;
          location_id?: string;
          storage_area_id?: string;
          bin_id?: string | null;
          expected_quantity?: number;
          counted_quantity?: number | null;
          variance?: number | null;
          status?: string;
          notes?: string | null;
          counted_by?: string | null;
          counted_at?: string | null;
          reviewed_by?: string | null;
          reviewed_at?: string | null;
          reconciliation_transaction_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      permissions: {
        Row: {
          id: string;
          key: string;
          name: string;
          description: string | null;
          category: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          key: string;
          name: string;
          description?: string | null;
          category: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          key?: string;
          name?: string;
          description?: string | null;
          category?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      roles: {
        Row: {
          id: string;
          organization_id: string;
          key: string;
          name: string;
          description: string | null;
          is_system: boolean;
        } & Timestamps;
        Insert: {
          id?: string;
          organization_id: string;
          key: string;
          name: string;
          description?: string | null;
          is_system?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          key?: string;
          name?: string;
          description?: string | null;
          is_system?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "roles_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      role_permissions: {
        Row: {
          role_id: string;
          permission_id: string;
          created_at: string;
        };
        Insert: {
          role_id: string;
          permission_id: string;
          created_at?: string;
        };
        Update: {
          role_id?: string;
          permission_id?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "role_permissions_role_id_fkey";
            columns: ["role_id"];
            isOneToOne: false;
            referencedRelation: "roles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "role_permissions_permission_id_fkey";
            columns: ["permission_id"];
            isOneToOne: false;
            referencedRelation: "permissions";
            referencedColumns: ["id"];
          },
        ];
      };
      membership_roles: {
        Row: {
          membership_id: string;
          role_id: string;
          created_at: string;
        };
        Insert: {
          membership_id: string;
          role_id: string;
          created_at?: string;
        };
        Update: {
          membership_id?: string;
          role_id?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "membership_roles_membership_id_fkey";
            columns: ["membership_id"];
            isOneToOne: false;
            referencedRelation: "organization_memberships";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "membership_roles_role_id_fkey";
            columns: ["role_id"];
            isOneToOne: false;
            referencedRelation: "roles";
            referencedColumns: ["id"];
          },
        ];
      };
      membership_location_scopes: {
        Row: {
          membership_id: string;
          location_id: string;
          created_at: string;
        };
        Insert: {
          membership_id: string;
          location_id: string;
          created_at?: string;
        };
        Update: {
          membership_id?: string;
          location_id?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "membership_location_scopes_membership_id_fkey";
            columns: ["membership_id"];
            isOneToOne: false;
            referencedRelation: "organization_memberships";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "membership_location_scopes_location_id_fkey";
            columns: ["location_id"];
            isOneToOne: false;
            referencedRelation: "locations";
            referencedColumns: ["id"];
          },
        ];
      };
      audit_events: {
        Row: {
          id: string;
          organization_id: string | null;
          actor_user_id: string | null;
          actor_type: string;
          action: string;
          entity_type: string;
          entity_id: string | null;
          summary: string | null;
          metadata: Json;
          correlation_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id?: string | null;
          actor_user_id?: string | null;
          actor_type?: string;
          action: string;
          entity_type: string;
          entity_id?: string | null;
          summary?: string | null;
          metadata?: Json;
          correlation_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string | null;
          actor_user_id?: string | null;
          actor_type?: string;
          action?: string;
          entity_type?: string;
          entity_id?: string | null;
          summary?: string | null;
          metadata?: Json;
          correlation_id?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      suppliers: {
        Row: {
          id: string;
          organization_id: string;
          name: string;
          status: string;
          email: string | null;
          phone: string | null;
          website: string | null;
          account_number: string | null;
          notes: string | null;
          created_by: string | null;
        } & Timestamps;
        Insert: {
          id?: string;
          organization_id: string;
          name: string;
          status?: string;
          email?: string | null;
          phone?: string | null;
          website?: string | null;
          account_number?: string | null;
          notes?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          name?: string;
          status?: string;
          email?: string | null;
          phone?: string | null;
          website?: string | null;
          account_number?: string | null;
          notes?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      supplier_contacts: {
        Row: {
          id: string;
          organization_id: string;
          supplier_id: string;
          name: string;
          email: string | null;
          phone: string | null;
          title: string | null;
          is_primary: boolean;
          notes: string | null;
        } & Timestamps;
        Insert: {
          id?: string;
          organization_id: string;
          supplier_id: string;
          name: string;
          email?: string | null;
          phone?: string | null;
          title?: string | null;
          is_primary?: boolean;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          supplier_id?: string;
          name?: string;
          email?: string | null;
          phone?: string | null;
          title?: string | null;
          is_primary?: boolean;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      purchase_orders: {
        Row: {
          id: string;
          organization_id: string;
          supplier_id: string;
          po_number: string;
          status: string;
          order_date: string;
          expected_date: string | null;
          ship_to_location_id: string;
          external_reference: string | null;
          notes: string | null;
          created_by: string | null;
          submitted_by: string | null;
          submitted_at: string | null;
          cancelled_by: string | null;
          cancelled_at: string | null;
        } & Timestamps;
        Insert: {
          id?: string;
          organization_id: string;
          supplier_id: string;
          po_number?: string;
          status?: string;
          order_date?: string;
          expected_date?: string | null;
          ship_to_location_id: string;
          external_reference?: string | null;
          notes?: string | null;
          created_by?: string | null;
          submitted_by?: string | null;
          submitted_at?: string | null;
          cancelled_by?: string | null;
          cancelled_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          supplier_id?: string;
          po_number?: string;
          status?: string;
          order_date?: string;
          expected_date?: string | null;
          ship_to_location_id?: string;
          external_reference?: string | null;
          notes?: string | null;
          created_by?: string | null;
          submitted_by?: string | null;
          submitted_at?: string | null;
          cancelled_by?: string | null;
          cancelled_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      purchase_order_lines: {
        Row: {
          id: string;
          organization_id: string;
          purchase_order_id: string;
          line_number: number;
          item_id: string;
          variant_id: string | null;
          ordered_quantity: number;
          purchase_unit_id: string;
          conversion_multiplier: number;
          unit_cost: number | null;
          received_quantity: number;
          remaining_quantity: number;
          notes: string | null;
        } & Timestamps;
        Insert: {
          id?: string;
          organization_id: string;
          purchase_order_id: string;
          line_number: number;
          item_id: string;
          variant_id?: string | null;
          ordered_quantity: number;
          purchase_unit_id: string;
          conversion_multiplier?: number;
          unit_cost?: number | null;
          received_quantity?: number;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          purchase_order_id?: string;
          line_number?: number;
          item_id?: string;
          variant_id?: string | null;
          ordered_quantity?: number;
          purchase_unit_id?: string;
          conversion_multiplier?: number;
          unit_cost?: number | null;
          received_quantity?: number;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      purchase_order_counters: {
        Row: {
          organization_id: string;
          last_number: number;
        };
        Insert: {
          organization_id: string;
          last_number?: number;
        };
        Update: {
          organization_id?: string;
          last_number?: number;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      provision_organization: {
        Args: {
          p_name: string;
          p_timezone?: string;
          p_create_default_location?: boolean;
          p_correlation_id?: string;
        };
        Returns: string;
      };
      complete_inventory_transaction: {
        Args: { p_transaction_id: string };
        Returns: {
          id: string;
          organization_id: string;
          transaction_number: string;
          transaction_type: string;
          status: string;
          notes: string | null;
          created_by: string | null;
          completed_by: string | null;
          completed_at: string | null;
          created_at: string;
          updated_at: string;
        };
      };
      reverse_inventory_transaction: {
        Args: { p_transaction_id: string; p_reason: string };
        Returns: {
          id: string;
          organization_id: string;
          transaction_number: string;
          transaction_type: string;
          status: string;
          notes: string | null;
          created_by: string | null;
          completed_by: string | null;
          completed_at: string | null;
          reverses_transaction_id: string | null;
          reversed_by_transaction_id: string | null;
          created_at: string;
          updated_at: string;
        };
      };
      reconcile_inventory_balances: {
        Args: { p_organization_id: string };
        Returns: {
          item_id: string;
          variant_id: string | null;
          location_id: string;
          storage_area_id: string;
          bin_id: string | null;
          balance_quantity: number;
          ledger_quantity: number;
          difference: number;
        }[];
      };
      rebuild_inventory_balances: {
        Args: { p_organization_id: string };
        Returns: number;
      };
      quarantine_recall_lots: {
        Args: { p_recall_id: string };
        Returns: number;
      };
      start_count_session: {
        Args: { p_session_id: string };
        Returns: Database["public"]["Tables"]["count_sessions"]["Row"];
      };
      submit_count_session_for_review: {
        Args: { p_session_id: string };
        Returns: Database["public"]["Tables"]["count_sessions"]["Row"];
      };
      return_count_session_for_correction: {
        Args: { p_session_id: string };
        Returns: Database["public"]["Tables"]["count_sessions"]["Row"];
      };
      review_count_line: {
        Args: { p_line_id: string; p_decision: string };
        Returns: Database["public"]["Tables"]["count_lines"]["Row"];
      };
      approve_count_session_reconciliation: {
        Args: { p_session_id: string };
        Returns: Database["public"]["Tables"]["count_sessions"]["Row"];
      };
      submit_purchase_order: {
        Args: { p_purchase_order_id: string };
        Returns: Database["public"]["Tables"]["purchase_orders"]["Row"];
      };
      cancel_purchase_order: {
        Args: { p_purchase_order_id: string };
        Returns: Database["public"]["Tables"]["purchase_orders"]["Row"];
      };
      receive_purchase_order: {
        Args: {
          p_purchase_order_id: string;
          p_lines: Json;
          p_notes?: string | null;
          p_reference_text?: string | null;
        };
        Returns: Database["public"]["Tables"]["inventory_transactions"]["Row"];
      };
      current_user_has_active_membership: {
        Args: { p_organization_id: string };
        Returns: boolean;
      };
      current_user_has_permission: {
        Args: { p_organization_id: string; p_permission_key: string };
        Returns: boolean;
      };
      current_user_can_access_location: {
        Args: { p_location_id: string };
        Returns: boolean;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];
