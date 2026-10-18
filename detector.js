/**
 * RealOrFake frontend → backend adapter.
 * The backend URL defaults to local FastAPI; for a deployed frontend define
 * window.REALORFAKE_API_URL before loading this file (see README).
 * Predictions will be unavailable until an actually trained ONNX model exists.
 */
const DetectorAPI = (() => {
    const BASE_URL = (window.REALORFAKE_API_URL || "http://localhost:8000").replace(/\/$/, "");

    async function analyze(file) {
        const formData = new FormData();
        formData.append("file", file);
        const response = await fetch(`${BASE_URL}/predict`, {
            method: "POST",
            body: formData,
        });
        if (!response.ok) {
            let detail = `Prediction request failed (${response.status})`;
            try { detail = (await response.json()).detail || detail; } catch (_) {}
            throw new Error(detail);
        }
        return await response.json();
    }

    async function healthCheck() {
        try {
            const response = await fetch(`${BASE_URL}/health`);
            return response.ok && (await response.json()).model_loaded === true;
        } catch {
            return false;
        }
    }

    function getVerdictColor(verdictClass) {
        return {real: "#22c55e", ai: "#ef4444", uncertain: "#f59e0b"}[verdictClass] ?? "#6b7280";
    }
    function getVerdictIcon(verdictClass) {
        return {real: "✅", ai: "⚠️", uncertain: "❓"}[verdictClass] ?? "❓";
    }
    function dataUrlToBlob(dataUrl) {
        const [header, data] = dataUrl.split(",");
        const mime = header.match(/:(.*?);/)?.[1];
        if (!mime) throw new Error("Invalid image data URL");
        const binary = atob(data);
        const arr = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i);
        return new Blob([arr], {type: mime});
    }
    return {analyze, healthCheck, getVerdictColor, getVerdictIcon, dataUrlToBlob};
})();
