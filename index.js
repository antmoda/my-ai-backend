const express = require('express');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
// Використовуємо Gemma 3 (або можна змінити на іншу модель)
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemma-3-27b-it:generateContent';

// Функція для надсилання запиту до AI
async function queryAI(prompt) {
    try {
        const response = await axios.post(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
            contents: [{
                parts: [{ text: prompt }]
            }],
            generationConfig: { temperature: 0.2 }
        });

        const aiResponse = response.data.candidates[0].content.parts[0].text;
        console.log('AI response:', aiResponse);

        const jsonMatch = aiResponse.match(/\{.*\}/s);
        if (!jsonMatch) {
            throw new Error('Invalid JSON response from AI');
        }
        return JSON.parse(jsonMatch[0]);
    } catch (error) {
        console.error('AI query error:', error.response?.data || error.message);
        throw error;
    }
}

// Основна функція перевірки – тепер приймає customPrompt
async function checkSentence(text, expectedTense = null, sentenceType = null, customPrompt = null) {
    let prompt;
    if (customPrompt) {
        // Якщо передано спеціальний промпт – використовуємо його
        prompt = customPrompt;
    } else {
        // Стандартний промпт для речень
        prompt = `Ти професійний викладач англійської мови.

Речення студента: "${text}"
Очікуваний час: ${expectedTense || 'не вказано'}
Очікуваний тип речення: ${sentenceType || 'positive'} (positive/negative/question)

ІНСТРУКЦІЯ (виконуй послідовно):
1. Визнач, який граматичний час ФАКТИЧНО використано.
2. Визнач, який тип речення ФАКТИЧНО використано (positive/negative/question).
3. Порівняй фактичний час і тип з очікуваними.
4. Якщо час не збігається – додай до списку помилок: "Неправильний час. Очікувався ${expectedTense}, а використано {фактичний час}."
5. Якщо тип не збігається – додай до списку помилок: "Неправильний тип речення. Очікувався ${sentenceType}, а використано {фактичний тип}."
6. Знайди всі граматичні помилки (якщо є) і також додай їх.
7. Запропонуй виправлений варіант, який відповідає очікуваному часу та типу.
8. НЕ позначай як помилку правильні займенники (I, you, he, she, it, we, they, my, your, his, her, our, their).
9. Поверни ТІЛЬКИ JSON.

Формат JSON:
{
    "detectedTense": "назва часу англійською",
    "detectedType": "positive/negative/question",
    "tenseCorrect": true/false,
    "typeCorrect": true/false,
    "mistakes": ["список помилок українською"],
    "corrected": "виправлене речення",
    "explanation": "пояснення українською"
}`;
    }

    try {
        const result = await queryAI(prompt);
        // Додаємо поля для сумісності (якщо їх немає)
        if (result.tenseCorrect === undefined) result.tenseCorrect = result.detectedTense === expectedTense;
        if (result.typeCorrect === undefined) result.typeCorrect = result.detectedType === sentenceType;
        // Обчислюємо оцінку
        let score = 10;
        if (!result.tenseCorrect || !result.typeCorrect) {
            score = 4;
        } else {
            score = Math.max(5, 10 - (result.mistakes?.length || 0) * 2);
        }
        result.score = score;
        result.level = score >= 8 ? 'A2' : (score >= 5 ? 'A2' : 'A1');
        return result;
    } catch (error) {
        throw error;
    }
}

// Черга для обробки лімітів (429)
const rateLimitQueue = [];
let isProcessing = false;

async function processQueue() {
    if (isProcessing || rateLimitQueue.length === 0) return;
    isProcessing = true;

    const { text, expectedTense, sentenceType, customPrompt, resolve, reject } = rateLimitQueue.shift();

    try {
        const result = await checkSentence(text, expectedTense, sentenceType, customPrompt);
        resolve(result);
    } catch (error) {
        if (error.response?.status === 429) {
            // Ліміт – повертаємо в чергу з затримкою
            setTimeout(() => {
                rateLimitQueue.push({ text, expectedTense, sentenceType, customPrompt, resolve, reject });
                isProcessing = false;
                processQueue();
            }, 10000);
        } else {
            reject(error);
        }
    } finally {
        isProcessing = false;
        setTimeout(processQueue, 1000);
    }
}

app.post('/check', async (req, res) => {
    try {
        const { text, expectedTense, sentenceType, customPrompt } = req.body;

        if (!text && !customPrompt) {
            return res.json({
                score: 1,
                level: "A1",
                mistakes: ["Порожній запит"],
                corrected: "",
                explanation: "Введіть речення або передайте промпт"
            });
        }

        const result = await new Promise((resolve, reject) => {
            rateLimitQueue.push({
                text,
                expectedTense,
                sentenceType,
                customPrompt,
                resolve,
                reject
            });
            processQueue();
        });

        res.json(result);
    } catch (error) {
        console.error('Server error:', error);
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
