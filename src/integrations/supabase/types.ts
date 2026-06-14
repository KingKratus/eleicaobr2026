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
      boletins: {
        Row: {
          ano_eleicao: number
          assinatura: string
          assinatura_valida: boolean
          blockchain_chain_id: number | null
          blockchain_explorer_url: string | null
          blockchain_tx: string | null
          comparecimento: number | null
          conteudo_completo: string
          created_at: string
          dt_abertura: string | null
          dt_fechamento: string | null
          eleitores_aptos: number | null
          eleitores_faltosos: number | null
          fase: string
          hash_final: string
          hr_abertura: string | null
          hr_fechamento: string | null
          id: string
          id_carga: string | null
          id_ue: string | null
          modo_teste: boolean
          motivo_rejeicao: string | null
          municipio_nome: string | null
          municipio_num: number
          num_turno: number
          origem: string | null
          pleito: number | null
          proc_eleitoral: number | null
          qr_raw: Json
          secao: number
          sigla_uf: string
          status: string
          user_id: string | null
          validado_em: string | null
          validado_por: string | null
          versao_chave: string
          versao_software: string | null
          votos: Json | null
          zona: number
        }
        Insert: {
          ano_eleicao: number
          assinatura: string
          assinatura_valida?: boolean
          blockchain_chain_id?: number | null
          blockchain_explorer_url?: string | null
          blockchain_tx?: string | null
          comparecimento?: number | null
          conteudo_completo: string
          created_at?: string
          dt_abertura?: string | null
          dt_fechamento?: string | null
          eleitores_aptos?: number | null
          eleitores_faltosos?: number | null
          fase: string
          hash_final: string
          hr_abertura?: string | null
          hr_fechamento?: string | null
          id?: string
          id_carga?: string | null
          id_ue?: string | null
          modo_teste?: boolean
          motivo_rejeicao?: string | null
          municipio_nome?: string | null
          municipio_num?: number
          num_turno?: number
          origem?: string | null
          pleito?: number | null
          proc_eleitoral?: number | null
          qr_raw: Json
          secao: number
          sigla_uf: string
          status?: string
          user_id?: string | null
          validado_em?: string | null
          validado_por?: string | null
          versao_chave: string
          versao_software?: string | null
          votos?: Json | null
          zona: number
        }
        Update: {
          ano_eleicao?: number
          assinatura?: string
          assinatura_valida?: boolean
          blockchain_chain_id?: number | null
          blockchain_explorer_url?: string | null
          blockchain_tx?: string | null
          comparecimento?: number | null
          conteudo_completo?: string
          created_at?: string
          dt_abertura?: string | null
          dt_fechamento?: string | null
          eleitores_aptos?: number | null
          eleitores_faltosos?: number | null
          fase?: string
          hash_final?: string
          hr_abertura?: string | null
          hr_fechamento?: string | null
          id?: string
          id_carga?: string | null
          id_ue?: string | null
          modo_teste?: boolean
          motivo_rejeicao?: string | null
          municipio_nome?: string | null
          municipio_num?: number
          num_turno?: number
          origem?: string | null
          pleito?: number | null
          proc_eleitoral?: number | null
          qr_raw?: Json
          secao?: number
          sigla_uf?: string
          status?: string
          user_id?: string | null
          validado_em?: string | null
          validado_por?: string | null
          versao_chave?: string
          versao_software?: string | null
          votos?: Json | null
          zona?: number
        }
        Relationships: []
      }
      chaves_tse: {
        Row: {
          abrangencia: string
          ano_eleicao: number
          ativo: boolean
          chave_publica_hex: string
          created_at: string
          fase: string
          id: number
          sigla_uf: string
          tipo_eleicao: string
          ultima_sincronizacao: string | null
          updated_at: string
          url_origem: string | null
          valido_ate: string | null
          valido_de: string | null
          versao_chave: string
        }
        Insert: {
          abrangencia?: string
          ano_eleicao: number
          ativo?: boolean
          chave_publica_hex: string
          created_at?: string
          fase: string
          id?: number
          sigla_uf: string
          tipo_eleicao: string
          ultima_sincronizacao?: string | null
          updated_at?: string
          url_origem?: string | null
          valido_ate?: string | null
          valido_de?: string | null
          versao_chave: string
        }
        Update: {
          abrangencia?: string
          ano_eleicao?: number
          ativo?: boolean
          chave_publica_hex?: string
          created_at?: string
          fase?: string
          id?: number
          sigla_uf?: string
          tipo_eleicao?: string
          ultima_sincronizacao?: string | null
          updated_at?: string
          url_origem?: string | null
          valido_ate?: string | null
          valido_de?: string | null
          versao_chave?: string
        }
        Relationships: []
      }
      cobertura: {
        Row: {
          ano_eleicao: number
          fase: string
          id: number
          municipio_nome: string | null
          municipio_num: number
          percentual: number
          sigla_uf: string
          total_bus_validados: number
          total_secoes_estimado: number | null
          updated_at: string
        }
        Insert: {
          ano_eleicao: number
          fase: string
          id?: number
          municipio_nome?: string | null
          municipio_num: number
          percentual?: number
          sigla_uf: string
          total_bus_validados?: number
          total_secoes_estimado?: number | null
          updated_at?: string
        }
        Update: {
          ano_eleicao?: number
          fase?: string
          id?: number
          municipio_nome?: string | null
          municipio_num?: number
          percentual?: number
          sigla_uf?: string
          total_bus_validados?: number
          total_secoes_estimado?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          id: string
          municipio: string | null
          nome: string | null
          uf: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id: string
          municipio?: string | null
          nome?: string | null
          uf?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          municipio?: string | null
          nome?: string | null
          uf?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      totais_cargo: {
        Row: {
          ano_eleicao: number
          candidato_numero: number
          cargo_codigo: number
          fase: string
          id: number
          municipio_num: number | null
          num_turno: number
          sigla_uf: string | null
          total_bus_computados: number
          total_votos: number
          updated_at: string
        }
        Insert: {
          ano_eleicao: number
          candidato_numero: number
          cargo_codigo: number
          fase: string
          id?: number
          municipio_num?: number | null
          num_turno: number
          sigla_uf?: string | null
          total_bus_computados?: number
          total_votos?: number
          updated_at?: string
        }
        Update: {
          ano_eleicao?: number
          candidato_numero?: number
          cargo_codigo?: number
          fase?: string
          id?: number
          municipio_num?: number | null
          num_turno?: number
          sigla_uf?: string | null
          total_bus_computados?: number
          total_votos?: number
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
          role?: Database["public"]["Enums"]["app_role"]
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
      app_role: "colaborador" | "moderador" | "admin"
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
      app_role: ["colaborador", "moderador", "admin"],
    },
  },
} as const
