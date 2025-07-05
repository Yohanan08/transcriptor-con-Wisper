import { writeFile, unlink } from 'fs/promises';
import OpenAI from "openai";
import PDFDocument from "pdfkit";

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      return res.status(405).send('Method Not Allowed');
    }

    const { targetLanguage, audio } = req.body;

    const buffer = Buffer.from(audio.split(",")[1], "base64");
    const tempAudioPath = `/tmp/${Date.now()}.mp3`;
    await writeFile(tempAudioPath, buffer);

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const transcription = await openai.audio.transcriptions.create({
      file: require("fs").createReadStream(tempAudioPath),
      model: "whisper-1"
    });
    const originalText = transcription.text;

    const translationResponse = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: "Eres un traductor experto." },
        { role: "user", content: `Traduce este texto al idioma ${targetLanguage}: "${originalText}"` }
      ]
    });
    const translatedText = translationResponse.choices[0].message.content;

    let pdfChunks = [];
    const doc = new PDFDocument();
    doc.on('data', chunk => pdfChunks.push(chunk));
    doc.on('end', () => {
      const pdfBuffer = Buffer.concat(pdfChunks);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename="transcription.pdf"');
      res.send(pdfBuffer);
    });
    doc.fontSize(14).text(translatedText, { align: "left" });
    doc.end();

    await unlink(tempAudioPath);
  } catch (error) {
    console.error(error);
    res.status(500).send('Error al procesar el audio');
  }
}
