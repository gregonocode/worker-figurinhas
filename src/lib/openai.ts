import OpenAI from "openai";
import { toFile } from "openai/uploads";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const openaiApiKey = process.env.OPENAI_API_KEY;
const templateImageUrl = new URL("../assets/figurinha_base.png", import.meta.url);
const templateImagePath = fileURLToPath(templateImageUrl);

if (!openaiApiKey) {
  throw new Error("OPENAI_API_KEY nao configurada.");
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

async function createTemplateMask() {
  const templateMetadata = await sharp(templateImagePath).metadata();
  const width = templateMetadata.width;
  const height = templateMetadata.height;

  if (!width || !height) {
    throw new Error("Nao foi possivel ler as dimensoes do template base.");
  }

  const editableAreas = [
    // Area vazia da cabeca/rosto.
    { x: 290, y: 360, width: 420, height: 420, rx: 210 },
    // Textos "Nome da pessoa" e "Profissao".
    { x: 80, y: 1170, width: 760, height: 145, rx: 46 },
    // Texto "Time que atua".
    { x: 75, y: 1335, width: 775, height: 75, rx: 34 },
  ];

  const holes = editableAreas
    .map(
      (area) =>
        `<rect x="${area.x}" y="${area.y}" width="${area.width}" height="${area.height}" rx="${area.rx}" ry="${area.rx}" fill="white"/>`,
    )
    .join("");

  const holesSvg = `
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
      ${holes}
    </svg>
  `;

  return await sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    },
  })
    .composite([{ input: Buffer.from(holesSvg), blend: "dest-out" }])
    .png()
    .toBuffer();
}

export async function gerarImagemFigurinha(params: {
  imagemOriginalUrl: string;
  nome: string;
  time: string;
  peso: string | null;
}) {
  const [templateBuffer, imageBuffer, maskBuffer] = await Promise.all([
    sharp(templateImagePath).png().toBuffer(),
    downloadImageAsBuffer(params.imagemOriginalUrl),
    createTemplateMask(),
  ]);

  const templateFile = await toFile(templateBuffer, "image_a_template.png", {
    type: "image/png",
  });

  const referenceFile = await toFile(imageBuffer, "image_b_referencia.png", {
    type: "image/png",
  });

  const maskFile = await toFile(maskBuffer, "mask.png", {
    type: "image/png",
  });

  const profissao = String(params.peso || "Profissao").trim();

  const prompt = `
Use Image A as the main template and preserve its layout as closely as possible.

Image A is the sticker/card template. Keep the same background, composition, proportions, body/clothing position, large green number, right-side vertical text area, bottom rounded text bars, flags, logos, and overall design structure.

Image B is the person's face reference. Replace only the missing head/face area of the character in Image A with a head based on Image B. Match the face, hair, skin tone, and general appearance of the person from Image B. Blend the new head naturally with the neck/body in Image A, keeping the same pose and sticker style.

Replace the template text with the following:
- Main name: "${params.nome}"
- Secondary line: "${profissao}"
- Bottom team line: "${params.time}"

Important instructions:
- Keep the final layout visually almost identical to Image A.
- Do not redesign the card.
- Do not move the shirt/body.
- Do not change the placement of the text bars.
- Do not create a different composition.
- Preserve the background, number, shirt, flags, bottom bars, and full composition.
- Edit only the masked areas: the empty head/face area and the existing text inside the bottom bars.
- The only major visual change should be the new head/face and the updated text.
- Keep the image in the same vertical aspect ratio.
- Render the texts clearly and centered in the same areas shown in Image A.
`.trim();

  const result = await openai.images.edit({
    model: "gpt-image-1",
    image: [templateFile, referenceFile],
    mask: maskFile,
    prompt,
    input_fidelity: "high",
    output_format: "png",
    quality: "high",
    size: "auto",
  });

  const base64 = result.data?.[0]?.b64_json;

  if (!base64) {
    throw new Error("OpenAI nao retornou imagem em base64.");
  }

  return Buffer.from(base64, "base64");
}
