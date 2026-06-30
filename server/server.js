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

console.log("Gemini API Key Loaded:", !!process.env.GEMINI_API_KEY);

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

// Health Check
app.get("/", (req, res) => {
  res.send("✅ Backend Running");
});

// Copilot Endpoint
app.post("/api/copilot", async (req, res) => {
  console.log("📨 Request received");

  try {
    const { messages, context } = req.body;

    const conversation = messages
      .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
      .join("\n");

    const prompt = `
You are Nexus AI, an expert AI Recruiting Copilot.

You help recruiters:
- Analyze resumes
- Compare candidates
- Explain rankings
- Generate interview questions
- Summarize resumes
- Answer questions about hiring

Application Context:
${JSON.stringify(context ?? {}, null, 2)}

Conversation:
${conversation}

Answer professionally.
`;

    console.log("🤖 Calling Gemini...");

    const result = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
    });

    console.log("✅ Gemini responded");

    const text = result.text || "No response generated.";

    res.json({
      success: true,
      text,
    });

  } catch (err) {
    console.error("❌ Gemini Error:");
    console.error(err);

    res.status(500).json({
      success: false,
      error: err.message || "Gemini request failed",
    });
  }
});

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`🚀 Backend running on http://localhost:${PORT}`);
});
