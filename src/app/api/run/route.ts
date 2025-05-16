// src/app/api/run/route.ts
import { NextRequest, NextResponse } from 'next/server';

// Hardcoded Gemini API key (for demo only; use env vars in production)
const GEMINI_API_KEY = "AIzaSyCUZtOAy4QbIWJzmbliTO3EQQzXKjLPPLg";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    console.log('Received body:', body);

    const { provider, model, method, query } = body;

    if (!provider || !model || !method || query === undefined) {
      return NextResponse.json(
        { error: 'Missing required parameters' },
        { status: 400 }
      );
    }

    if (!GEMINI_API_KEY) {
      return NextResponse.json(
        { error: 'Gemini API key not configured on server' },
        { status: 500 }
      );
    }

    if (provider === 'Gemini') {
      const geminiResponse = await callGemini(model, method, query);
      return NextResponse.json(geminiResponse);
    } else {
      return NextResponse.json(
        { error: `Provider ${provider} not supported` },
        { status: 400 }
      );
    }
  } catch (error: unknown) {
    console.error('API error:', error);
    return NextResponse.json(
      { error: error.message || 'An error occurred' },
      { status: 500 }
    );
  }
}

async function callGemini(model: string, method: string, query: string) {
  const geminiModel = model;

  if (method === 'chat' || method === 'completion') {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: query }] }]
        })
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Gemini API error: ${error.error?.message || response.statusText}`);
    }

    const data = await response.json();
    return {
      response: data.candidates?.[0]?.content?.parts?.[0]?.text || "No response",
      model: geminiModel,
      raw: data
    };
  } else {
    // Placeholder for other methods
    return {
      response: `Method '${method}' would be handled here with query: "${query}"`,
      model: geminiModel
    };
  }
}