
const express = require("express");
const dotenv = require("dotenv");
const path = require("path");

dotenv.config({ path: path.join(__dirname, ".env") });

const app = express();
app.use(express.json({ limit: "10kb" }));

const apiKey = process.env.GEMINI_API_KEY;

const instructions = `
You are FitMatch, a helpful fitness assistant.

Only answer questions about:
- Sports and exercise
- Fitness and workouts
- General nutrition
- General health related to fitness

If the question is unrelated, politely explain that you only help with fitness-related topics.

Give general educational information only.
Do not diagnose medical conditions.
For serious or urgent symptoms, recommend professional medical help.

Respond in the language used by the user.
Keep answers concise and helpful.
`;

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "..", "index.html"));
});

app.get("/api/status", (req, res) => {
    res.json({ message: "FitMatch Backend is running!" });
});

app.post("/api/chat", async (req, res) => {
    console.log("Chat request received");

    try {
        const { message } = req.body;

        if (typeof message !== "string" || !message.trim()) {
            return res.status(400).json({
                error: "Please enter a message."
            });
        }

        if (message.length > 2000) {
            return res.status(400).json({
                error: "Message is too long."
            });
        }

        if (!apiKey) {
            return res.status(500).json({
                error: "GEMINI_API_KEY is missing from backend/.env"
            });
        }

        console.log("Sending request to Gemini...");

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 25000);

        let response;

        try {
            response = await fetch(
                "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent",
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "x-goog-api-key": apiKey
                    },
                    body: JSON.stringify({
                        systemInstruction: {
                            parts: [{ text: instructions }]
                        },
                        contents: [
                            {
                                role: "user",
                                parts: [{ text: message }]
                            }
                        ],
                        generationConfig: {
                            maxOutputTokens: 400
                        }
                    }),
                    signal: controller.signal
                }
            );
        } finally {
            clearTimeout(timeout);
        }

        const data = await response.json();

        if (!response.ok) {
            console.error("Gemini HTTP status:", response.status);
            console.error("Gemini error:", JSON.stringify(data));

            return res.status(502).json({
                error: `Gemini request failed (HTTP ${response.status}). Check the VS Code Terminal.`
            });
        }

        const reply = data.candidates?.[0]?.content?.parts
            ?.map(part => part.text || "")
            .join("")
            .trim();

        if (!reply) {
            console.error("No text returned:", JSON.stringify(data));

            return res.status(502).json({
                error: "Gemini returned no text. Please try again."
            });
        }

        console.log("Gemini reply received successfully.");

        res.json({ reply });

    } catch (error) {
        console.error("Gemini request error:", error.name, error.message);

        const isTimeout =
            error.name === "AbortError" ||
            error.name === "TimeoutError";

        res.status(isTimeout ? 504 : 500).json({
            error: isTimeout
                ? "تأخر رد Gemini أكثر من 25 ثانية. حاولي مرة ثانية."
                : "تعذّر الاتصال بـ Gemini. راجعي Terminal."
        });
    }
});

app.listen(3000, () => {
    console.log("Server is running on http://localhost:3000");
});
