import "dotenv/config";

import {
  claimProximoPedido,
  processarPedido,
  resetarPedidosTravados,
} from "./lib/processarPedido";

const intervalMs = Number(process.env.WORKER_INTERVAL_MS || 8000);

let running = false;
let ciclo = 0;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function logEnvStatus() {
  console.log("[worker] Verificando variáveis de ambiente...");

  const envs = {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    RESEND_FROM: process.env.RESEND_FROM,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    PUBLIC_APP_URL: process.env.PUBLIC_APP_URL,
    WORKER_INTERVAL_MS: process.env.WORKER_INTERVAL_MS,
  };

  for (const [key, value] of Object.entries(envs)) {
    console.log(`[worker] ${key}: ${value ? "OK" : "FALTANDO"}`);
  }
}

function formatError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  return error;
}

async function executarCiclo() {
  ciclo += 1;

  console.log("--------------------------------------------------");
  console.log(`[worker] Iniciando ciclo #${ciclo}`);
  console.log(`[worker] Horário: ${new Date().toISOString()}`);

  await resetarPedidosTravados();
  console.log("[worker] Pedidos travados verificados/resetados.");

  const pedido = await claimProximoPedido();

  if (!pedido) {
    console.log("[worker] Nenhum pedido pago aguardando processamento.");
    return;
  }

  console.log(`[worker] Pedido encontrado: ${pedido.id}`);
  console.log("[worker] Iniciando processamento do pedido...");

  await processarPedido(pedido);

  console.log(`[worker] Pedido processado com sucesso: ${pedido.id}`);
}

async function loop() {
  console.log("==================================================");
  console.log("[worker] Figurinhas worker iniciado.");
  console.log(`[worker] Intervalo configurado: ${intervalMs}ms`);
  console.log(`[worker] Node.js: ${process.version}`);
  console.log(`[worker] Ambiente: ${process.env.NODE_ENV || "não definido"}`);
  console.log("==================================================");

  logEnvStatus();

  while (true) {
    if (running) {
      console.log("[worker] Ciclo anterior ainda rodando. Aguardando...");
      await sleep(intervalMs);
      continue;
    }

    running = true;

    try {
      await executarCiclo();
    } catch (error) {
      console.error("[worker] Erro no ciclo:", formatError(error));
    } finally {
      running = false;
    }

    console.log(`[worker] Aguardando ${intervalMs}ms para o próximo ciclo...`);
    await sleep(intervalMs);
  }
}

process.on("SIGTERM", () => {
  console.log("[worker] Recebido SIGTERM. Encerrando worker...");
  process.exit(0);
});

process.on("SIGINT", () => {
  console.log("[worker] Recebido SIGINT. Encerrando worker...");
  process.exit(0);
});

process.on("uncaughtException", (error) => {
  console.error("[worker] Erro não capturado:", formatError(error));
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  console.error("[worker] Promise rejeitada sem tratamento:", formatError(reason));
  process.exit(1);
});

loop().catch((error) => {
  console.error("[worker] Erro fatal ao iniciar loop:", formatError(error));
  process.exit(1);
});
