import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";

dotenv.config({
  path: "./server/.env",
});

const app = express();

app.use(cors());
app.use(express.json());

// Verify API key
if (!process.env.GEMINI_API_KEY) {
  console.error("❌ GEMINI_API_KEY not found in server/.env");
  process.exit(1);
}

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

// Health check
app.get("/", (req, res) => {
  res.status(200).send("✅ Backend Running");
});

// AI Copilot
app.post("/api/copilot", async (req, res) => {
  console.log("📨 Request received");

  try {
    const { messages, context } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({
        success: false,
        error: "Messages array is required",
      });
    }

    const conversation = messages
      .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
      .join("\n");

    const prompt = `
You are Nexus AI.

You are an AI assistant for a recruitment platform.

Use the application context when answering.

Application Context:
${JSON.stringify(context || {}, null, 2)}

Conversation:
${conversation}
`;
 const result = await ai.models.generateContent({
  model: "gemini-2.5-flash",
  contents: prompt,
});

console.log("✅ Gemini responded");
console.log("Full Gemini response:");
console.dir(result, { depth: null });

return res.json({
  success: true,
  text: result.text,
});
  } catch (err) {
    console.error("❌ Gemini Error");
    console.error(err);

    return res.status(500).json({
      success: false,
      error: err?.message || "Gemini request failed",
    });
  }
});

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`🚀 Backend running on http://localhost:${PORT}`);
});
