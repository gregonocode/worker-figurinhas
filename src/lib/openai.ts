
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
    { x: 290, y: 360, width: 420, height: 420, rx: 210 },
    { x: 80, y: 1170, width: 760, height: 145, rx: 46 },
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

  const imageFile = await toFile(imageBuffer, "image_b_referencia.png", {
    type: "image/png",
  });

  const maskFile = await toFile(maskBuffer, "mask.png", {
    type: "image/png",
  });

  const prompt = `
Use Image A as the sticker template and preserve it almost exactly.

Image A is the official layout reference and must remain visually the same:
- keep the same light blue background
- keep the large green and yellow "26"
- keep the white "FIFA" mark in the top-right
- keep the Brazil flag icon on the right
- keep the vertical "BRA" letters on the right exactly as they are
- keep the shirt, colors, sleeves, neck opening, logos, and body position
- keep the bottom rounded text bars in the same blue/turquoise color
- do not turn the text bars black
- do not redesign the layout
- do not change the composition
- do not add any extra words or letters anywhere outside the intended text areas

Image B is the face reference of the person.
Use Image B only to generate the person's head/face/hair and blend it naturally into the neck/body of Image A.

Required changes only:
1. Fill the missing head area with the person from Image B
2. Add natural arms/hands if needed, matching the existing shirt and pose
3. Replace the text inside the bottom text bars only

Text to render:
- Main name: "${params.nome}"
- Secondary line: "${params.peso || ""}"
- Bottom line: "${params.time}"

Important constraints:
- The background color behind the text must remain blue/turquoise, not black
- The right-side "BRA" letters must remain unchanged
- The Brazil flag area must remain unchanged
- Do not write any extra text near the flag or on the side
- Do not modify the large number 26
- Do not change the shirt design
- Keep the final image in the same vertical format
- Keep the design as close as possible to Image A
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
