const express = require('express');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemma-3-27b-it:generateContent';

// Оновлена функція з параметрами часу
async function checkSentence(text, expectedTense = null, sentenceType = null) {
    // Базовий промпт (для сумісності з words.html)
    let prompt = `Ти вчитель англійської мови для рівня A2.

Речення: "${text}"

Поверни ТІЛЬКИ JSON:
{
    "score": (1-10),
    "level": "A1/A2/B1",
    "mistakes": ["список помилок простими словами"],
    "corrected": "виправлене речення",
    "explanation": "пояснення українською мовою"
}`;

    // Якщо передано очікуваний час — використовуємо розширений промпт
if (expectedTense) {
    prompt = `Ти професійний викладач англійської мови.

Речення студента: "${text}"
Очікуваний час: "${expectedTense}"
Очікуваний тип: "${sentenceType || 'positive'}"  (positive/negative/question)

Завдання:

1. Визнач, який граматичний час ФАКТИЧНО використано.
2. Визнач, який тип речення ФАКТИЧНО використано (positive/negative/question).
3. Порівняй з очікуваним часом і типом.
4. Перевір граматику.
5. Оцінка:
   - 10/10: ідеально (час і тип правильні, граматика бездоганна)
   - 8-9/10: час і тип правильні, дрібні помилки
   - 5-7/10: час правильний, тип правильний, але граматичні помилки
   - 1-4/10: час або тип неправильний

Поверни ТІЛЬКИ JSON:
{
    "score": (1-10),
    "level": "A1/A2/B1/B2",
    "detectedTense": "який час знайдено",
    "detectedType": "positive/negative/question",
    "tenseCorrect": true/false,
    "typeCorrect": true/false,
    "mistakes": ["список помилок"],
    "corrected": "виправлене речення",
    "explanation": "пояснення українською мовою"
}`;
}

    try {
        console.log('Надсилаю запит до Gemini...');
        const response = await axios.post(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
            contents: [{
                parts: [{ text: prompt }]
            }],
            generationConfig: { temperature: 0.2 } // зменшуємо випадковість
        });

        console.log('Відповідь отримано');
        const aiResponse = response.data.candidates[0].content.parts[0].text;
        console.log('Відповідь:', aiResponse);
        
        const jsonMatch = aiResponse.match(/\{.*\}/s);
        if (jsonMatch) {
            return JSON.parse(jsonMatch[0]);
        }
        
        // fallback
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
        const { text, expectedTense, sentenceType } = req.body;
        
        if (!text) {
            return res.json({ 
                score: 1,
                level: "A1",
                mistakes: ["Порожнє речення"],
                corrected: "",
                explanation: "Введіть речення"
            });
        }

        // Передаємо параметри (якщо є)
        const result = await checkSentence(text, expectedTense, sentenceType);
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
