

import sharp from "sharp";
import { supabase, type PedidoFigurinha } from "./supabase";
import { gerarImagemFigurinha } from "./openai";
import { enviarEmailFigurinha } from "./resend";

async function uploadImagemFinal(params: {
  pedidoId: string;
  buffer: Buffer;
}) {
  const path = `geradas/${params.pedidoId}.png`;

  const { error } = await supabase.storage
    .from("figurinhas")
    .upload(path, params.buffer, {
      contentType: "image/png",
      upsert: true,
    });

  if (error) {
    throw error;
  }

  const { data } = supabase.storage.from("figurinhas").getPublicUrl(path);

  return data.publicUrl;
}

async function montarImagemFinal(params: {
  arteBuffer: Buffer;
  pedido: PedidoFigurinha;
}) {
  const nome = String(params.pedido.nome || "JOGADOR").toUpperCase();
  const time = String(params.pedido.time || "BRASIL").toUpperCase();
  const peso = String(params.pedido.peso || "").trim();

  const largura = 1182;
  const altura = 1536;

  const svgOverlay = `
    <svg width="${largura}" height="${altura}" viewBox="0 0 ${largura} ${altura}" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="0" width="${largura}" height="${altura}" fill="none"/>

      <rect x="86" y="1275" width="1010" height="115" rx="42" fill="#0f8b8d" opacity="0.96"/>
      <text x="${largura / 2}" y="1349" text-anchor="middle" font-family="Arial, sans-serif" font-size="58" font-weight="700" fill="#ffffff" letter-spacing="5">
        ${escapeXml(nome)}
      </text>

      <rect x="86" y="1415" width="1010" height="78" rx="28" fill="#0f8b8d" opacity="0.96"/>
      <text x="${largura / 2}" y="1469" text-anchor="middle" font-family="Arial, sans-serif" font-size="42" font-weight="700" fill="#ffffff" letter-spacing="4">
        ${escapeXml(time)}${peso ? ` | ${escapeXml(peso)}` : ""}
      </text>
    </svg>
  `;

  return await sharp(params.arteBuffer)
    .resize(largura, altura, {
      fit: "cover",
      position: "center",
    })
    .composite([
      {
        input: Buffer.from(svgOverlay),
        top: 0,
        left: 0,
      },
    ])
    .png()
    .toBuffer();
}

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

async function marcarErro(pedidoId: string, error: unknown) {
  const message =
    error instanceof Error ? error.message : "Erro desconhecido ao processar pedido.";

  await supabase
    .from("pedidos_figurinhas")
    .update({
      status: "erro",
      erro: message,
      processamento_finalizado_em: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", pedidoId);
}

export async function resetarPedidosTravados() {
  const { error } = await supabase.rpc("reset_pedidos_figurinhas_travados");

  if (error) {
    console.warn("[worker] Erro ao resetar pedidos travados:", error.message);
  }
}

export async function claimProximoPedido() {
  const { data, error } = await supabase.rpc("claim_proximo_pedido_figurinha");

  if (error) {
    throw error;
  }

  return data as PedidoFigurinha | null;
}

export async function processarPedido(pedido: PedidoFigurinha) {
  try {
    if (!pedido.imagem_original_url) {
      throw new Error("Pedido sem imagem_original_url.");
    }

    if (!pedido.email) {
      throw new Error("Pedido sem e-mail.");
    }

    const nome = pedido.nome || "Jogador";

    console.log(`[worker] Gerando arte do pedido ${pedido.id}...`);

    const arteBuffer = await gerarImagemFigurinha({
      imagemOriginalUrl: pedido.imagem_original_url,
      nome,
      time: pedido.time || "Brasil",
      peso: pedido.peso,
    });

    console.log(`[worker] Montando figurinha final ${pedido.id}...`);

    const imagemFinalBuffer = await montarImagemFinal({
      arteBuffer,
      pedido,
    });

    console.log(`[worker] Salvando imagem final ${pedido.id}...`);

    const imagemFinalUrl = await uploadImagemFinal({
      pedidoId: pedido.id,
      buffer: imagemFinalBuffer,
    });

    console.log(`[worker] Enviando e-mail ${pedido.id}...`);

    await enviarEmailFigurinha({
      email: pedido.email,
      nome,
      imagemUrl: imagemFinalUrl,
    });

    const { error: updateError } = await supabase
      .from("pedidos_figurinhas")
      .update({
        status: "enviado",
        imagem_final_url: imagemFinalUrl,
        erro: null,
        processamento_finalizado_em: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", pedido.id);

    if (updateError) {
      throw updateError;
    }

    console.log(`[worker] Pedido ${pedido.id} enviado com sucesso.`);
  } catch (error) {
    console.error(`[worker] Erro no pedido ${pedido.id}:`, error);
    await marcarErro(pedido.id, error);
  }
}
