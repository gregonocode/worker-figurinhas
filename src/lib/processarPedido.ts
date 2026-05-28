
import sharp from "sharp";
import { supabase, type PedidoFigurinha } from "./supabase.js";
import { gerarImagemFigurinha } from "./openai.js";
import { enviarEmailFigurinha } from "./resend.js";

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
  const metadata = await sharp(params.arteBuffer).metadata();
  const largura = metadata.width;
  const altura = metadata.height;

  if (!largura || !altura) {
    throw new Error("Nao foi possivel ler as dimensoes da arte gerada.");
  }

  const nome = String(params.pedido.nome || "JOGADOR").trim().toUpperCase();
  const profissao = String(params.pedido.profissao || params.pedido.peso || "")
    .trim()
    .toUpperCase();
  const time = String(params.pedido.time || "BRASIL").trim().toUpperCase();

  const svgOverlay = `
    <svg width="${largura}" height="${altura}" viewBox="0 0 1103 1426" xmlns="http://www.w3.org/2000/svg">
      <text x="477" y="1232" text-anchor="middle" font-family="Arial, sans-serif" font-size="${fontSize(nome, 42, 24, 18)}" font-weight="700" fill="#ffffff">
        ${escapeXml(nome)}
      </text>
      <text x="477" y="1288" text-anchor="middle" font-family="Arial, sans-serif" font-size="${fontSize(profissao, 34, 20, 20)}" font-weight="700" fill="#ffffff">
        ${escapeXml(profissao)}
      </text>
      <text x="477" y="1385" text-anchor="middle" font-family="Arial, sans-serif" font-size="${fontSize(time, 40, 22, 20)}" font-weight="700" fill="#ffffff">
        ${escapeXml(time)}
      </text>
    </svg>
  `;

  return await sharp(params.arteBuffer)
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

function fontSize(value: string, base: number, min: number, maxChars: number) {
  if (value.length <= maxChars) {
    return base;
  }

  return Math.max(min, Math.floor((base * maxChars) / value.length));
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

  if (!data || !data.id) {
    return null;
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

    if (pedido.origem !== "dashboard") {
      console.log(`[worker] Enviando e-mail ${pedido.id}...`);

      await enviarEmailFigurinha({
        email: pedido.email,
        nome,
        imagemUrl: imagemFinalUrl,
      });
    } else {
      console.log(
        `[worker] Pedido ${pedido.id} veio da dashboard. E-mail não enviado.`,
      );
    }

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
