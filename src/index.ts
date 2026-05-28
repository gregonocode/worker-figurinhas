
import "dotenv/config";
import {
  claimProximoPedido,
  processarPedido,
  resetarPedidosTravados,
} from "./lib/processarPedido.js";

const intervalMs = Number(process.env.WORKER_INTERVAL_MS || 8000);

let running = false;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function loop() {
  console.log("[worker] Figurinhas worker iniciado.");

  while (true) {
    if (running) {
      await sleep(intervalMs);
      continue;
    }

    running = true;

    try {
      await resetarPedidosTravados();

      const pedido = await claimProximoPedido();

      if (!pedido) {
        console.log("[worker] Nenhum pedido pago aguardando.");
      } else {
        console.log(`[worker] Pedido encontrado: ${pedido.id}`);
        await processarPedido(pedido);
      }
    } catch (error) {
      console.error("[worker] Erro no loop:", error);
    } finally {
      running = false;
    }

    await sleep(intervalMs);
  }
}

loop().catch((error) => {
  console.error("[worker] Erro fatal:", error);
  process.exit(1);
});
