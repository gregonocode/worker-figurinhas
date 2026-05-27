

import OpenAI from "openai";
import { toFile } from "openai/uploads";

const openaiApiKey = process.env.OPENAI_API_KEY;

if (!openaiApiKey) {
  throw new Error("OPENAI_API_KEY não configurada.");
}

const openai = new OpenAI({
  apiKey: openaiApiKey,
});

async function downloadImageAsBuffer(url: string) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Erro ao baixar imagem original: ${response.status}`);
  }

  const arrayBuffer = await response.arrayBuffer();

  return Buffer.from(arrayBuffer);
}

export async function gerarImagemFigurinha(params: {
  imagemOriginalUrl: string;
  nome: string;
  time: string;
  peso: string | null;
}) {
  const imageBuffer = await downloadImageAsBuffer(params.imagemOriginalUrl);

  const imageFile = await toFile(imageBuffer, "referencia.png", {
    type: "image/png",
  });

  const prompt = `
Crie uma imagem vertical no estilo de figurinha colecionável de futebol, inspirada em álbum de campeonato mundial.

Use a pessoa da imagem enviada como referência principal de rosto, cabelo, aparência e expressão.
Transforme a pessoa em uma figurinha de futebol com camisa esportiva relacionada a "${params.time}".
A imagem deve parecer uma arte premium de figurinha impressa, com fundo esportivo moderno, iluminação bonita e visual limpo.

IMPORTANTE:
- Não escreva textos na imagem.
- Não coloque nome, peso, altura, data, clube ou seleção em texto.
- Não use marcas oficiais, escudos reais, logos reais ou símbolos protegidos.
- Deixe espaço visual na parte inferior para inserir textos depois.
- Formato vertical, corpo da pessoa centralizado, estilo realista bonito e comercial.
`.trim();

  const result = await openai.images.edit({
    model: "gpt-image-1",
    image: imageFile,
    prompt,
    size: "1024x1536",
  });

  const base64 = result.data?.[0]?.b64_json;

  if (!base64) {
    throw new Error("OpenAI não retornou imagem em base64.");
  }

  return Buffer.from(base64, "base64");
}
