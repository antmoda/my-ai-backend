const express = require('express');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Gemini API конфігурація - правильна модель!
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';

// Функція для перевірки речення
async function checkSentence(text) {
    const prompt = `Ти досвідчений вчитель англійської мови для учнів рівня A2.

Речення учня: "${text}"

Проаналізуй це речення. Якщо є помилки, поясни їх УКРАЇНСЬКОЮ МОВОЮ.
Дай оцінку від 1 до 10.

Формат відповіді ТІЛЬКИ JSON (без додаткового тексту):
{
    "score": (число від 1 до 10),
    "level": "A1/A2/B1",
    "mistakes": ["список помилок простими словами"],
    "corrected": "виправлене речення",
    "explanation": "детальне пояснення українською мовою"
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

        console.log('Отримано відповідь від Gemini');
        
        if (!response.data || !response.data.candidates || !response.data.candidates[0]) {
            throw new Error('Немає відповіді від Gemini');
        }

        const aiResponse = response.data.candidates[0].content.parts[0].text;
        console.log('Gemini відповідь:', aiResponse);
        
        // Знаходимо JSON у відповіді
        const jsonMatch = aiResponse.match(/\{.*\}/s);
        if (jsonMatch) {
            return JSON.parse(jsonMatch[0]);
        } else {
            // Якщо JSON не знайдено, повертаємо простий об'єкт
            return {
                score: 5,
                level: "A2",
                mistakes: ["Не вдалося розпізнати помилки"],
                corrected: text,
                explanation: aiResponse
            };
        }
    } catch (error) {
        console.error('Gemini API помилка детально:', {
            status: error.response?.status,
            data: error.response?.data,
            message: error.message
        });
        throw error;
    }
}

// Ендпоінт для перевірки речення
app.post('/check', async (req, res) => {
    try {
        const { text } = req.body;
        
        if (!text || text.trim().length === 0) {
            return res.json({ 
                score: 1,
                level: "A1",
                mistakes: ["Речення не може бути порожнім"],
                corrected: "",
                explanation: "Будь ласка, введіть речення для перевірки."
            });
        }

        console.log('Отримано речення для перевірки:', text);
        const result = await checkSentence(text);
        res.json(result);

    } catch (error) {
        console.error('Загальна помилка:', error);
        res.json({ 
            score: 5,
            level: "A2",
            mistakes: ["Тимчасові технічні проблеми"],
            corrected: req.body?.text || "",
            explanation: "Вибачте, сталася помилка. Спробуйте ще раз через хвилинку."
        });
    }
});

// Перевірка роботи сервера
app.get('/', (req, res) => {
    res.json({ message: 'AI перевірка речень працює!' });
});

app.listen(PORT, () => {
    console.log(`🚀 Сервер запущено на порту ${PORT}`);
});
