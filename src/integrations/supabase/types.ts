export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: '14.5';
  };
  public: {
    Tables: {
      contacts: {
        Row: {
          address: string;
          created_at: string;
          id: string;
          name: string;
          note: string | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          address: string;
          created_at?: string;
          id?: string;
          name: string;
          note?: string | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          address?: string;
          created_at?: string;
          id?: string;
          name?: string;
          note?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      cron_tokens: {
        Row: {
          created_at: string;
          name: string;
          token: string;
        };
        Insert: {
          created_at?: string;
          name: string;
          token: string;
        };
        Update: {
          created_at?: string;
          name?: string;
          token?: string;
        };
        Relationships: [];
      };
      joey_auth_nonces: {
        Row: {
          created_at: string;
          expires_at: string;
          nonce_hash: string;
          requested_domain: string;
          updated_at: string;
          used_at: string | null;
        };
        Insert: {
          created_at?: string;
          expires_at: string;
          nonce_hash: string;
          requested_domain: string;
          updated_at?: string;
          used_at?: string | null;
        };
        Update: {
          created_at?: string;
          expires_at?: string;
          nonce_hash?: string;
          requested_domain?: string;
          updated_at?: string;
          used_at?: string | null;
        };
        Relationships: [];
      };
      platform_events: {
        Row: {
          created_at: string;
          dedupe_key: string | null;
          id: string;
          kind: string;
          network: string;
          signer_key: string;
          tx_hash: string | null;
          xrp_value: number | null;
          usd_value: number;
        };
        Insert: {
          created_at?: string;
          dedupe_key?: string | null;
          id?: string;
          kind: string;
          network: string;
          signer_key: string;
          tx_hash?: string | null;
          xrp_value?: number | null;
          usd_value?: number;
        };
        Update: {
          created_at?: string;
          dedupe_key?: string | null;
          id?: string;
          kind?: string;
          network?: string;
          signer_key?: string;
          tx_hash?: string | null;
          xrp_value?: number | null;
          usd_value?: number;
        };
        Relationships: [];
      };
      probe_events: {
        Row: {
          created_at: string;
          id: string;
          kind: string;
          network: string;
          signer_key: string;
          usd_value: number;
        };
        Insert: {
          created_at?: string;
          id?: string;
          kind: string;
          network: string;
          signer_key: string;
          usd_value?: number;
        };
        Update: {
          created_at?: string;
          id?: string;
          kind?: string;
          network?: string;
          signer_key?: string;
          usd_value?: number;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          created_at: string;
          display_name: string | null;
          id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          display_name?: string | null;
          id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          display_name?: string | null;
          id?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      security_reports: {
        Row: {
          areas: Json;
          changes: Json;
          files_watched: number;
          full_audit: string;
          generated_at: string;
          headline: string;
          manifest: Json;
          report_date: string;
          status: string;
          summary: string;
        };
        Insert: {
          areas?: Json;
          changes?: Json;
          files_watched?: number;
          full_audit?: string;
          generated_at?: string;
          headline: string;
          manifest?: Json;
          report_date: string;
          status: string;
          summary: string;
        };
        Update: {
          areas?: Json;
          changes?: Json;
          files_watched?: number;
          full_audit?: string;
          generated_at?: string;
          headline?: string;
          manifest?: Json;
          report_date?: string;
          status?: string;
          summary?: string;
        };
        Relationships: [];
      };
      wallet_labels: {
        Row: {
          address: string;
          created_at: string;
          id: string;
          name: string;
          provider: string | null;
          removed_at: string | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          address: string;
          created_at?: string;
          id?: string;
          name: string;
          provider?: string | null;
          removed_at?: string | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          address?: string;
          created_at?: string;
          id?: string;
          name?: string;
          provider?: string | null;
          removed_at?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      xrpl_tokens: {
        Row: {
          created_at: string;
          currency: string;
          display_name: string | null;
          holders: number;
          id: string;
          is_active: boolean;
          issuer: string;
          issuer_name: string | null;
          last_synced_at: string;
          logo_url: string | null;
          source: string;
          ticker: string;
          trust_score: number | null;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          currency: string;
          display_name?: string | null;
          holders?: number;
          id?: string;
          is_active?: boolean;
          issuer: string;
          issuer_name?: string | null;
          last_synced_at?: string;
          logo_url?: string | null;
          source?: string;
          ticker: string;
          trust_score?: number | null;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          currency?: string;
          display_name?: string | null;
          holders?: number;
          id?: string;
          is_active?: boolean;
          issuer?: string;
          issuer_name?: string | null;
          last_synced_at?: string;
          logo_url?: string | null;
          source?: string;
          ticker?: string;
          trust_score?: number | null;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      platform_stats_by_network: {
        Args: { activity_network: string };
        Returns: {
          wallets_created: number;
          wallets_activated: number;
          transactions_signed: number;
          value_sent_xrp: number | null;
        }[];
      };
      platform_stats: {
        Args: never;
        Returns: {
          signers: number;
          transactions_signed: number;
          value_sent_usd: number;
          wallets_activated: number;
          wallets_created: number;
        }[];
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

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema['Enums'] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema['CompositeTypes'] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
