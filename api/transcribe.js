import { writeFile, unlink } from "fs/promises";
import fs from "fs";
import path from "path";
import OpenAI from "openai";
import PDFDocument from "pdfkit";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).send("Method Not Allowed");
  }

  try {
    const { targetLanguage, audio } = req.body;

    // Guarda archivo temporal en /tmp (Vercel usa /tmp para archivos)
    const tempAudioPath = path.join("/tmp", `${Date.now()}.mp3`);
    const buffer = Buffer.from(audio.split(",")[1], "base64");
    await writeFile(tempAudioPath, buffer);

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    // Transcripción con Whisper
    const transcription = await openai.audio.transcriptions.create({
      file: fs.createReadStream(tempAudioPath),
      model: "whisper-1",
    });
    const originalText = transcription.text;

    // Traducción con GPT-4o
    const translationResponse = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: "Eres un traductor experto." },
        {
          role: "user",
          content: `Traduce este texto al idioma ${targetLanguage}: "${originalText}"`,
        },
      ],
    });
    const translatedText = translationResponse.choices[0].message.content;

    // Generar PDF en buffer para enviarlo al cliente
    const doc = new PDFDocument();
    const chunks = [];

    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => {
      const pdfBuffer = Buffer.concat(chunks);

      // Enviar PDF como respuesta
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        'attachment; filename="transcription.pdf"'
      );
      res.send(pdfBuffer);
    });

    doc.fontSize(14).text(translatedText, { align: "left" });
    doc.end();

    // Borra el archivo temporal después de generar PDF
    unlink(tempAudioPath).catch(() => {});
  } catch (error) {
    console.error("Error en transcripción/traducción:", error);
    res.status(500).send("Error al procesar el audio");
  }
}