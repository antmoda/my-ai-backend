const express = require('express');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors()); // Дозволяє запити з GitHub Pages
app.use(express.json());

// DeepSeek API конфігурація
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || 'тут_твій_ключ';
const DEEPSEEK_API_URL = 'https://api.deepseek.com/v1/chat/completions';

// Функція для перевірки речення
async function checkSentence(text) {
    const prompt = `Ти досвідчений вчитель англійської мови для учнів рівня A2.

Речення учня: "${text}"

Проаналізуй це речення. Якщо є помилки, поясни їх УКРАЇНСЬКОЮ МОВОЮ. 
Дай оцінку від 1 до 10.

Формат відповіді ТІЛЬКИ JSON:
{
    "score": (число від 1 до 10),
    "level": "A1/A2/B1",
    "mistakes": ["список помилок простими словами"],
    "corrected": "виправлене речення",
    "explanation": "детальне пояснення українською мовою"
}`;

    try {
        const response = await axios.post(DEEPSEEK_API_URL, {
            model: "deepseek-chat",
            messages: [
                { role: "system", content: "Ти вчитель англійської мови. Відповідай ТІЛЬКИ в JSON форматі." },
                { role: "user", content: prompt }
            ],
            temperature: 0.7,
            max_tokens: 500
        }, {
            headers: {
                'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
                'Content-Type': 'application/json'
            }
        });

        // Отримуємо відповідь
        const aiResponse = response.data.choices[0].message.content;
        
        // Спробуємо знайти JSON у відповіді
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
        console.error('DeepSeek API помилка:', error.response?.data || error.message);
        throw error;
    }
}

// Ендпоінт для перевірки речення
app.post('/check', async (req, res) => {
    try {
        const { text } = req.body;
        
        if (!text || text.trim().length === 0) {
            return res.status(400).json({ error: 'Введіть речення' });
        }

        // Обмеження довжини
        if (text.length > 200) {
            return res.status(400).json({ error: 'Речення занадто довге (макс 200 символів)' });
        }

        const result = await checkSentence(text);
        res.json(result);

    } catch (error) {
        console.error('Помилка:', error);
        res.status(500).json({ 
            error: 'Сталася помилка при перевірці',
            score: 5,
            mistakes: ["Спробуйте ще раз пізніше"],
            explanation: "Вибачте, тимчасові технічні проблеми."
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