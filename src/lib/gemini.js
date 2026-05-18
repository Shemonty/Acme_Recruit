import { GoogleGenerativeAI } from "@google/generative-ai"

const genAI = new GoogleGenerativeAI(import.meta.env.VITE_GEMINI_API_KEY)

export const geminiModel = genAI.getGenerativeModel({ model: "gemini-2.0-flash" })