"use client";

import React, { useRef, useState, useEffect, useCallback, memo } from "react";
import Image from "next/image";
import JSZip from "jszip";
import { saveAs } from "file-saver";
// import { Rnd } from "react-rnd";
import { auth, db } from "@/lib/firebase";
import { useRouter } from "next/navigation";
import { doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
import type { Auth } from "firebase/auth";
import type { Firestore } from "firebase/firestore";
import { motion, AnimatePresence } from "framer-motion";
import { signOut } from "firebase/auth";
// Placeholder for detected image areas (to be replaced by AI results)
type DetectedImageArea = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  filename?: string;
  uploadedUrl?: string;
};

type BoundingBox = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  uploadedUrl?: string;
  filename?: string;
};

function getMousePos(e: React.MouseEvent, imgRect: DOMRect, zoom: number) {
  return {
    x: (e.clientX - imgRect.left) / zoom,
    y: (e.clientY - imgRect.top) / zoom,
  };
}

// Separate memoized preview component
const MemoizedPreview = memo(({ html, css, js, boundingBoxes }: { 
  html: string; 
  css: string; 
  js: string; 
  boundingBoxes: BoundingBox[] 
}) => {
  // تنظيف كود الـ CSS من علامات اقتباس أو فواصل أو newlines زائدة
  let previewCss = (css || "").trim();
  if (previewCss.startsWith('"') && previewCss.endsWith('"')) {
    previewCss = previewCss.slice(1, -1);
  }
  previewCss = previewCss.replace(/\\n/g, '\n').replace(/\\"/g, '"');

  // تنظيف كود الـ HTML
  let previewHtml = (html || "").trim();
  if (previewHtml.startsWith('"') && previewHtml.endsWith('"')) {
    previewHtml = previewHtml.slice(1, -1);
  }
  previewHtml = previewHtml.replace(/\\n/g, '\n').replace(/\\"/g, '"');

  // تنظيف كود الـ JavaScript
  let previewJs = (js || "").trim();
  if (previewJs.startsWith('"') && previewJs.endsWith('"')) {
    previewJs = previewJs.slice(1, -1);
  }
  previewJs = previewJs.replace(/\\n/g, '\n').replace(/\\"/g, '"');

  // 1. استخرج محتوى <body> فقط إذا كان موجوداً (للعرض داخل iframe)
  let htmlBody = previewHtml;
  const bodyMatch = previewHtml.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  if (bodyMatch) {
    htmlBody = bodyMatch[1];
  }

  // 2. استبدل الصور المرفوعة وأضف أبعادها حسب الترتيب
let imgIndex = 0;
htmlBody = htmlBody.replace(/<img[^>]*>/g, (match) => {
  if (imgIndex < boundingBoxes.length) {
    const box = boundingBoxes[imgIndex];
    if (box.uploadedUrl) {
      imgIndex++;
      return match
        .replace(/src=["'][^"']*["']/, `src="${box.uploadedUrl}"`) // استبدال مصدر الصورة
        .replace(/style=["'][^"']*["']/, '') // إزالة أي ستايل موجود
        .replace(/>$/, ` style="width: ${Math.round(box.width)}px; height: ${Math.round(box.height)}px; object-fit: cover;">`) // إضافة الأبعاد
        .replace(/alt=["'][^"']*["']/, `alt="${box.label}"`) ; // تحديث النص البديل
    }
  }
  return match;
});

  // 3. جهز كود الـ iframe مع إضافة أنماط CSS للصور والتصميم المتجاوب
  const iframeSrcDoc = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          /* Reset and base styles for responsive design */
          * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
          }
          
          html {
            font-size: 16px;
            line-height: 1.5;
          }
          
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            margin: 0;
            padding: 0;
            overflow-x: hidden;
            word-wrap: break-word;
          }
          
          /* Responsive image handling */
          img { 
            max-width: 100%; 
            height: auto;
            display: block; 
          }
          
          img[style*="object-fit"] { 
            object-position: center; 
          }
          
          /* Ensure responsive containers */
          .container, [class*="container"], [class*="wrapper"] {
            width: 100%;
            max-width: 100%;
            padding-left: 1rem;
            padding-right: 1rem;
            margin: 0 auto;
          }
          
          /* Responsive typography */
          h1, h2, h3, h4, h5, h6 {
            word-wrap: break-word;
            overflow-wrap: break-word;
          }
          
          /* Responsive tables */
          table {
            width: 100%;
            max-width: 100%;
            overflow-x: auto;
            display: block;
          }
          
          /* Responsive iframe/video */
          iframe, video {
            max-width: 100%;
            height: auto;
          }
          
          /* Custom CSS from AI */
          ${previewCss}
          
          /* Additional responsive utilities */
          @media (max-width: 768px) {
            .container, [class*="container"], [class*="wrapper"] {
              padding-left: 0.5rem;
              padding-right: 0.5rem;
            }
          }
        </style>
      </head>
      <body>
        ${htmlBody}
        <script>
          ${previewJs || ''}
          
          // Responsive design enhancements
          document.addEventListener('DOMContentLoaded', () => {
            // Handle responsive images
            document.querySelectorAll('img').forEach(img => {
              img.onerror = () => {
                console.error('Failed to load image:', img.src);
                img.style.border = '2px dashed red';
                img.style.backgroundColor = '#fee';
                img.style.padding = '8px';
                img.alt = 'Failed to load image';
              };
              img.onload = () => {
                console.log('Successfully loaded image:', img.src);
              };
            });
            
            // Ensure responsive behavior
            const resizeObserver = new ResizeObserver(entries => {
              entries.forEach(entry => {
                const element = entry.target;
                if (element.tagName === 'IMG') {
                  element.style.maxWidth = '100%';
                  element.style.height = 'auto';
                }
              });
            });
            
            // Observe all images for responsive behavior
            document.querySelectorAll('img').forEach(img => {
              resizeObserver.observe(img);
            });
            
            // Handle responsive containers
            document.querySelectorAll('.container, [class*="container"], [class*="wrapper"]').forEach(container => {
              if (!container.style.maxWidth) {
                container.style.maxWidth = '100%';
              }
            });
          });
        <\/script>
      </body>
    </html>
  `;

  // 4. استخدم iframe لعرض المعاينة
  return (
    <iframe
      style={{ 
        width: '100%', 
        minHeight: 800, 
        border: 'none', 
        background: '#fff',
        contain: 'layout style paint',
        isolation: 'isolate'
      }}
      srcDoc={iframeSrcDoc}
      sandbox="allow-scripts allow-same-origin"
      title="Live Preview"
    />
  );
});

MemoizedPreview.displayName = 'MemoizedPreview';

const EditPrompt = memo(({ onSubmit, loading, currentVersionIndex, isFinalDesignSelected }: {
  onSubmit: (prompt: string) => void;
  loading: boolean;
  currentVersionIndex: number;
  isFinalDesignSelected: boolean;
}) => {
  const [localPrompt, setLocalPrompt] = useState('');
  const isDisabled = loading || !localPrompt || currentVersionIndex === -1 || isFinalDesignSelected;
  return (
    <div className="flex gap-4">
      <textarea
        value={localPrompt}
        onChange={e => setLocalPrompt(e.target.value)}
        placeholder="Enter your modification prompt (e.g., make the button larger, change background color, improve mobile responsiveness, adjust spacing between elements, make it more responsive for tablets...)"
        className="flex-1 px-5 py-3 bg-purple-900/70 border border-purple-600 rounded-2xl text-white placeholder-purple-300 focus:outline-none focus:ring-4 focus:ring-purple-500 focus:border-transparent"
        rows={3}
        style={{
          willChange: 'auto',
          contain: 'layout style paint',
          isolation: 'isolate',
          transform: 'translateZ(0)',
          backfaceVisibility: 'hidden',
          transition: 'none'
        }}
      />
      <button
        onClick={() => {
          if (!isDisabled) {
            onSubmit(localPrompt);
          }
        }}
        disabled={isDisabled}
        className={`px-8 py-3 rounded-2xl font-bold text-lg shadow-2xl transition-all duration-300 transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed ${isFinalDesignSelected ? "bg-gradient-to-r from-gray-400 to-gray-600 text-white shadow-gray-500/30" : "bg-gradient-to-r from-pink-500 to-purple-600 text-white shadow-pink-500/30 hover:shadow-pink-500/50"}`}
      >
        {loading ? (
          <span className="flex items-center gap-2">
            <svg className="w-5 h-5 animate-spin" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
            </svg>
            Analyzing...
          </span>
        ) : isFinalDesignSelected ? (
          <span className="flex items-center gap-2">
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
            </svg>
            Final Design Selected
          </span>
        ) : (
          <span className="relative z-10">Analyze Modification</span>
        )}
      </button>
    </div>
  );
});

EditPrompt.displayName = 'EditPrompt';

const fadeInUp = {
  hidden: { opacity: 0, y: 40 },
  visible: { opacity: 1, y: 0 }
};

const errorVariants = {
  hidden: { opacity: 0, y: -20 },
  visible: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -20, transition: { duration: 0.3 } }
};

export default function Design2WebApp() {
  const router = useRouter();
  const [usageExceeded, setUsageExceeded] = useState(false);
  const [firebaseReady, setFirebaseReady] = useState(true);

  useEffect(() => {
    const authInstance: Auth | undefined = auth;
    const dbInstance: Firestore | undefined = db;
    if (!authInstance || !dbInstance) {
      setFirebaseReady(false);
      setError("فشل الاتصال بـ Firebase. يرجى إعادة تحميل الصفحة أو التأكد من الاتصال بالإنترنت.");
      return;
    } else {
      setFirebaseReady(true);
    }
    const unsubscribe = authInstance.onAuthStateChanged(async (user) => {
      if (!user) {
        router.push("/home");
        return;
      }
      try {
        // Check daily usage
        const today = new Date().toISOString().split('T')[0];
        const userDocRef = doc(dbInstance, 'users', user.uid);
        let userDoc;
        let retries = 3;
        while (retries > 0) {
          try {
            userDoc = await getDoc(userDocRef);
            break;
          } catch (err) {
            if (err.code === 'unavailable') {
              retries--;
              await new Promise(resolve => setTimeout(resolve, 1000));
            } else {
              throw err;
            }
          }
        }
        if (userDoc && userDoc.exists()) {
          const data = userDoc.data();
          if (data.last_date === today) {
            if (data.count >= 3) {
              setUsageExceeded(true);
            }
          } else {
            // Reset for new day
            await setDoc(userDocRef, { last_date: today, count: 0 }, { merge: true });
          }
        } else {
          // Create new document or handle failure
          try {
            await setDoc(userDocRef, { last_date: today, count: 0 });
          } catch (error) {
            setUsageExceeded(true); // Assume exceeded if can't create
          }
        }
      } catch (error) {
        if (error.code === 'unavailable') {
          setError('You appear to be offline. Please check your internet connection.');
        }
        // Optionally set an error state or notify user
      }
    });
    return () => unsubscribe();
  }, [router]);
  async function incrementUsage() {
    const authInstance: Auth | undefined = auth;
    const dbInstance: Firestore | undefined = db;
    if (!authInstance || !dbInstance) {
      setFirebaseReady(false);
      setError("فشل الاتصال بـ Firebase. يرجى إعادة تحميل الصفحة أو التأكد من الاتصال بالإنترنت.");
      return false;
    }
    const user = authInstance.currentUser;
    if (!user) return false;
    const today = new Date().toISOString().split('T')[0];
    const userDocRef = doc(dbInstance, 'users', user.uid);
    let userDoc;
    let retries = 3;
    while (retries > 0) {
      try {
        userDoc = await getDoc(userDocRef);
        break;
      } catch (err) {
        if (err.code === 'unavailable') {
          retries--;
          await new Promise(resolve => setTimeout(resolve, 1000));
        } else {
          throw err;
        }
      }
    }
    if (!userDoc) {
      return false;
    }
    if (userDoc.exists()) {
      const data = userDoc.data();
      if (data.last_date === today) {
        if (data.count >= 3) {
          setUsageExceeded(true);
          return false;
        }
        await updateDoc(userDocRef, { count: data.count + 1 });
      } else {
        await setDoc(userDocRef, { last_date: today, count: 1 }, { merge: true });
      }
      return true;
    }
    return false;
  }
  const [image, setImage] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [zoom, setZoom] = useState(1);
  const [analyzed, setAnalyzed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generatedCode, setGeneratedCode] = useState<{ html: string; css: string; js: string } | null>(null);
  const [customPrompt, setCustomPrompt] = useState<string>("");
  const [codeVersions, setCodeVersions] = useState<{ html: string; css: string; js: string }[]>([]);
  const [currentVersionIndex, setCurrentVersionIndex] = useState<number>(-1);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [boundingBoxes, setBoundingBoxes] = useState<BoundingBox[]>([]);
  const [drawing, setDrawing] = useState(false);
  const [startPos, setStartPos] = useState<{ x: number; y: number } | null>(null);
  const [activeBoxId, setActiveBoxId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number } | null>(null);
  const [boxLabelCounter, setBoxLabelCounter] = useState(1);
  const [adjustments, setAdjustments] = useState<{ [key: string]: { x: number; y: number; width: number; height: number } }>(
    {}
  );
  const [comparisonOpacity, setComparisonOpacity] = useState(0.5);
  const [noImagesDesign, setNoImagesDesign] = useState(false);
  const [isFinalDesignSelected, setIsFinalDesignSelected] = useState(false);
  const [selectedVersionForDownload, setSelectedVersionForDownload] = useState<number>(-1);
  
  // Animation states
  const [arrowHoverLeft, setArrowHoverLeft] = useState(false);
  const [arrowHoverRight, setArrowHoverRight] = useState(false);

  // Animation functions
  const handleArrowHover = useCallback((side: 'left' | 'right', isHovering: boolean) => {
    if (side === 'left') {
      setArrowHoverLeft(isHovering);
    } else {
      setArrowHoverRight(isHovering);
    }
  }, []);

  const handleVersionChange = useCallback((direction: 'prev' | 'next') => {
    if (direction === 'prev') {
      setCurrentVersionIndex(i => Math.max(i - 1, 0));
    } else {
      setCurrentVersionIndex(i => Math.min(i + 1, codeVersions.length - 1));
    }
  }, [codeVersions.length]);

  // Effect to update preview when uploaded images change
  useEffect(() => {
    if (generatedCode && boundingBoxes.length > 0) {
      // Force re-render of preview when images are uploaded
      const timer = setTimeout(() => {
        const iframe = document.querySelector('iframe');
        if (iframe && iframe.contentDocument) {
          boundingBoxes.forEach(box => {
            if (box.filename && box.uploadedUrl) {
              const images = iframe.contentDocument.querySelectorAll('img');
              images.forEach(img => {
                const imgElement = img as HTMLImageElement;
                if (imgElement.src.includes(box.filename)) {
                  imgElement.src = box.uploadedUrl!;
                  imgElement.style.width = `${Math.round(box.width)}px`;
                  imgElement.style.height = `${Math.round(box.height)}px`;
                  imgElement.style.objectFit = 'cover';
                  imgElement.onerror = () => {
                    imgElement.style.border = '2px dashed red';
                    imgElement.style.backgroundColor = '#fee';
                    imgElement.alt = `Failed to load: ${box.filename}`;
                  };
                  imgElement.onload = () => {
                  };
                }
              });
            }
          });
        }
      }, 100);
    
      return () => clearTimeout(timer);
    }
  }, [boundingBoxes, generatedCode]);

  async function handleAnalyzeModification(modificationRequest: string) {
    if (loading || !modificationRequest || currentVersionIndex === -1) return;

    setLoading(true);
    setError(null);
    setRawAIResponse("");

    try {
      const currentCode = codeVersions[currentVersionIndex];
      if (!currentCode) {
        throw new Error("No current code version available for modification.");
      }

      const modificationPrompt = `You are a world-class expert in responsive, pixel-perfect web design. Your task is to analyze the provided HTML, CSS, and JavaScript code, and then apply the following modification: "${modificationRequest}". Generate production-ready, fully responsive, mobile-first HTML, CSS, and JavaScript code that incorporates this modification.\n\n**Critical requirements:**

1. **Maintain Structure & Layout:**
   - Keep the existing layout and structure, only apply the requested modification
   - Preserve the visual hierarchy and element relationships
   - Maintain the original spacing and positioning system
   - Do not break existing responsive behavior

2. **Responsive Design Enhancement:**
   - The generated code must be fully responsive and look perfect on all screen sizes (desktop, tablet, mobile)
   - Use mobile-first approach with proper breakpoints: mobile (320px+), tablet (768px+), desktop (1024px+)
   - Ensure content adapts smoothly across all screen sizes
   - No horizontal overflow or cramped content on any device
   - Use modern CSS techniques: flexbox, grid, clamp(), min(), max(), container queries

3. **Spacing & Layout Consistency:**
   - Maintain consistent spacing between elements as in the original design
   - Preserve the visual balance and composition
   - Use CSS Grid gap, Flexbox gap, and proper margin/padding values
   - Ensure proper whitespace and breathing room between sections
   - Keep the same alignment (left, center, right) as the original

4. **Element Positioning & Sizing:**
   - Maintain exact positioning of elements relative to each other
   - Preserve aspect ratios and proportions
   - Scale elements proportionally across breakpoints
   - Use object-fit appropriately for images
   - Ensure proper touch targets for interactive elements (min 44px)

5. **Modern CSS Techniques:**
   - Use CSS Grid for complex layouts and alignment
   - Use Flexbox for component-level layouts
   - Use CSS Container Queries for component-based responsive design
   - Implement fluid typography with clamp() for text scaling
   - Use CSS custom properties (variables) for consistent spacing
   - Use relative units (rem, em, %, vw, vh) for responsive sizing

6. **Clean Code & Performance:**
   - Use modern CSS techniques (media queries, flexbox, grid, clamp, etc.) to ensure the layout adapts smoothly
   - Optimize for performance with efficient CSS
   - Use semantic HTML elements
   - Implement proper focus states for interactive elements
   - Ensure proper color contrast ratios

7. **No Breaking Changes:**
   - Ensure the modification doesn't break existing functionality
   - Maintain accessibility features
   - Preserve existing interactive behaviors
   - Keep the same visual design language

8. **Cross-Browser Compatibility:**
   - Use modern CSS with proper fallbacks
   - Ensure graceful degradation
   - Test layout on different browsers

**Output format - Return ONLY this JSON object, no other text:**
{
  "html": "Full HTML code only, no <style> or <script> tags, no inline CSS or JS.",
  "css": "Full CSS code only, no HTML or JS. Must include all responsive rules and breakpoints.",
  "js": "Full JavaScript code only, if needed for interactivity (empty string if not needed)."
}

**CRITICAL:** Return ONLY the JSON object above. Do NOT include any explanations, Markdown, or extra text. The JSON must be valid and parseable.`;
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: modificationRequest,
          html: currentCode.html,
          css: currentCode.css,
          js: currentCode.js,
        }),
      });

      if (!res.ok) throw new Error("AI code modification failed");
      const data = await res.json();

      const text = data.choices?.[0]?.message?.content || "";
      setRawAIResponse(text);

      let code: { html: string; css: string; js: string } | null = null;
      try {
        console.log("Raw AI response:", text);
        
        // First, try to find JSON format
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          let jsonStr = jsonMatch[0];
  
          
          // Clean the JSON string - be more careful with escaping
          jsonStr = jsonStr.replace(/\\n/g, '\n');
          jsonStr = jsonStr.replace(/\\\\/g, '\\');
          jsonStr = jsonStr.replace(/[\x00-\x1F\x7F]/g, '');
          jsonStr = jsonStr.replace(/```json\s*/, '').replace(/\s*```$/, '');
          jsonStr = jsonStr.replace(/`/g, '"');
          jsonStr = jsonStr.replace(/\n\s*\n/g, '\n');
          jsonStr = jsonStr.replace(/,\s*\}/g, '}');
          jsonStr = jsonStr.replace(/,\s*\]/g, ']');

          // Handle the case where the JSON is already properly escaped
          // First, try to parse as-is
          try {
            JSON.parse(jsonStr);

          } catch (e) {
            // If parsing fails, try to fix common issues

            
            // Fix unescaped quotes in CSS content
            jsonStr = jsonStr.replace(/"css":"([\s\S]*?)"/g, (match: string, cssContent: string) => {
              // Escape quotes within the CSS content
              const escapedCss = cssContent.replace(/"/g, '\\"');
              return `"css":"${escapedCss}"`;
            });
            
            // Also fix unescaped quotes in HTML content
            jsonStr = jsonStr.replace(/"html":"([\s\S]*?)"/g, (match: string, htmlContent: string) => {
              // Escape quotes within the HTML content
              const escapedHtml = htmlContent.replace(/"/g, '\\"');
              return `"html":"${escapedHtml}"`;
            });
          }
          
          console.log("Cleaned JSON:", jsonStr);
          
          try {
          const parsed = JSON.parse(jsonStr);

            
          code = {
              html: Array.isArray(parsed.html) ? parsed.html.join('\n') : (parsed.html || ''),
            css: parsed.css !== undefined ? (Array.isArray(parsed.css) ? parsed.css.join('\n') : parsed.css) : "",
            js: parsed.js !== undefined ? (Array.isArray(parsed.js) ? parsed.js.join('\n') : parsed.js) : ""
          };

            // Remove extra quotes if present
            (['html', 'css', 'js'] as const).forEach((key) => {
            if (
              typeof code![key] === 'string' &&
              code![key].startsWith('"') &&
              code![key].endsWith('"')
            ) {
              code![key] = code![key].slice(1, -1).replace(/\\"/g, '"');
            }
          });
            
            console.log("Final code:", code);
          } catch (parseError) {

            
            // Try to extract content directly from the raw response
            try {
              // Extract HTML content
              const htmlMatch = text.match(/"html":"([\s\S]*?)","css"/);
              const cssMatch = text.match(/"css":"([\s\S]*?)","js"/);
              const jsMatch = text.match(/"js":"([\s\S]*?)"}/);
              
              if (htmlMatch && cssMatch && jsMatch) {
                code = {
                  html: htmlMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"'),
                  css: cssMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"'),
                  js: jsMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"')
                };
                console.log("Extracted code manually:", code);
        } else {
                // Fallback to code block extraction
                throw new Error("Manual extraction failed");
              }
            } catch (extractError) {
              console.error("Manual extraction also failed:", extractError);
              throw extractError;
            }
          }
        } else {
          console.log("No JSON match found, trying code blocks");
          
          // Try to extract code blocks
          const htmlMatch = text.match(/```html\s*([\s\S]*?)\s*```/);
          const cssMatch = text.match(/```css\s*([\s\S]*?)\s*```/);
          const jsMatch = text.match(/```javascript\s*([\s\S]*?)\s*```/);

          let htmlCode = htmlMatch ? htmlMatch[1].trim() : "";
          let cssCode = cssMatch ? cssMatch[1].trim() : "";
          let jsCode = jsMatch ? jsMatch[1].trim() : "";

          if (!cssCode && !jsCode && htmlCode) {
            const styleMatch = htmlCode.match(/<style[^>]*>([\s\S]*?)<\/style>/);
            const scriptMatch = htmlCode.match(/<script[^>]*>([\s\S]*?)<\/script>/);
            if (styleMatch) {
              cssCode = styleMatch[1].trim();
              htmlCode = htmlCode.replace(/<style[^>]*>[\s\S]*?<\/style>/g, '');
            }
            if (scriptMatch) {
              jsCode = scriptMatch[1].trim();
              htmlCode = htmlCode.replace(/<script[^>]*>[\s\S]*?<\/script>/g, '');
            }
          }
          code = { html: htmlCode, css: cssCode, js: jsCode };
        }
      } catch (e) {
        console.error("Code parsing error:", e);
        console.error("Full text that failed to parse:", text);
        setError("Error parsing AI response for modification. Check debug output below.");
      }

      if (code && code.html && code.html.trim()) {
        // إضافة ربط الـ CSS والـ JS تلقائياً إذا لم يكن موجوداً
        let htmlWithLinks = code.html;
        // أضف رابط style.css إذا لم يكن موجوداً
        if (!/href=["']style\.css["']/.test(htmlWithLinks)) {
          htmlWithLinks = htmlWithLinks.replace(/<head[^>]*>/i, match => `${match}\n<link rel="stylesheet" href="style.css">`);
        }
        // أضف script.js إذا لم يكن موجوداً
        if (!/src=["']script\.js["']/.test(htmlWithLinks)) {
          if (code.js.trim()) {
  htmlWithLinks = htmlWithLinks.replace(/<\/body>/i, `  <script src="script.js"></script>\n</body>`);
}
        }
        // إذا لم يكن هناك <head> أو <body>، أضفهم
        if (!/<head[^>]*>/i.test(htmlWithLinks)) {
          htmlWithLinks = `<!DOCTYPE html>\n<html lang="en">\n<head>\n    <meta charset="UTF-8">\n    <meta name="viewport" content="width=device-width, initial-scale=1.0">\n    <title>Design to Web</title>\n    <link rel="stylesheet" href="style.css">\n</head>\n<body>\n    ${htmlWithLinks}\n    <script src="script.js"></script>\n</body>\n</html>`;
        }
        const codeWithLinks = {
          ...code,
          html: htmlWithLinks
        };
        setGeneratedCode(codeWithLinks);
        setCodeVersions(prev => [...prev, codeWithLinks]);
        setCurrentVersionIndex(prev => prev + 1);
        setLoading(false);
      } else {
        setError('لم يتم توليد كود صالح من الذكاء الاصطناعي. حاول تعديل البرومبت أو أعد المحاولة.');
        setLoading(false);
        return;
      }
    } catch (err: unknown) {
      if (err instanceof Error) {
        console.error("API call error:", err);
        setError(err.message || "Unknown error during modification analysis");
      } else {
        console.error("Unknown error during modification analysis");
        setError("Unknown error");
      }
      setLoading(false);
    }
  }

  function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      setImageFile(file);
      const reader = new FileReader();
      reader.onload = (ev) => setImage(ev.target?.result as string);
      reader.readAsDataURL(file);
      setAnalyzed(false);
      setDetectedImages([]);
      setError(null);
      setGeneratedCode(null);
    }
  }

  function handleZoomIn() {
    setZoom((z) => Math.min(z + 0.1, 3));
  }
  function handleZoomOut() {
    setZoom((z) => Math.max(z - 0.1, 0.2));
  }

  // Analyze Design: send design image, bounding boxes, and uploaded images to backend
  async function handleAnalyzeDesign() {
    if (!imageFile || usageExceeded) return;
    if (!(await incrementUsage())) return;
    
    // Allow analysis if user checked "no images" or if all boxes have images
    if (!noImagesDesign && (boundingBoxes.length === 0 || !allBoxesHaveImages)) return;
    setLoading(true);
    setError(null);
    setRawAIResponse("");
    try {
      // Convert design image to base64
      const reader = new FileReader();
      reader.onload = async (e) => {
        const imageBase64 = (e.target?.result as string).split(",")[1];
        // Define prompts for different scenarios
        const englishPrompt = `You are a world-class expert in responsive, pixel-perfect web design. Your task is to analyze the attached website design image and generate production-ready, fully responsive, mobile-first HTML, CSS, and JavaScript code that matches the design with 100% accuracy, pixel by pixel. This design contains NO images - only text, shapes, and layout elements.

**Critical requirements:**
1. **Element Positioning:** Every element must be placed in exactly the same position as in the design. The layout and visual hierarchy must match the design pixel-for-pixel. Do not shift, center, or reorder any element.
2. **Spacing & Gaps:** All spacing (margin, padding, gap) between elements and sections must be exactly as in the design. No element should be too close or too far from another. Maintain consistent, visually comfortable spacing everywhere. Pay extra attention to the distances between elements, their alignment, and the exact placement as shown in the design.
3. **Responsiveness:** The generated code must be fully responsive and look perfect on all screen sizes (desktop, tablet, mobile). Use modern CSS techniques (media queries, flexbox, grid, clamp, etc.) to ensure the layout adapts smoothly and maintains correct spacing and positioning on every device.
4. **No Guessing:** Never use approximate or random values. Extract every position, size, and spacing value directly from the design.
5. **Units:** Use px for exact desktop values, and use rem, %, or clamp for responsive/mobile.
6. **Layout:** Use flexbox and grid smartly to achieve precise alignment and spacing.
7. **Review:** Double-check that all elements are in their correct positions and all spacing is visually balanced and matches the design on all screen sizes.
8. **No Images:** This design contains NO images. Do not include any <img> tags or image references.

**Output format:**
{
  "html": "Full HTML code only, no <style> or <script> tags, no inline CSS or JS.",
  "css": "Full CSS code only, no HTML or JS. Must include all responsive rules, breakpoints, and ensure no overflow or cramped content.",
  "js": "Full JavaScript code only, if needed for interactivity (empty string if not needed)."
}

**IMPORTANT:** Return ONLY the JSON object above. Do NOT include any explanations, Markdown, or extra text. The JSON must be valid and parseable.`;
        const arabicPrompt = `أعد فقط الكود التالي بصيغة JSON بدون أي شرح أو نص خارجي أو Markdown أو علامات اقتباس زائدة:
{
  "html": "ضع هنا كود HTML فقط بدون style أو script",
  "css": "ضع هنا كود CSS فقط ويجب أن تراعي المسافات بين العناصر ومواضعها بدقة، وأن يكون الموقع متوافقًا مع جميع الشاشات (responsive) ويظهر بشكل ممتاز على جميع الأجهزة.",
  "js": "ضع هنا كود JavaScript فقط إذا كان هناك تفاعل (يمكن تركه فارغًا إذا لا يوجد)"
}
مهم جدًا: لا تضع أي نص خارجي أو شرح أو Markdown أو علامات اقتباس زائدة. فقط JSON النهائي.`;
        const basePrompt = noImagesDesign ? englishPrompt : arabicPrompt;
        
        // Add custom prompt if provided
        let finalPrompt = basePrompt;
        if (customPrompt.trim()) {
          const additionalInstructions = noImagesDesign 
            ? `\n\n**Additional Instructions:**\n${customPrompt.trim()}`
            : `\n\nتعليمات إضافية:\n${customPrompt.trim()}`;
          finalPrompt = basePrompt + additionalInstructions;
        }
        
        // التعليمات الإضافية تمت إضافتها بالفعل في الخطوة السابقة
        const res = await fetch("/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: finalPrompt, imageBase64 }),
        });
        if (!res.ok) throw new Error("AI code generation failed");
        const data = await res.json();
        
        // Debug: طباعة الـ response كامل
        // console.log("Full API Response:", data);
        
        // Show the raw AI response for debugging
        const text = data.choices?.[0]?.message?.content || "";
        // console.log("AI Response Text:", text);
        setRawAIResponse(text);
        
        // Try to parse the code from the AI response
        let code: { html: string; css: string; js: string } | null = null;
        try {
          const text = data.choices?.[0]?.message?.content || "";
          // First, try to find JSON format
          const jsonMatch = text.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            let jsonStr = jsonMatch[0];
            try {
              const parsed = JSON.parse(jsonStr);
              code = {
                html: typeof parsed.html === 'string' && parsed.html.startsWith('"') && parsed.html.endsWith('"') ? parsed.html.slice(1, -1) : parsed.html,
                css: typeof parsed.css === 'string' && parsed.css.startsWith('"') && parsed.css.endsWith('"') ? parsed.css.slice(1, -1) : parsed.css,
                js: typeof parsed.js === 'string' && parsed.js.startsWith('"') && parsed.js.endsWith('"') ? parsed.js.slice(1, -1) : parsed.js,
              };
                  } catch (e) {
              code = { html: '', css: '', js: '' };
            }
          } else {
            // No JSON found, try to extract HTML directly

            const htmlMatch = text.match(/```html\s*([\s\S]*?)\s*```/);
            const cssMatch = text.match(/```css\s*([\s\S]*?)\s*```/);
            const jsMatch = text.match(/```javascript\s*([\s\S]*?)\s*```/);
            let htmlCode = htmlMatch ? htmlMatch[1].trim() : "";
              let cssCode = cssMatch ? cssMatch[1].trim() : "";
              let jsCode = jsMatch ? jsMatch[1].trim() : "";
              // If no separate CSS/JS blocks found, try to extract from HTML
            if (!cssCode && !jsCode && htmlCode) {
                const styleMatch = htmlCode.match(/<style[^>]*>([\s\S]*?)<\/style>/);
                const scriptMatch = htmlCode.match(/<script[^>]*>([\s\S]*?)<\/script>/);
                if (styleMatch) {
                  cssCode = styleMatch[1].trim();
                  htmlCode = htmlCode.replace(/<style[^>]*>[\s\S]*?<\/style>/g, '');
                }
                if (scriptMatch) {
                  jsCode = scriptMatch[1].trim();
                  htmlCode = htmlCode.replace(/<script[^>]*>[\s\S]*?<\/script>/g, '');
                }
              }
              code = {
                html: htmlCode,
                css: cssCode,
                js: jsCode
              };

          }
        } catch (error) {
          setError("Error parsing AI response. Check debug output below.");
        }
        if (code) {
          // إضافة ربط الـ CSS والـ JS تلقائياً إذا لم يكن موجوداً
          let htmlWithLinks = code.html;
          
          // أضف رابط style.css إذا لم يكن موجوداً
          if (!/href=["']style\.css["']/.test(htmlWithLinks)) {
            htmlWithLinks = htmlWithLinks.replace(/<head[^>]*>/i, match => `${match}\n<link rel="stylesheet" href="style.css">`);
          }
          
          // أضف script.js إذا لم يكن موجوداً
          if (!/src=["']script\.js["']/.test(htmlWithLinks)) {
            htmlWithLinks = htmlWithLinks.replace(/<\/body>/i, `  <script src="script.js"></script>\n</body>`);
          }
          
          // إذا لم يكن هناك <head> أو <body>، أضفهم
          if (!/<head[^>]*>/i.test(htmlWithLinks)) {
            htmlWithLinks = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Design to Web</title>
    <link rel="stylesheet" href="style.css">
</head>
<body>
    ${htmlWithLinks}
    <script src="script.js"></script>
</body>
</html>`;
          }
          
          const codeWithLinks = {
            ...code,
            html: htmlWithLinks
          };
          
          setGeneratedCode(codeWithLinks);
        setAnalyzed(true);
        setLoading(false);
        
        // حفظ النسخة الجديدة من الكود
          setCodeVersions(prev => [...prev, codeWithLinks]);
          setCurrentVersionIndex(prev => prev + 1);
        } else {
          setLoading(false);
        }
      };
      reader.readAsDataURL(imageFile);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message || "Unknown error");
      } else {
        setError("Unknown error");
      }
      setLoading(false);
    }
          }
        } catch (error) {
          setError("Error parsing AI response. Check debug output below.");
        }
        if (code) {
          // إضافة ربط الـ CSS والـ JS تلقائياً إذا لم يكن موجوداً
          let htmlWithLinks = code.html;
          
          // أضف رابط style.css إذا لم يكن موجوداً
          if (!/href=["']style\.css["']/.test(htmlWithLinks)) {
            htmlWithLinks = htmlWithLinks.replace(/<head[^>]*>/i, match => `${match}\n<link rel="stylesheet" href="style.css">`);
          }
          
          // أضف script.js إذا لم يكن موجوداً
          if (!/src=["']script\.js["']/.test(htmlWithLinks)) {
            htmlWithLinks = htmlWithLinks.replace(/<\/body>/i, `  <script src="script.js"></script>\n<\/body>`);
          }
          
          // إذا لم يكن هناك <head> أو <body>، أضفهم
          if (!/<head[^>]*>/i.test(htmlWithLinks)) {
            htmlWithLinks = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Design to Web</title>
    <link rel="stylesheet" href="style.css">
</head>
<body>
    ${htmlWithLinks}
    <script src="script.js"></script>
</body>
</html>`;
          }
          
          const codeWithLinks = {
            ...code,
            html: htmlWithLinks
          };
          
          setGeneratedCode(codeWithLinks);
        setAnalyzed(true);
        setLoading(false);
        
        // حفظ النسخة الجديدة من الكود
          setCodeVersions(prev => [...prev, codeWithLinks]);
          setCurrentVersionIndex(prev => prev + 1);
        } else {
          setLoading(false);
        }
      };
      reader.readAsDataURL(imageFile);
    } catch (error: unknown) {
      if (error instanceof Error) {
        setError(error.message || "Unknown error");
      } else {
        setError("Unknown error");
      }
      setLoading(false);
    }
  }
            // Remove control characters that cause JSON parsing issues
            jsonStr = jsonStr.replace(/[\x00-\x1F\x7F]/g, '');

            // Remove backticks and fix JSON structure
            jsonStr = jsonStr.replace(/```json\s*/, '').replace(/\s*```$/, '');
            jsonStr = jsonStr.replace(/`/g, '"'); // Replace backticks with quotes
            jsonStr = jsonStr.replace(/\n\s*\n/g, '\n'); // Remove extra newlines
            jsonStr = jsonStr.replace(/,\s*}/g, '}'); // Remove trailing commas
            jsonStr = jsonStr.replace(/,\s*]/g, ']'); // Remove trailing commas in arrays

            // إصلاح مشكلة علامات الاقتباس المزدوجة داخل الـ HTML
            // (تم حذف الاستبدال، نستخدم القيم كما هي)
            // نفس الشيء للـ CSS و JS
            // (تم حذف الاستبدال، نستخدم القيم كما هي)
            

            
            try {
              const parsed = JSON.parse(jsonStr);
              
              // Convert arrays to strings if needed
              code = {
                html: Array.isArray(parsed.html) ? parsed.html.join('\n') : parsed.html,
                css: parsed.css !== undefined ? (Array.isArray(parsed.css) ? parsed.css.join('\n') : parsed.css) : "",
                js: parsed.js !== undefined ? (Array.isArray(parsed.js) ? parsed.js.join('\n') : parsed.js) : ""
              };
              
              // إصلاح مشكلة علامات الاقتباس الزائدة في القيم
              (['html', 'css', 'js'] as const).forEach((key) => {
                if (
                  typeof code[key] === 'string' &&
                  code[key].startsWith('"') &&
                  code[key].endsWith('"')
                ) {
                  code[key] = code[key].slice(1, -1).replace(/\\"/g, '"');
                }
              });

              // === ربط الصور تلقائياً حسب الترتيب ===
              // ابحث عن جميع src="..." في كود الـ HTML
              const imgMatches = [...code.html.matchAll(/<img[^>]*src=["']([^"']+)["'][^>]*>/g)];
              if (imgMatches.length > 0 && boundingBoxes.length > 0) {
                let html = code.html;
                for (let i = 0; i < imgMatches.length && i < boundingBoxes.length; i++) {
        
                  const uploadedUrl = boundingBoxes[i].uploadedUrl;
                  const box = boundingBoxes[i];
                  if (!uploadedUrl) continue;
                  if (uploadedUrl) {
                    // استبدل فقط أول تطابق لكل صورة
                    html = html.replace(new RegExp(`(<img[^>]*src=["'])${originalSrc}(["'][^>]*>)`), `$1${uploadedUrl}$2`);
                    
                    // تعديل حجم الصورة لتطابق الحجم المحدد
                    const escapedUrl = uploadedUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    const imgTag = html.match(new RegExp(`<img[^>]*src=["']${escapedUrl}["'][^>]*>`));
                    if (imgTag) {
                      const newImgTag = imgTag[0].replace(
                        /(style=["'][^"']*["'])/,
                        `style="width: ${Math.round(box.width)}px; height: ${Math.round(box.height)}px; object-fit: cover; max-width: ${Math.round(box.width)}px; max-height: ${Math.round(box.height)}px;"`
                      ).replace(
                        /<img([^>]*)(src=["'][^"']*["'])([^>]*)>/g,
                        `<img$1$2 style="width: ${Math.round(box.width)}px; height: ${Math.round(box.height)}px; object-fit: cover; max-width: ${Math.round(box.width)}px; max-height: ${Math.round(box.height)}px;"$3>`
                      );
                      html = html.replace(imgTag[0], newImgTag);
                    }
                  }
                }
                code.html = html;
              }

              // === Order-based image src replacement (most robust, always after code.html is set) ===
              if (code && code.html && boundingBoxes && Array.isArray(boundingBoxes)) {
                const imgMatches = [...code.html.matchAll(/<img[^>]*src=["'][^"']+["'][^>]*>/g)];
                if (imgMatches.length > 0 && boundingBoxes.length > 0) {
                  let html = code.html;
                  const minCount = Math.min(imgMatches.length, boundingBoxes.length);
                  for (let i = 0; i < minCount; i++) {
                    const imgTag = imgMatches[i][0];
                    const uploadedUrl = boundingBoxes[i].uploadedUrl;
                    if (!uploadedUrl) continue;
                    if (uploadedUrl) {
                      const newImgTag = imgTag.replace(/src=["'][^"']+["']/, `src="${uploadedUrl}"`);
                      html = html.replace(imgTag, newImgTag);
                    }
                  }
                  code.html = html;
                }
              }

              console.log("Parsed code:", code);
            } catch (parseError) {
              console.error("JSON parse error after cleaning:", parseError);
              
              // Try to extract HTML, CSS, and JS separately
              const htmlMatch = text.match(/"html":\s*(\[[\s\S]*?\]|"[\s\S]*?\"),\s*"css"/);
              const cssMatch = text.match(/"css":\s*(\[[\s\S]*?\]|"[\s\S]*?\"),\s*"js"/);
              const jsMatch = text.match(/"js":\s*(\[[\s\S]*?\]|"[\s\S]*?\")/);
              
              if (htmlMatch && cssMatch) {
                let htmlStr = htmlMatch[1];
                let cssStr = cssMatch[1];
                let jsStr = jsMatch ? jsMatch[1] : "[]";
                
                // Convert arrays to strings
                if (htmlStr.startsWith('[') && htmlStr.endsWith(']')) {
                  try {
                    const htmlArray = JSON.parse(htmlStr);
                    htmlStr = htmlArray.join('\n');
                  } catch (e) {
                    htmlStr = htmlStr.replace(/^\[|\]$/g, '').replace(/","/g, '\n').replace(/"/g, '');
                  }
                }
                
                if (cssStr.startsWith('[') && cssStr.endsWith(']')) {
                  try {
                    const cssArray = JSON.parse(cssStr);
                    cssStr = cssArray.join('\n');
                  } catch (e) {
                    cssStr = cssStr.replace(/^\[|\]$/g, '').replace(/","/g, '\n').replace(/"/g, '');
                  }
                }
                
                if (jsStr.startsWith('[') && jsStr.endsWith(']')) {
                  try {
                    const jsArray = JSON.parse(jsStr);
                    jsStr = jsArray.join('\n');
                  } catch (e) {
                    jsStr = jsStr.replace(/^\[|\]$/g, '').replace(/","/g, '\n').replace(/"/g, '');
                  }
                }
                
                code = {
                  html: htmlStr.replace(/\\n/g, '\n').replace(/\\"/g, '"'),
                  css: cssStr.replace(/\\n/g, '\n').replace(/\\"/g, '"'),
                  js: jsStr.replace(/\\n/g, '\n').replace(/\\"/g, '"')
                };
                console.log("Extracted code manually:", code);
              } else {
                // If JSON parsing fails, try to extract HTML directly
                console.log("JSON parsing failed, trying to extract HTML directly");
                const htmlMatch = text.match(/```html\s*([\s\S]*?)\s*```/);
                const cssMatch = text.match(/```css\s*([\s\S]*?)\s*```/);
                const jsMatch = text.match(/```javascript\s*([\s\S]*?)\s*```/);
                
                if (htmlMatch) {
                  let htmlCode = htmlMatch[1].trim();
                  let cssCode = cssMatch ? cssMatch[1].trim() : "";
                  let jsCode = jsMatch ? jsMatch[1].trim() : "";
                  
                  // If no separate CSS/JS blocks found, try to extract from HTML
                  if (!cssCode && !jsCode) {
                    const styleMatch = htmlCode.match(/<style[^>]*>([\s\S]*?)<\/style>/);
                    const scriptMatch = htmlCode.match(/<script[^>]*>([\s\S]*?)<\/script>/);
                    
                    if (styleMatch) {
                      cssCode = styleMatch[1].trim();
                      htmlCode = htmlCode.replace(/<style[^>]*>[\s\S]*?<\/style>/g, '');
                    }
                    
                    if (scriptMatch) {
                      jsCode = scriptMatch[1].trim();
                      htmlCode = htmlCode.replace(/<script[^>]*>[\s\S]*?<\/script>/g, '');
                    }
                  }
                  
                  code = {
                    html: htmlCode,
                    css: cssCode,
                    js: jsCode
                  };
    
                } else {
                  setError("Failed to parse AI response for code generation.");
                }
              }
            }
          } else {
            // No JSON found, try to extract HTML directly
            console.log("No JSON match found, trying to extract HTML directly");
            const htmlMatch = text.match(/```html\s*([\s\S]*?)\s*```/);
            const cssMatch = text.match(/```css\s*([\s\S]*?)\s*```/);
            const jsMatch = text.match(/```javascript\s*([\s\S]*?)\s*```/);
            
            if (htmlMatch) {
              let htmlCode = htmlMatch[1].trim();
              let cssCode = cssMatch ? cssMatch[1].trim() : "";
              let jsCode = jsMatch ? jsMatch[1].trim() : "";
              
              // If no separate CSS/JS blocks found, try to extract from HTML
              if (!cssCode && !jsCode) {
                const styleMatch = htmlCode.match(/<style[^>]*>([\s\S]*?)<\/style>/);
                const scriptMatch = htmlCode.match(/<script[^>]*>([\s\S]*?)<\/script>/);
                
                if (styleMatch) {
                  cssCode = styleMatch[1].trim();
                  htmlCode = htmlCode.replace(/<style[^>]*>[\s\S]*?<\/style>/g, '');
                }
                
                if (scriptMatch) {
                  jsCode = scriptMatch[1].trim();
                  htmlCode = htmlCode.replace(/<script[^>]*>[\s\S]*?<\/script>/g, '');
                }
              }
              
              code = {
                html: htmlCode,
                css: cssCode,
                js: jsCode
              };
              console.log("Extracted HTML directly:", code);
            } else {
              setError("No valid code found in AI response for code generation.");
            }
          }
        } catch (error) {
          setError("Code parsing error:" + error);
          setError("Error parsing AI response for code generation.");
        }
        setGeneratedCode(code);
        setGenerating(false);
      };
      reader.readAsDataURL(imageFile);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message || "Unknown error");
      } else {
        setError("Unknown error");
      }
      setGenerating(false);
    }
  }

  // ZIP download with uploaded images
  async function handleDownloadZip() {
    // استخدم النسخة المحددة كـ Final Design للتحميل
    const selectedCode = isFinalDesignSelected && selectedVersionForDownload >= 0 && codeVersions[selectedVersionForDownload] 
      ? codeVersions[selectedVersionForDownload] 
      : generatedCode;
    
    if (!selectedCode) return;
    const zip = new JSZip();
    
    // Add HTML, CSS, JS
    let htmlWithLinks = selectedCode.html;
    // أضف رابط style.css إذا لم يكن موجوداً
    if (!/href=["']style\.css["']/.test(htmlWithLinks)) {
      htmlWithLinks = htmlWithLinks.replace(/<head[^>]*>/i, match => `${match}\n<link rel="stylesheet" href="style.css">`);
    }
    // أضف script.js إذا لم يكن موجوداً
    if (!/src=["']script\.js["']/.test(htmlWithLinks)) {
      htmlWithLinks = htmlWithLinks.replace(/<\/body>/i, `  <script src="script.js"></script>\n</body>`);
    }
    // عدل جميع مسارات الصور في HTML ليشير إلى assets/filename
    if (boundingBoxes && boundingBoxes.length > 0) {
      const imgMatches = [...htmlWithLinks.matchAll(/<img[^>]*src=["']([^"']+)["'][^>]*>/g)];
      if (imgMatches.length > 0) {
        let newHtml = htmlWithLinks;
        const minCount = Math.min(imgMatches.length, boundingBoxes.length);
        for (let i = 0; i < minCount; i++) {
          const imgTag = imgMatches[i][0];
          const originalSrc = imgMatches[i][1];
          const filename = boundingBoxes[i].filename;
          if (filename) {
            const newImgTag = imgTag.replace(/src=["'][^"']+["']/, `src="assets/${filename}"`);
            newHtml = newHtml.replace(imgTag, newImgTag);
          }
        }
        htmlWithLinks = newHtml;
      }
    }
    zip.file("index.html", htmlWithLinks);
    zip.file("style.css", selectedCode.css);
    if (selectedCode.js.trim()) zip.file("script.js", selectedCode.js);
    
    // Add assets folder
    const assets = zip.folder("assets");
    
    // Add uploaded images from bounding boxes
    for (const box of boundingBoxes) {
      if (box.filename && box.uploadedUrl) {
        try {
          // Fetch the blob from the object URL
          const response = await fetch(box.uploadedUrl);
          const blob = await response.blob();
          assets?.file(box.filename, blob);
        } catch (error) {
          console.error(`Failed to add image ${box.filename} to ZIP:`, error);
        }
      }
    }
    
    // Generate and download ZIP
    const content = await zip.generateAsync({ type: "blob" });
    saveAs(content, "design2web-site.zip");
  }

  // High-res image upload for each bounding box
  function handleBoxImageUpload(e: React.ChangeEvent<HTMLInputElement>, boxId: string) {
    const file = e.target.files?.[0];
    if (file) {
      const objectUrl = URL.createObjectURL(file);
      setBoundingBoxes((prev) =>
        prev.map((box) =>
          box.id === boxId
            ? { 
                ...box, 
                filename: file.name, 
                uploadedUrl: objectUrl 
              }
            : box
        )
      );
      
      // Force re-render of preview
      if (generatedCode) {
        const updatedCode = { ...generatedCode };
        setGeneratedCode(updatedCode);
      }
    }
  }

  function handleCanvasMouseDown(e: React.MouseEvent) {
    if (!image) return;
    const img = document.getElementById("design-img") as HTMLImageElement;
    if (!img) return;
    const imgRect = img.getBoundingClientRect();
    const zoomVal = zoom;
    const pos = getMousePos(e, imgRect, zoomVal);
    setDrawing(true);
    setStartPos(pos);
    setActiveBoxId(null);
  }
  function handleCanvasMouseMove(e: React.MouseEvent) {
    if (!drawing || !startPos || !image) return;
    const img = document.getElementById("design-img") as HTMLImageElement;
    if (!img) return;
    const imgRect = img.getBoundingClientRect();
    const zoomVal = zoom;
    const pos = getMousePos(e, imgRect, zoomVal);
    const x = Math.min(startPos.x, pos.x);
    const y = Math.min(startPos.y, pos.y);
    const width = Math.abs(pos.x - startPos.x);
    const height = Math.abs(pos.y - startPos.y);
    setBoundingBoxes((prev) => {
      const temp = [...prev];
      if (activeBoxId === null && drawing) {
        // Add a temp box
        if (!temp.some((b) => b.id === "temp")) {
          temp.push({ id: "temp", x, y, width, height, label: `Image ${boxLabelCounter}` });
        } else {
          const idx = temp.findIndex((b) => b.id === "temp");
          temp[idx] = { id: "temp", x, y, width, height, label: `Image ${boxLabelCounter}` };
        }
      }
      return temp;
    });
  }
  function handleCanvasMouseUp(e: React.MouseEvent) {
    if (!drawing || !startPos || !image) return;
    setDrawing(false);
    setStartPos(null);
    setActiveBoxId(null);
    setBoundingBoxes((prev) => {
      const temp = prev.filter((b) => b.id !== "temp");
      const tempBox = prev.find((b) => b.id === "temp");
      if (tempBox && tempBox.width > 10 && tempBox.height > 10) {
        return [
          ...temp,
          {
            ...tempBox,
            id: `${Date.now()}`,
            label: `Image ${boxLabelCounter}`,
          },
        ];
      }
      return temp;
    });
    setBoxLabelCounter((c) => c + 1);
  }

  // Dragging boxes
  function handleBoxMouseDown(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    setActiveBoxId(id);
    const img = document.getElementById("design-img") as HTMLImageElement;
    if (!img) return;
    const imgRect = img.getBoundingClientRect();
    const zoomVal = zoom;
    const pos = getMousePos(e, imgRect, zoomVal);
    const box = boundingBoxes.find((b) => b.id === id);
    if (!box) return;
    setDragOffset({ x: pos.x - box.x, y: pos.y - box.y });
  }
  function handleCanvasDragMove(e: React.MouseEvent) {
    if (!activeBoxId || !dragOffset) return;
    const img = document.getElementById("design-img") as HTMLImageElement;
    if (!img) return;
    const imgRect = img.getBoundingClientRect();
    const zoomVal = zoom;
    const pos = getMousePos(e, imgRect, zoomVal);
    setBoundingBoxes((prev) =>
      prev.map((b) =>
        b.id === activeBoxId
          ? { ...b, x: pos.x - dragOffset.x, y: pos.y - dragOffset.y }
          : b
      )
    );
  }
  function handleCanvasDragUp() {
    setActiveBoxId(null);
    setDragOffset(null);
  }

  // Delete box
  function handleDeleteBox(id: string) {
    setBoundingBoxes((prev) => prev.filter((b) => b.id !== id));
  }

  // Helper: parse top-level elements from generated HTML (very basic, for demo)
  function getTopLevelElements(html: string) {
    // This is a naive parser for <section> or <div> blocks
    const divs = Array.from(html.matchAll(/<(section|div)[^>]*id=["']([^"']+)["'][^>]*>([\s\S]*?)<\/(section|div)>/g));
    return divs.map((m) => ({
      tag: m[1],
      id: m[2],
      content: m[0],
    }));
  }

  const previewRef = useRef<HTMLDivElement | null>(null);
  const designPreviewRef = useRef<HTMLDivElement | null>(null);

  // Scroll to preview when analyzed && generatedCode become true
  useEffect(() => {
    if (analyzed && generatedCode && previewRef.current) {
      previewRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [analyzed, generatedCode]);

  // Scroll to design preview when noImagesDesign and image are true
  useEffect(() => {
    if (noImagesDesign && image && designPreviewRef.current) {
      designPreviewRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [noImagesDesign, image]);

  const [isLoggedIn, setIsLoggedIn] = useState(false);
  useEffect(() => {
    const unsubscribe = auth?.onAuthStateChanged?.((user) => {
      setIsLoggedIn(!!user);
    });
    return () => { if (unsubscribe) unsubscribe(); };
  }, []);

  return (
    <>
      {/* Header with logo */}
      <motion.header
        className="w-full fixed top-0 left-0 z-50 bg-transparent flex items-center justify-between h-24 px-12"
        style={{backdropFilter: 'blur(4px)'}}
        initial={{ opacity: 0, y: -30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, type: 'spring', stiffness: 60, damping: 18 }}
      >
        <div className="flex items-center">
          <motion.img
            src="/logo.png"
            alt="Snappy AI Logo"
            style={{ height: '160px', width: 'auto', display: 'block' }}
            initial={{ opacity: 0, scale: 0.85, rotate: -8 }}
            animate={{ opacity: 1, scale: 1, rotate: 0 }}
            transition={{ delay: 0.3, type: 'spring', stiffness: 80, damping: 14 }}
          />
        </div>
        {isLoggedIn && (
          <button
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-pink-400 to-purple-500 text-white font-bold shadow-lg hover:scale-105 hover:shadow-pink-500/30 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-pink-400/60"
            style={{ fontSize: '1.1rem' }}
            title="Logout"
            onClick={async () => {
              await signOut(auth as any);
              router.push("/home");
            }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} className="w-6 h-6">
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a2 2 0 01-2 2H7a2 2 0 01-2-2V7a2 2 0 012-2h4a2 2 0 012 2v1" />
            </svg>
            <span className="hidden sm:inline">Logout</span>
          </button>
        )}
      </motion.header>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.7 }}
        className="min-h-screen bg-gradient-to-b from-[#181824] via-[#2d1a3a] to-[#7b2ff2] flex flex-col items-center py-6 px-2 font-sans pt-24"
      >
        <motion.h1
          variants={fadeInUp}
          initial="hidden"
          animate="visible"
          transition={{ delay: 0.1, type: "spring" as const, stiffness: 60, damping: 18 }}
          className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-extrabold text-white text-center drop-shadow-[0_4px_24px_rgba(123,47,242,0.5)] mb-2 mt-4"
          style={{fontSize: 'clamp(1.5rem, 4vw, 3rem)'}}
        >AI Design to Website Builder</motion.h1>
        <motion.p
          variants={fadeInUp}
          initial="hidden"
          animate="visible"
          transition={{ delay: 0.3, type: "spring" as const, stiffness: 60, damping: 18 }}
          className="mb-6 text-gray-200 text-center max-w-2xl text-base sm:text-lg"
          style={{fontSize: 'clamp(1rem, 2.5vw, 1.25rem)'}}
        >Upload your full website design image (PNG/JPG) and let AI extract the layout and structure automatically. No manual section selection required.</motion.p>
        <motion.div
          variants={fadeInUp}
          initial="hidden"
          animate="visible"
          transition={{ delay: 0.5, type: "spring" as const, stiffness: 60, damping: 18 }}
          className="mb-6 w-full max-w-2xl bg-gradient-to-br from-[#2d1a3a]/80 to-[#7b2ff2]/40 backdrop-blur-lg rounded-2xl shadow-2xl p-4 sm:p-8 border border-white/10 flex flex-col items-center"
        >
          <label className="w-full flex flex-col items-center cursor-pointer">
            <input type="file" accept="image/png, image/jpeg" onChange={handleImageUpload} className="hidden" />
            <span className="px-8 py-3 rounded-xl font-bold text-white text-base sm:text-xl shadow-lg transition-all duration-200 mb-2 button-animate" style={{background: "linear-gradient(90deg, #ff6fd8 0%, #8854ff 100%)", boxShadow: "0 2px 16px 0 rgba(136,84,255,0.15)", border: "none"}}>Choose Image</span>
            <span className="text-gray-300 text-xs sm:text-sm fade-in${showUpload ? ' visible' : ''}">{imageFile ? imageFile.name : "No file chosen"}</span>
          </label>
          <div className="mt-4 w-full flex items-center justify-center">
            <label className="flex items-center cursor-pointer group">
              <div className="relative">
                <input type="checkbox" checked={noImagesDesign} onChange={(e) => setNoImagesDesign(e.target.checked)} className="sr-only" />
                <div className={`w-5 h-5 sm:w-6 sm:h-6 rounded-lg border-2 transition-all duration-200 flex items-center justify-center ${noImagesDesign ? 'bg-gradient-to-r from-pink-400 to-purple-500 border-pink-400 shadow-lg shadow-pink-400/30' : 'bg-white/10 border-pink-400/50 group-hover:border-pink-400 group-hover:bg-white/20'}`}>{noImagesDesign && (<svg className="w-3 h-3 sm:w-4 sm:h-4 text-white" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>)}</div>
              </div>
              <span className="ml-2 sm:ml-3 text-pink-200 font-medium text-xs sm:text-base group-hover:text-pink-100 transition-colors duration-200">This design contains no images</span>
            </label>
          </div>
          {image && (
            <div className="mt-4 w-full flex justify-center">
              {/* تمت إزالة معاينة صورة التصميم المرفوعة بناءً على طلب المستخدم */}
            </div>
          )}
        </motion.div>
        {error && (
          <AnimatePresence>
            <motion.div
              key="error-msg"
              variants={errorVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              className="text-red-400 mb-4 font-bold text-sm sm:text-base"
            >{error}</motion.div>
          </AnimatePresence>
        )}
        {image && !noImagesDesign && (
          <motion.div
            variants={fadeInUp}
            initial="hidden"
            animate="visible"
            transition={{ delay: 0.7, type: "spring" as const, stiffness: 60, damping: 18 }}
            className="flex flex-col items-center w-full"
          >
            <div className="flex gap-6 mb-4 items-center justify-center">
              <button
                onClick={handleZoomOut}
                className="w-12 h-12 flex items-center justify-center rounded-full bg-white/10 border border-purple-400/30 shadow-xl text-3xl text-purple-200 font-extrabold transition-all duration-200 hover:scale-110 hover:shadow-[0_0_16px_4px_rgba(136,84,255,0.25)] focus:outline-none focus:ring-2 focus:ring-pink-400/60 backdrop-blur-md"
                style={{backdropFilter: 'blur(8px)'}}
                aria-label="Zoom out"
              >
                -
              </button>
              <span className="text-2xl font-black text-purple-100 drop-shadow-[0_2px_8px_rgba(136,84,255,0.25)] select-none" style={{letterSpacing: '0.02em'}}>
                Zoom: {(zoom * 100).toFixed(0)}%
              </span>
              <button
                onClick={handleZoomIn}
                className="w-12 h-12 flex items-center justify-center rounded-full bg-white/10 border border-purple-400/30 shadow-xl text-3xl text-purple-200 font-extrabold transition-all duration-200 hover:scale-110 hover:shadow-[0_0_16px_4px_rgba(136,84,255,0.25)] focus:outline-none focus:ring-2 focus:ring-pink-400/60 backdrop-blur-md"
                style={{backdropFilter: 'blur(8px)'}}
                aria-label="Zoom in"
              >
                +
              </button>
            </div>
            <div
              ref={canvasRef}
              className="canvas-container overflow-y-auto border-2 border-pink-400/30 rounded-3xl bg-gradient-to-br from-[#2d1a3a]/60 to-[#7b2ff2]/30 shadow-2xl relative p-2"
              style={{
                width: "100%",
                maxWidth: "1200px",
                maxHeight: "80vh",
                minHeight: "200px",
                margin: "0 auto",
                cursor: drawing ? "crosshair" : "default"
              }}
              onMouseDown={drawing ? undefined : handleCanvasMouseDown}
              onMouseMove={drawing ? handleCanvasMouseMove : activeBoxId ? handleCanvasDragMove : undefined}
              onMouseUp={drawing ? handleCanvasMouseUp : activeBoxId ? handleCanvasDragUp : undefined}
            >
              <Image
                id="design-img"
                src={image || "/placeholder.png"}
                alt="Uploaded design"
                width={800} // Placeholder, adjust as needed
                height={600} // Placeholder, adjust as needed
                style={{
                  transform: `scale(${zoom})`,
                  transformOrigin: "top left",
                  display: "block",
                  maxWidth: "100%",
                  maxHeight: "75vh",
                  objectFit: "contain",
                  borderRadius: "1rem",
                  boxShadow: "0 2px 16px 0 rgba(136,84,255,0.15)"
                }}
              />
              {/* Draw bounding boxes */}
              {boundingBoxes.map((box) => (
                <div
                  key={box.id}
                  className="absolute border-2 border-pink-500 bg-pink-200/20 cursor-move group rounded-xl"
                  style={{
                    left: box.x * zoom,
                    top: box.y * zoom,
                    width: box.width * zoom,
                    height: box.height * zoom,
                    zIndex: 10,
                  }}
                  onMouseDown={(e) => handleBoxMouseDown(e, box.id)}
                >
                  <span className="absolute left-0 top-0 bg-pink-500 text-white text-xs px-1 rounded-br">{box.label}</span>
                  <button
                    className="absolute right-0 top-0 bg-red-600 text-white text-xs px-1 rounded-bl opacity-80 group-hover:opacity-100"
                    style={{ zIndex: 20 }}
                    onClick={(e) => { e.stopPropagation(); handleDeleteBox(box.id); }}
                    title="Delete"
                  >
                    ×
                  </button>
                </div>
              ))}
              {/* Draw temp box while drawing */}
              {drawing && startPos && boundingBoxes.some((b) => b.id === "temp") && (
                (() => {
                  const tempBox = boundingBoxes.find((b) => b.id === "temp");
                  if (!tempBox) return null;
                  return (
                    <div
                      className="absolute border-2 border-blue-400 bg-blue-200/20 pointer-events-none rounded-xl"
                      style={{
                        left: tempBox.x * zoom,
                        top: tempBox.y * zoom,
                        width: tempBox.width * zoom,
                        height: tempBox.height * zoom,
                        zIndex: 20,
                      }}
                    />
                  );
                })()
              )}
          </div>
          </motion.div>
        )}
        
        {/* Simple preview for designs without images */}
        {image && noImagesDesign && (
          <motion.div
            ref={designPreviewRef}
            variants={fadeInUp}
            initial="hidden"
            animate="visible"
            transition={{ delay: 0.7, type: "spring", stiffness: 60, damping: 18 }}
            className="mt-6 w-full max-w-2xl bg-gradient-to-br from-[#2d1a3a]/80 to-[#7b2ff2]/40 backdrop-blur-lg rounded-3xl shadow-2xl p-8 border border-white/10"
          >
            <h2 className="text-lg font-semibold mb-4 text-pink-200 text-center">Design Preview</h2>
            <div className="flex justify-center">
              <Image
                src={image || "/placeholder.png"}
                alt="Uploaded design"
                width={800} // Placeholder, adjust as needed
                height={600} // Placeholder, adjust as needed
                className="max-w-full max-h-96 object-contain rounded-lg shadow-lg"
              />
            </div>
          </motion.div>
        )}
        
        {/* Analyze Design Section */}
        {image && (
          <motion.div
            variants={fadeInUp}
            initial="hidden"
            animate="visible"
            transition={{ delay: 0.9, type: "spring" as const, stiffness: 60, damping: 18 }}
            className="mt-6 w-full max-w-lg bg-gradient-to-br from-[#2d1a3a]/80 to-[#7b2ff2]/40 backdrop-blur-lg rounded-3xl shadow-2xl p-8 border border-white/10"
          >
            {!noImagesDesign && boundingBoxes.length > 0 && (
              <>
                <h2 className="text-lg font-semibold mb-2 text-pink-200">Select and Upload Embedded Images</h2>
                <ul className="space-y-4">
                  {boundingBoxes.map((box) => (
                    <li key={box.id} className="flex items-center gap-4 bg-white/10 rounded-lg p-3 shadow border border-pink-400/10">
                      <span className="text-sm text-pink-100">{box.label} ({Math.round(box.width)}×{Math.round(box.height)})</span>
                      <label className="cursor-pointer">
                      <input
                        type="file"
                        accept="image/png, image/jpeg"
                        onChange={(e) => handleBoxImageUpload(e, box.id)}
                          className="hidden"
                        />
                        <span className="px-8 py-2 rounded-2xl font-bold text-white text-base shadow-lg transition-all duration-200"
                          style={{
                            background: "linear-gradient(90deg, #ff6fd8 0%, #8854ff 100%)",
                            boxShadow: "0 2px 16px 0 rgba(136,84,255,0.15)",
                            border: "none"
                          }}
                        >
                          Choose Image
                        </span>
                      </label>
                      {box.uploadedUrl && (
                        <Image src={box.uploadedUrl} alt={box.filename} width={48} height={48} className="w-12 h-12 object-cover rounded border border-pink-400/30" unoptimized />
                      )}
                    </li>
                  ))}
                </ul>
              </>
            )}
            
            {noImagesDesign && (
              <div className="text-center">
                <p className="text-pink-200 mb-4">Design analysis will proceed without image uploads.</p>
              </div>
            )}
            
            {/* Custom Prompt Input */}
            <div className="mt-6">
              <label htmlFor="customPrompt" className="block text-pink-200 font-medium mb-2">
                Additional Instructions (Optional)
              </label>
              <textarea
                id="customPrompt"
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.target.value)}
                placeholder="Add any notes or additional instructions for the AI..."
                className="w-full px-4 py-3 bg-white/10 border border-pink-400/30 rounded-xl text-white placeholder-pink-200/50 focus:outline-none focus:ring-2 focus:ring-pink-400/60 focus:border-transparent transition-all duration-200"
                style={{ minHeight: '100px', backdropFilter: 'blur(8px)' }}
              />
            </div>
            
            <button
              onClick={handleAnalyzeDesign}
              className="mt-6 px-6 py-2 bg-gradient-to-r from-pink-400 to-purple-500 text-white rounded-lg font-semibold shadow-lg hover:scale-110 transition disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={(!noImagesDesign && !allBoxesHaveImages) || loading || usageExceeded || !firebaseReady || isFinalDesignSelected}
            >
              {loading ? "Analysis in progress, please wait..." : "Analyze Design"}
            </button>
            {!firebaseReady && (
              <div className="text-xs text-red-400 mt-2 font-bold">فشل الاتصال بـ Firebase. يرجى إعادة تحميل الصفحة أو التأكد من الاتصال بالإنترنت.</div>
            )}
            <div className="text-xs text-red-300 mt-2">
              {loading && "Analysis in progress, please wait..."}
              {usageExceeded && "You have exhausted your daily attempts. Please try again tomorrow."}
              {!noImagesDesign && !allBoxesHaveImages && "يرجى تحميل صور عالية الدقة لكل الصناديق قبل التحليل."}
            </div>
              </motion.div>
            )}
        
        {/* Results Section */}
        <AnimatePresence>
          {analyzed && generatedCode && (
            <motion.div
              key="results"
              ref={previewRef}
              variants={fadeInUp}
              initial="hidden"
              animate="visible"
              exit="hidden"
              transition={{ delay: 1.1, type: "spring", stiffness: 60, damping: 18 }}
              className="mt-10 w-full max-w-5xl bg-gradient-to-br from-purple-900/90 to-purple-700/70 backdrop-blur-xl rounded-3xl shadow-3xl p-10 border border-purple-600/40"
            >
              <h2 className="text-3xl font-extrabold mb-6 text-white drop-shadow-lg">Live Preview</h2>
                  <div className="mb-6 flex flex-wrap gap-6 items-center">
               {/* Manual Adjustment Mode and Show Design Comparison removed as requested */}
                    </div>
          
          {/* Version Navigation Buttons */}
          {codeVersions.length > 0 && (
            <div className="flex items-center justify-center gap-4 mb-6">
              <span className="text-white font-bold text-lg bg-purple-900/50 px-6 py-3 rounded-2xl border border-purple-600/30 backdrop-blur-sm">
                Version {currentVersionIndex + 1} of {codeVersions.length}
              </span>
              </div>
            )}
          
          {/* Edit Prompt Field */}
            <div className="mb-6">
              <EditPrompt onSubmit={handleAnalyzeModification} loading={loading} currentVersionIndex={currentVersionIndex} isFinalDesignSelected={isFinalDesignSelected} />
            </div>
          
          <div className="relative group px-20">
            {/* Navigation Buttons */}
            {codeVersions.length > 1 && (
              <>
                {/* Left Arrow */}
                <button 
                  onClick={() => handleVersionChange('prev')} 
                  onMouseEnter={() => handleArrowHover('left', true)}
                  onMouseLeave={() => handleArrowHover('left', false)}
                  disabled={currentVersionIndex <= 0}
                  className={`absolute -left-6 top-1/2 transform -translate-y-1/2 z-30 w-14 h-14 bg-gradient-to-br from-purple-600 via-pink-500 to-purple-700 text-white rounded-full font-bold shadow-2xl disabled:opacity-30 disabled:cursor-not-allowed backdrop-blur-xl border-2 border-white/20 transition-all duration-500 ease-out hover:shadow-purple-500/50 ${
                        arrowHoverLeft 
                          ? 'scale-110 shadow-pink-500/60 border-pink-400/60 bg-gradient-to-br from-purple-500 via-pink-400 to-purple-600' 
                          : 'scale-100 shadow-purple-500/30 border-white/20'
                      }`}
                      style={{
                        transform: arrowHoverLeft 
                          ? 'translateY(-50%) scale(1.1)' 
                          : 'translateY(-50%) scale(1)',
                        transition: 'all 0.5s cubic-bezier(0.4, 0, 0.2, 1)'
                      }}
                    >
                      <div className={`absolute inset-0 bg-gradient-to-br from-white/10 to-transparent rounded-full transition-all duration-500 ${
                        arrowHoverLeft ? 'from-white/20 to-transparent' : 'from-white/10 to-transparent'
                      }`}></div>
                      <svg 
                        className={`w-6 h-6 mx-auto relative z-10 transition-all duration-500 ${
                          arrowHoverLeft ? 'scale-110' : 'scale-100'
                        }`} 
                        fill="currentColor" 
                        viewBox="0 0 20 20"
                        style={{
                          transition: 'all 0.5s cubic-bezier(0.4, 0, 0.2, 1)'
                        }}
                      >
                        <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    </button>
                    
                    {/* Right Arrow */}
                    <button 
                      onClick={() => handleVersionChange('next')} 
                      onMouseEnter={() => handleArrowHover('right', true)}
                      onMouseLeave={() => handleArrowHover('right', false)}
                      disabled={currentVersionIndex >= codeVersions.length - 1}
                      className={`absolute -right-6 top-1/2 transform -translate-y-1/2 z-30 w-14 h-14 bg-gradient-to-br from-purple-600 via-pink-500 to-purple-700 text-white rounded-full font-bold shadow-2xl disabled:opacity-30 disabled:cursor-not-allowed backdrop-blur-xl border-2 border-white/20 transition-all duration-500 ease-out hover:shadow-purple-500/50 ${
                        arrowHoverRight 
                          ? 'scale-110 shadow-pink-500/60 border-pink-400/60 bg-gradient-to-br from-purple-500 via-pink-400 to-purple-600' 
                          : 'scale-100 shadow-purple-500/30 border-white/20'
                      }`}
                      style={{
                        transform: arrowHoverRight 
                          ? 'translateY(-50%) scale(1.1)' 
                          : 'translateY(-50%) scale(1)',
                        transition: 'all 0.5s cubic-bezier(0.4, 0, 0.2, 1)'
                      }}
                    >
                      <div className={`absolute inset-0 bg-gradient-to-br from-white/10 to-transparent rounded-full transition-all duration-500 ${
                        arrowHoverRight ? 'from-white/20 to-transparent' : 'from-white/10 to-transparent'
                      }`}></div>
                      <svg 
                        className={`w-6 h-6 mx-auto relative z-10 transition-all duration-500 ${
                          arrowHoverRight ? 'scale-110' : 'scale-100'
                        }`} 
                        fill="currentColor" 
                        viewBox="0 0 20 20"
                        style={{
                          transition: 'all 0.5s cubic-bezier(0.4, 0, 0.2, 1)'
                        }}
                      >
                        <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                      </svg>
                    </button>
                  </>
                )}
                
                {/* Preview Container */}
                <div 
                  className="border rounded-2xl bg-white/20 shadow p-4 mb-4 min-h-[400px] relative overflow-hidden cursor-pointer group"
                  style={{
                    contain: 'layout style paint',
                    isolation: 'isolate',
                    willChange: 'auto'
                  }}
                  onMouseEnter={e => e.currentTarget.classList.add('hovering-preview')}
                  onMouseLeave={e => e.currentTarget.classList.remove('hovering-preview')}
                >
                        <MemoizedPreview 
                          html={codeVersions[currentVersionIndex]?.html || generatedCode.html}
                          css={codeVersions[currentVersionIndex]?.css || generatedCode.css}
                          js={codeVersions[currentVersionIndex]?.js || generatedCode.js}
                          boundingBoxes={boundingBoxes}
                        />
              
              {/* Hover Overlay with Select as Final Design Button */}
              {(currentVersionIndex >= 0 && codeVersions[currentVersionIndex]) && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-0 group-hover:opacity-100 transition-all duration-700 ease-out bg-gradient-to-br from-black/0 via-purple-900/0 to-pink-900/0 group-hover:bg-gradient-to-br group-hover:from-black/30 group-hover:via-purple-900/20 group-hover:to-pink-900/30">
                  <div className="backdrop-blur-2xl bg-gradient-to-br from-white/10 via-purple-500/15 to-pink-500/15 rounded-3xl p-8 border border-white/40 shadow-2xl pointer-events-auto transform scale-90 group-hover:scale-100 transition-all duration-700 ease-out group-hover:shadow-purple-500/20 flex flex-col items-center">
                    <button
                      onClick={() => {
                        setIsFinalDesignSelected(true);
                        setSelectedVersionForDownload(currentVersionIndex);
                      }}
                      className={`relative z-10 px-12 py-6 rounded-3xl font-bold text-xl shadow-2xl transition-all duration-500 transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed ${
                        isFinalDesignSelected
                          ? "bg-gradient-to-r from-emerald-400 via-emerald-500 to-emerald-600 text-white shadow-emerald-500/40 hover:shadow-emerald-500/60"
                          : "bg-gradient-to-r from-pink-400 via-purple-500 to-purple-600 text-white shadow-pink-500/40 hover:shadow-pink-500/60 hover:from-pink-500 hover:via-purple-600 hover:to-purple-700"
                      } pointer-events-auto`}
                      disabled={isFinalDesignSelected}
                      style={{ minWidth: '260px', fontSize: '1.25rem', letterSpacing: '0.01em' }}
                    >
                      {isFinalDesignSelected ? (
                        <span className="relative z-10">Final Design Selected</span>
                      ) : (
                        <span className="relative z-10">Select as Final Design</span>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
              </div>
              <div className="flex justify-end gap-4 mt-4">
                <button
                  onClick={handleDownloadZip}
                  className={`px-8 py-3 rounded-2xl font-bold text-lg shadow-2xl transition-all duration-300 transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed ${
                    isFinalDesignSelected
                      ? "bg-gradient-to-r from-emerald-400 to-emerald-600 text-white shadow-emerald-500/30 hover:shadow-emerald-500/50"
                      : "bg-gradient-to-r from-gray-400 to-gray-600 text-white shadow-gray-500/30"
                  }`}
                  disabled={!isFinalDesignSelected}
                >
                  {!isFinalDesignSelected ? (
                    <span className="flex items-center gap-2">
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                      </svg>
                      Select Final Design First
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
                      </svg>
                  Download Website
                    </span>
                  )}
                </button>
                {isFinalDesignSelected && (
                  <button
                    onClick={() => {
                      // Reset all relevant state to start again
                      setImage(null);
                      setImageFile(null);
                      setZoom(1);
                      setAnalyzed(false);
                      setDetectedImages([]);
                      setLoading(false);
                      setError(null);
                      setGenerating(false);
                      setGeneratedCode(null);
                      setRawAIResponse("");
                      setShowRaw(false);
                      setCustomPrompt("");
                      setCodeVersions([]);
                      setCurrentVersionIndex(-1);
                      setBoundingBoxes([]);
                      setDrawing(false);
                      setStartPos(null);
                      setActiveBoxId(null);
                      setDragOffset(null);
                      setResizing(null);
                      setBoxLabelCounter(1);
                      setManualMode(false);
                      setAdjustments({});
                      setShowComparison(false);
                      setComparisonOpacity(0.5);
                      setNoImagesDesign(false);
                      setIsFinalDesignSelected(false);
                      setSelectedVersionForDownload(-1);
                    }}
                    className="px-8 py-3 rounded-2xl font-bold text-lg shadow-2xl transition-all duration-300 transform hover:scale-105 bg-gradient-to-r from-pink-400 to-purple-500 text-white hover:from-pink-500 hover:to-purple-700 hover:shadow-pink-500/50"
                  >
                    Start Again
                  </button>
                )}
              </div>
        </motion.div>
      )}
      </AnimatePresence>
      <div style={{ marginBottom: '48px' }} />
      <motion.footer
        className="w-full text-center py-6 text-gray-300 text-sm bg-transparent mt-auto"
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.2, type: 'spring', stiffness: 60, damping: 18 }}
      >
        © {new Date().getFullYear()} Snappy AI. All rights reserved.
      </motion.footer>
      <style jsx global>{`
        .fade-in {
          opacity: 0;
          transform: translateY(40px);
          transition: opacity 0.7s cubic-bezier(.4,0,.2,1), transform 0.7s cubic-bezier(.4,0,.2,1);
        }
        .fade-in.visible {
          opacity: 1;
          transform: translateY(0);
        }
        .slide-up {
          opacity: 0;
          transform: translateY(60px);
          transition: opacity 0.8s cubic-bezier(.4,0,.2,1), transform 0.8s cubic-bezier(.4,0,.2,1);
        }
        .slide-up.visible {
          opacity: 1;
          transform: translateY(0);
        }
      `}</style>
    </motion.div>
  </>
  );
}
