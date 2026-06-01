// src/lib/llm.js
// Replaces gemini.js — calls our local FastAPI + Ollama backend.

const BASE_URL = import.meta.env.VITE_LLM_API_URL || 'http://localhost:8000'

async function postJSON(path, body) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || `LLM backend error (${res.status})`)
  }
  return res.json()
}

async function postForm(path, formData) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    body: formData,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || `LLM backend error (${res.status})`)
  }
  return res.json()
}

// 1. Generate interview questions
export async function generateQuestionsLLM({
  title, description, level, num_questions, question_types,
  tech_stack = '', question_focus = [],
}) {
  const data = await postJSON('/api/generate-questions', {
    title, description, level, num_questions, question_types,
    tech_stack, question_focus,
  })
  return data.questions || []
}

// 2. Score open-text answers
export async function scoreOpenAnswersLLM(answers) {
  if (!answers?.length) return []
  const data = await postJSON('/api/score-answers', { answers })
  return data.scores || []
}

// 3. Parse JD PDF
export async function parsePDFLLM(file) {
  const formData = new FormData()
  formData.append('file', file)
  return postForm('/api/parse-pdf', formData)
}