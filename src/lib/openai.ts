
import OpenAI from "openai";
import { toFile } from "openai/uploads";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const openaiApiKey = process.env.OPENAI_API_KEY;
const templateImagePath = fileURLToPath(
  new URL("../assets/figurinha_base.png", import.meta.url),
);

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

async function createTemplateMask() {
  const metadata = await sharp(templateImagePath).metadata();
  const width = metadata.width;
  const height = metadata.height;

  if (!width || !height) {
    throw new Error("Nao foi possivel ler as dimensoes do template base.");
  }

  const editableAreas = [
    // Cabeca + pescoco.
    { x: 235, y: 210, width: 530, height: 610, rx: 240 },
    // Braco/ombro esquerdo.
    { x: 55, y: 650, width: 260, height: 430, rx: 120 },
    // Braco/ombro direito.
    { x: 700, y: 650, width: 210, height: 430, rx: 110 },
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

  const imageFile = await toFile(imageBuffer, "image_b_referencia.png", {
    type: "image/png",
  });

  const maskFile = await toFile(maskBuffer, "mask.png", {
    type: "image/png",
  });

  const prompt = `
Use Image A as the sticker template and preserve it almost exactly.

Image A is the main template. Keep the entire layout unchanged:
- keep the same light blue background
- keep the large green and yellow number
- keep the white mark in the top-right
- keep the Brazil flag icon on the right
- keep the vertical "BRA" letters on the right exactly as they are
- keep the bottom rounded text bars exactly as they are
- keep the shirt colors, logos, collar and body position as close as possible
- do not change the color of the text bars
- do not make any bar black
- do not add, remove, or move any graphic element outside the masked person area
- do not write any text anywhere

Image B is the face reference of the person.

Only edit the masked person area:
1. Fill the missing head/face area using the person from Image B
2. Match the person's face, hair, skin tone and general appearance
3. Blend the head naturally into the existing neck/body
4. Generate natural arms/hands only where the mask allows it
5. Arms must match the existing yellow and green football shirt style
6. Keep the pose natural, front-facing, and compatible with the original template

Very important:
- The right-side "BRA" letters must remain unchanged
- The Brazil flag area must remain unchanged
- Do not edit the bottom text bars
- Do not write the person's name
- Do not write the profession
- Do not write the team
- Do not add any extra letters or words
- Preserve Image A as much as possible outside the masked area
`.trim();

  const result = await openai.images.edit({
    model: "gpt-image-1",
    image: [templateFile, imageFile],
    mask: maskFile,
    prompt,
    input_fidelity: "high",
    quality: "medium",
    size: "1024x1536",
  });

  const base64 = result.data?.[0]?.b64_json;

  if (!base64) {
    throw new Error("OpenAI não retornou imagem em base64.");
  }

  return Buffer.from(base64, "base64");
}
