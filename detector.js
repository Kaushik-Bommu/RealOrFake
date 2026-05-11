/**
 * detector.js — AI Image Detection API wrapper
 *
 * IMPORTANT: Your FastAPI backend must allow CORS. Add this to your main.py:
 *
 *   from fastapi.middleware.cors import CORSMiddleware
 *   app.add_middleware(CORSMiddleware, allow_origins=["*"],
 *                      allow_methods=["*"], allow_headers=["*"])
 *
 * Expected backend response from POST /predict:
 * {
 *   "verdict": "Authentic Image" | "AI Generated" | "Uncertain",
 *   "verdict_class": "real" | "ai" | "uncertain",
 *   "confidence": 94,           // integer 0-100
 *   "ai_probability": 6,        // integer 0-100
 *   "filename": "photo.jpg",
 *   "filesize_kb": 240,
 *   "insights": [
 *     { "label": "Natural Textures", "finding": "Skin and fabric textures appear organic." },
 *     { "label": "Realistic Lighting", "finding": "Shadows match expected light sources." }
 *   ]
 * }
 */

const DetectorAPI = (() => {
    const BASE_URL = "https://transpire-blasphemy-startup.ngrok-free.dev"; // ← change to your deployed server URL in production

    /**
     * Analyze an image file.
     * @param {File|Blob} file - A File or Blob object
     * @returns {Promise<Object>} result object matching the schema above
     */
    async function analyze(file) {
        const formData = new FormData();
        formData.append("file", file);

        const response = await fetch(`${BASE_URL}/predict`, {
            method: "POST",
            body: formData,
        });

        if (!response.ok) {
            let detail = "Prediction failed";
            try { detail = (await response.json()).detail || detail; } catch (_) {}
            throw new Error(detail);
        }

        return await response.json();
    }

    /**
     * Check if the API server is reachable.
     * @returns {Promise<boolean>}
     */
    async function healthCheck() {
        try {
            const res = await fetch(`${BASE_URL}/health`);
            return res.ok;
        } catch {
            return false;
        }
    }

    /** Get hex color for a verdict class. */
    function getVerdictColor(verdictClass) {
        return { real: "#22c55e", ai: "#ef4444", uncertain: "#f59e0b" }[verdictClass] ?? "#6b7280";
    }

    /** Get emoji icon for a verdict class. */
    function getVerdictIcon(verdictClass) {
        return { real: "✅", ai: "⚠️", uncertain: "❓" }[verdictClass] ?? "❓";
    }

    /**
     * Convert a base64 data-URL back to a Blob so it can be sent via FormData.
     * @param {string} dataUrl
     * @returns {Blob}
     */
    function dataUrlToBlob(dataUrl) {
        const [header, data] = dataUrl.split(",");
        const mime = header.match(/:(.*?);/)[1];
        const binary = atob(data);
        const arr = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i);
        return new Blob([arr], { type: mime });
    }

    return { analyze, healthCheck, getVerdictColor, getVerdictIcon, dataUrlToBlob };
})();