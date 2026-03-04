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

async function checkSentence(text, expectedTense = null, sentenceType = null) {
    const prompt = `Ти професійний викладач англійської мови.

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
7. НЕ позначай як помилку правильні займенники (I, you, he, she, it, we, they, my, your, his, her, our, their).
8. Запропонуй виправлений варіант, який відповідає очікуваному часу та типу.

Поверни ТІЛЬКИ JSON без додаткового тексту:
{
    "detectedTense": "назва часу англійською",
    "detectedType": "positive/negative/question",
    "mistakes": ["список помилок українською"],
    "corrected": "виправлене речення для очікуваного часу та типу",
    "explanation": "пояснення українською"
}`;

    try {
        console.log('Надсилаю запит до AI...');
        const response = await axios.post(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
            contents: [{
                parts: [{ text: prompt }]
            }],
            generationConfig: { temperature: 0.2 }
        });

        const aiResponse = response.data.candidates[0].content.parts[0].text;
        console.log('Відповідь AI:', aiResponse);
        
        const jsonMatch = aiResponse.match(/\{.*\}/s);
        if (!jsonMatch) {
            throw new Error('Неправильний формат відповіді AI');
        }
        
        const result = JSON.parse(jsonMatch[0]);
        
        // Додаткова перевірка на випадок, якщо AI не додав помилку про тип
        const tenseCorrect = expectedTense ? (result.detectedTense === expectedTense) : true;
        const typeCorrect = sentenceType ? (result.detectedType === sentenceType) : true;
        
        let score = 10;
        if (!tenseCorrect || !typeCorrect) {
            score = 4;
        } else {
            score = Math.max(5, 10 - (result.mistakes?.length || 0) * 2);
        }
        
        result.score = score;
        result.level = score >= 8 ? 'A2' : (score >= 5 ? 'A2' : 'A1');
        result.tenseCorrect = tenseCorrect;
        result.typeCorrect = typeCorrect;
        
        return result;

    } catch (error) {
        console.error('Помилка AI:', error.response?.data || error.message);
        throw error;
    }
}

// Черга для обробки лімітів (429)
const rateLimitQueue = [];
let isProcessing = false;

async function processQueue() {
    if (isProcessing || rateLimitQueue.length === 0) return;
    isProcessing = true;
    
    const { text, expectedTense, sentenceType, resolve, reject } = rateLimitQueue.shift();
    
    try {
        const result = await checkSentence(text, expectedTense, sentenceType);
        resolve(result);
    } catch (error) {
        if (error.response?.status === 429) {
            setTimeout(() => {
                rateLimitQueue.push({ text, expectedTense, sentenceType, resolve, reject });
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

        const result = await new Promise((resolve, reject) => {
            rateLimitQueue.push({
                text,
                expectedTense,
                sentenceType,
                resolve,
                reject
            });
            processQueue();
        });
        
        res.json(result);

    } catch (error) {
        console.error('Помилка сервера:', error);
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
