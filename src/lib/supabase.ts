

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
  throw new Error("SUPABASE_URL não configurada.");
}

if (!serviceRoleKey) {
  throw new Error("SUPABASE_SERVICE_ROLE_KEY não configurada.");
}

export const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

export type PedidoFigurinha = {
  id: string;
  tipo: "individual" | "familia";
  email: string;
  nome: string | null;
  time: string | null;
  peso: string | null;
  imagem_original_url: string | null;
  imagem_final_url: string | null;
  status: string;
  tentativas: number | null;
};
