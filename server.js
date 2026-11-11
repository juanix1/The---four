

import express from "express";
import dotenv from "dotenv";
import Groq from "groq-sdk";
import { GoogleGenAI } from "@google/genai";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "20kb" }));
app.use(express.static("public"));

const groq = process.env.GROQ_API_KEY
  ? new Groq({ apiKey: process.env.GROQ_API_KEY })
  : null;

const gemini = process.env.GEMINI_API_KEY
  ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
  : null;

const characters = [
  {
    name: "Alex",
    role: "The logical thinker",
    style: "Use facts, logic and careful analysis. Explain your reasoning clearly."
  },
  {
    name: "Maya",
    role: "The empathetic voice",
    style: "Be warm, emotionally intelligent and thoughtful. Consider people's feelings."
  },
  {
    name: "David",
    role: "The challenger",
    style: "Question assumptions, identify weaknesses and respectfully challenge arguments."
  },
  {
    name: "Sophie",
    role: "The creative thinker",
    style: "Explore unusual possibilities and suggest creative, innovative ideas."
  }
];

async function askGroq(character, transcript, instruction) {
  const response = await groq.chat.completions.create({
    model: "openai/gpt-oss-20b",
    messages: [
      {
        role: "system",
        content: `You are ${character.name}, ${character.role}, in THE FOUR AI discussion room.

Your personality:
${character.style}

Stay in character. Give meaningful, natural responses.
You may disagree respectfully. Do not pretend to be another character.
${instruction}`
      },
      {
        role: "user",
        content: transcript
      }
    ],
    max_tokens: 300
  });

  return response.choices[0].message.content;
}

async function askGemini(character, transcript, instruction) {
  const response = await gemini.models.generateContent({
    model: "gemini-3.8-flash",
    contents: `You are ${character.name}, ${character.role}, in THE FOUR AI discussion room.

Your personality:
${character.style}

Stay in character. Give meaningful, natural responses.
You may disagree respectfully. Do not pretend to be another character.

${instruction}

Conversation:
${transcript}

Now give your contribution.`
  });

  return response.text;
}

async function getReply(character, transcript, instruction) {
  if (groq) {
    try {
      const text = await askGroq(character, transcript, instruction);
      return { text, provider: "Groq" };
    } catch (error) {
      console.error("Groq failed:", error.message);
    }
  }

  if (gemini) {
    try {
      const text = await askGemini(character, transcript, instruction);
      return { text, provider: "Gemini" };
    } catch (error) {
      console.error("Gemini failed:", error.message);
    }
  }

  throw new Error("Both AI providers are unavailable.");
}

app.get("/api/health", (req, res) => {
  res.json({
    status: "online",
    groqConfigured: Boolean(groq),
    geminiConfigured: Boolean(gemini),
    characters: characters.map(c => c.name)
  });
});

app.post("/api/discuss", async (req, res) => {
  try {
    const prompt = typeof req.body.prompt === "string"
      ? req.body.prompt.trim()
      : "";

    const mode = req.body.mode === "debate"
      ? "debate"
      : "discussion";

    if (!prompt || prompt.length > 2000) {
      return res.status(400).json({
        error: "Enter a message between 1 and 2,000 characters."
      });
    }

    const previous = Array.isArray(req.body.history)
      ? req.body.history
          .filter(item =>
            item &&
            typeof item.name === "string" &&
            typeof item.text === "string"
          )
          .slice(-8)
      : [];

    let transcript = previous
      .map(item => `${item.name}: ${item.text}`)
      .join("\n\n");

    transcript += `\n\nUSER: ${prompt}`;

    const rounds = [];
    const totalRounds = mode === "debate" ? 2 : 1;

    for (let round = 1; round <= totalRounds; round++) {
      const replies = [];

      for (const character of characters) {
        let instruction;

        if (mode === "discussion") {
          instruction = round === 1
            ? "Give your own perspective on the user's question. Build on the discussion where useful."
            : "";
        } else if (round === 1) {
          instruction = "Give your opening argument on the user's topic. State your position and explain why.";
        } else {
          instruction = "This is the debate response round. React to the arguments already made. Agree or disagree where appropriate, challenge weak reasoning respectfully, and defend your own position.";
        }

        const result = await getReply(
          character,
          transcript,
          instruction
        );

        const reply = {
          name: character.name,
          role: character.role,
          text: result.text,
          provider: result.provider,
          round
        };

        replies.push(reply);

        transcript += `\n\n${character.name}: ${result.text}`;
      }

      rounds.push({
        round,
        title: mode === "debate"
          ? round === 1 ? "Opening Arguments" : "Challenge and Response"
          : "Group Discussion",
        replies
      });
    }

    res.json({
      mode,
      rounds,
      replies: rounds.flatMap(round => round.replies)
    });

  } catch (error) {
    console.error("Discussion error:", error.message);

    res.status(500).json({
      error: "THE FOUR could not complete the discussion. Check your internet connection, API access and provider limits."
    });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`THE FOUR server running on port ${PORT}`);
});
