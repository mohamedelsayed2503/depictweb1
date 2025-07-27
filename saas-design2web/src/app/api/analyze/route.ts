import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { sanitizeInput, logSecurityEvent, getClientIP } from "@/lib/security";

// تعريف متغير البيئة لـ TypeScript
// eslint-disable-next-line no-var
declare var process: {
  env: {
    GEMINI_API_KEY?: string;
  };
};

// Input validation schema
interface AnalyzeRequest {
  prompt: string;
  imageBase64?: string;
  html?: string;
  css?: string;
  js?: string;
}

function validateRequest(data: unknown): data is AnalyzeRequest {
  if (!data || typeof data !== 'object') {
    return false;
  }
  
  if (!data.prompt || typeof data.prompt !== 'string') {
    return false;
  }
  
  if (data.prompt.length > 10000) {
    return false; // Prevent extremely long prompts
  }
  
  if (data.imageBase64 && typeof data.imageBase64 !== 'string') {
    return false;
  }
  
  if (data.imageBase64 && data.imageBase64.length > 10 * 1024 * 1024) {
    return false; // Limit image size to 10MB
  }
  
  return true;
}

export async function POST(req: NextRequest) {
  const clientIP = getClientIP(req);
  
  try {
    // Parse and validate request body
    let requestData;
    try {
      requestData = await req.json();
    } catch (error) {
      logSecurityEvent('INVALID_JSON_REQUEST', { error: error.message }, clientIP);
      return NextResponse.json({ error: "Invalid JSON in request body" }, { status: 400 });
    }
    
    if (!validateRequest(requestData)) {
      logSecurityEvent('INVALID_REQUEST_DATA', { data: requestData }, clientIP);
      return NextResponse.json({ error: "Invalid request data" }, { status: 400 });
    }
    
    const { prompt, imageBase64, html: currentHtml, css: currentCss, js: currentJs } = requestData;
    
    // Sanitize inputs
    const sanitizedPrompt = sanitizeInput(prompt);
    const sanitizedHtml = currentHtml ? sanitizeInput(currentHtml) : undefined;
    const sanitizedCss = currentCss ? sanitizeInput(currentCss) : undefined;
    const sanitizedJs = currentJs ? sanitizeInput(currentJs) : undefined;

    // تحقق من وجود مفتاح Gemini
    if (!process.env.GEMINI_API_KEY) {
      logSecurityEvent('MISSING_API_KEY', {}, clientIP);
      return NextResponse.json({ error: "Service configuration error" }, { status: 500 });
    }

    // إعداد Google Gemini
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    // تجهيز محتوى البرومبت
    let contents;
    
    if (imageBase64) {
      // Case 1: Design analysis with image
      // Validate image format
      if (!imageBase64.match(/^[A-Za-z0-9+/]*={0,2}$/)) {
        logSecurityEvent('INVALID_IMAGE_FORMAT', {}, clientIP);
        return NextResponse.json({ error: "Invalid image format" }, { status: 400 });
      }
      
      contents = [
      {
        role: "user",
        parts: [
          { text: sanitizedPrompt },
          {
            inlineData: {
              mimeType: "image/jpeg",
              data: imageBase64,
            },
          },
        ],
      },
    ];
    } else {
      // Case 2: Code modification without image
      const codeContext = `الكود الحالي:
HTML:
${sanitizedHtml || ''}
CSS:
${sanitizedCss || ''}
JS:
${sanitizedJs || ''}

التعديل المطلوب: ${sanitizedPrompt}
أعطني فقط JSON فيه html و css و js بدون أي شرح أو نص خارجي أو Markdown.`;
      contents = [
        {
          role: "user",
          parts: [
            { text: codeContext },
          ],
        },
      ];
    }

    // استدعاء Gemini
    const response = await ai.models.generateContent({
      model: "models/gemini-2.5-flash", // تم التغيير للموديل المطلوب
      contents,
    });

    // تجهيز الرد بنفس شكل OpenRouter
    const text = response.text || "";

    // Log successful API call (without sensitive data)
    console.log("[Gemini API] Successful response received", {
      responseLength: text.length,
      clientIP,
      timestamp: new Date().toISOString()
    });

  // محاولة استخراج كود HTML وCSS وJS من النص
  let extractedHtml = "", extractedCss = "", extractedJs = "";
  try {
    // أولاً: حاول استخراج JSON
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      extractedHtml = parsed.html || "";
      extractedCss = parsed.css || "";
      extractedJs = parsed.js || "";
    } else {
      // إذا لم يوجد JSON، حاول استخراج كود بين ```
      const htmlMatch = text.match(/```html\s*([\s\S]*?)\s*```/);
      const cssMatch = text.match(/```css\s*([\s\S]*?)\s*```/);
      const jsMatch = text.match(/```javascript\s*([\s\S]*?)\s*```/);
      extractedHtml = htmlMatch ? htmlMatch[1].trim() : "";
      extractedCss = cssMatch ? cssMatch[1].trim() : "";
      extractedJs = jsMatch ? jsMatch[1].trim() : "";
      // إذا لم يوجد CSS منفصل، حاول استخراج <style> من HTML
      if (!extractedCss && extractedHtml) {
        const styleMatch = extractedHtml.match(/<style[^>]*>([\s\S]*?)<\/style>/);
        if (styleMatch) {
          extractedCss = styleMatch[1].trim();
          extractedHtml = extractedHtml.replace(/<style[^>]*>[\s\S]*?<\/style>/g, '');
        }
      }
      // إذا لم يوجد أي شيء، حاول التقاط أول كود JSON أو CSS أو JS كسطر واحد
      if (!extractedHtml && /<html[\s\S]*<\/html>/.test(text)) {
        extractedHtml = text.match(/<html[\s\S]*<\/html>/)?.[0] || "";
      }
      if (!extractedCss && /\.[a-zA-Z0-9_-]+\s*\{[\s\S]*?\}/.test(text)) {
        extractedCss = text.match(/\.[a-zA-Z0-9_-]+\s*\{[\s\S]*?\}/)?.[0] || "";
      }
      if (!extractedJs && /function|const|let|var|=>/.test(text)) {
        extractedJs = text.match(/(function|const|let|var|=>)[\s\S]*/)?.[0] || "";
      }
    }
  } catch (error) {
    extractedHtml = "";
    extractedCss = "";
    extractedJs = "";
  }

  const data = {
      choices: [
        {
          message: {
            content: JSON.stringify({ html: extractedHtml, css: extractedCss, js: extractedJs }),
          },
        },
      ],
    };

    return NextResponse.json(data);
    

  } catch (error: any) {
    // Log error without exposing sensitive information
    logSecurityEvent('API_ERROR', {
      error: error.message || 'Unknown error',
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    }, clientIP);
    
    console.error('[API Error]', {
      message: error.message,
      clientIP,
      timestamp: new Date().toISOString()
    });
    
    // Return generic error message to prevent information disclosure
    return NextResponse.json(
      { error: "An error occurred while processing your request" },
      { status: 500 }
    );
  }
}