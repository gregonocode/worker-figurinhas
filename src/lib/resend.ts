

import { Resend } from "resend";

const resendApiKey = process.env.RESEND_API_KEY;

if (!resendApiKey) {
  throw new Error("RESEND_API_KEY não configurada.");
}

const resend = new Resend(resendApiKey);

export async function enviarEmailFigurinha(params: {
  email: string;
  nome: string;
  imagemUrl: string;
}) {
  const from = process.env.RESEND_FROM;

  if (!from) {
    throw new Error("RESEND_FROM não configurado.");
  }

  await resend.emails.send({
    from,
    to: params.email,
    subject: "Sua figurinha personalizada chegou! ⚽",
    html: `
      <div style="font-family: Arial, sans-serif; background: #f7f7f7; padding: 24px;">
        <div style="max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 18px; padding: 28px;">
          <h1 style="margin: 0 0 12px; color: #181818;">
            Sua figurinha está pronta! ⚽
          </h1>

          <p style="font-size: 15px; line-height: 1.6; color: #444;">
            Olá, <strong>${params.nome}</strong>. Sua figurinha personalizada já foi gerada.
          </p>

          <div style="margin: 22px 0;">
            <a href="${params.imagemUrl}" style="display: inline-block; background: #16a34a; color: #ffffff; text-decoration: none; padding: 14px 20px; border-radius: 12px; font-weight: bold;">
              Baixar minha figurinha
            </a>
          </div>

          <p style="font-size: 13px; line-height: 1.6; color: #666;">
            Se o botão não abrir, copie e cole este link no navegador:<br />
            <span style="word-break: break-all;">${params.imagemUrl}</span>
          </p>
        </div>
      </div>
    `,
  });
}
