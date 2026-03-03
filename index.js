const express = require('express');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Gemini API - використовуємо models/gemini-2.5-flash (найновіша)
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent';

async function checkSentence(text) {
    const prompt = `Ти вчитель англійської мови для рівня A2.

Речення: "${text}"

Поверни ТІЛЬКИ JSON:
{
    "score": (1-10),
    "level": "A1/A2/B1",
    "mistakes": ["список помилок простими словами"],
    "corrected": "виправлене речення",
    "explanation": "пояснення українською мовою"
}`;

    try {
        console.log('Надсилаю запит до Gemini...');
        const response = await axios.post(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
            contents: [{
                parts: [{
                    text: prompt
                }]
            }]
        });

        console.log('Відповідь отримано');
        
        const aiResponse = response.data.candidates[0].content.parts[0].text;
        console.log('Відповідь:', aiResponse);
        
        const jsonMatch = aiResponse.match(/\{.*\}/s);
        
        if (jsonMatch) {
            return JSON.parse(jsonMatch[0]);
        }
        
        return {
            score: 5,
            level: "A2",
            mistakes: ["Формат відповіді неправильний"],
            corrected: text,
            explanation: aiResponse
        };
        
    } catch (error) {
        console.error('Помилка Gemini:', error.response?.data || error.message);
        throw error;
    }
}

app.post('/check', async (req, res) => {
    try {
        const { text } = req.body;
        
        if (!text) {
            return res.json({ 
                score: 1,
                level: "A1",
                mistakes: ["Порожнє речення"],
                corrected: "",
                explanation: "Введіть речення"
            });
        }

        const result = await checkSentence(text);
        res.json(result);

    } catch (error) {
        console.error('Помилка:', error);
        res.json({ 
            score: 5,
            level: "A2",
            mistakes: ["Технічні проблеми"],
            corrected: req.body?.text || "",
            explanation: "Спробуйте ще раз через хвилинку"
        });
    }
});

app.get('/', (req, res) => {
    res.json({ message: 'AI перевірка працює!' });
});

app.listen(PORT, () => {
    console.log(`🚀 Сервер на порту ${PORT}`);
});
