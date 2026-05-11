/**
 * main.js — RealOrFake? Frontend Logic
 *
 * Depends on: detector.js (must be loaded before this script in each HTML page)
 * All pages load this via: <script type="module" src="/main.js"></script>
 *
 * Flow:
 *  index.html  → user picks image → stored in sessionStorage → redirect to detect.html
 *  detect.html → shows preview → user clicks Analyze → calls DetectorAPI.analyze()
 *                → stores API result in sessionStorage → redirect to results.html
 *  results.html → reads result from sessionStorage → renders verdict, score, bar, insights
 *  history.html → reads localStorage history → renders chat bubbles
 */

document.addEventListener('DOMContentLoaded', () => {
    const path = window.location.pathname;

    // ─────────────────────────────────────────────────────────────────────────
    // GLOBAL UI (Mobile Menu)
    // ─────────────────────────────────────────────────────────────────────────
    const mobileMenuBtn = document.getElementById('mobile-menu-btn');
    const mobileMenu    = document.getElementById('mobile-menu');
    
    if (mobileMenuBtn && mobileMenu) {
        mobileMenuBtn.addEventListener('click', () => {
            mobileMenu.classList.toggle('hidden');
        });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // HOME PAGE  (index.html)
    // ─────────────────────────────────────────────────────────────────────────
    if (path === '/' || path.endsWith('index.html')) {
        const uploadBtn = document.getElementById('upload-btn');
        const cameraBtn = document.getElementById('camera-btn');
        const fileInput = document.getElementById('file-input');
        const cameraInput = document.getElementById('camera-input');
        const dropZone  = document.getElementById('drop-zone');

        uploadBtn?.addEventListener('click', () => {
            fileInput.removeAttribute('capture');
            fileInput.click();
        });

        cameraBtn?.addEventListener('click', () => {
            if (cameraInput) {
                cameraInput.click();
            } else {
                fileInput.setAttribute('capture', 'environment');
                fileInput.click();
            }
        });

        fileInput?.addEventListener('change', e => handleFileSelection(e.target.files[0]));
        cameraInput?.addEventListener('change', e => handleFileSelection(e.target.files[0]));

        if (dropZone) {
            dropZone.addEventListener('click', () => {
                fileInput.removeAttribute('capture');
                fileInput.click();
            });
            dropZone.addEventListener('dragover', e => {
                e.preventDefault();
                dropZone.classList.add('bg-surface-container-low', 'border-primary');
            });
            dropZone.addEventListener('dragleave', e => {
                e.preventDefault();
                dropZone.classList.remove('bg-surface-container-low', 'border-primary');
            });
            dropZone.addEventListener('drop', e => {
                e.preventDefault();
                dropZone.classList.remove('bg-surface-container-low', 'border-primary');
                const file = e.dataTransfer.files?.[0];
                if (file) handleFileSelection(file);
            });
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // DETECT PAGE  (detect.html)
    // ─────────────────────────────────────────────────────────────────────────
    if (path.endsWith('detect.html')) {
        const previewArea = document.getElementById('preview-area');
        const analyzeBtn  = document.getElementById('analyze-btn');
        const storedImage = sessionStorage.getItem('uploadedImage');

        if (!storedImage) {
            // Accessed directly without an image — go home
            window.location.href = 'index.html';
            return;
        }

        showPreview(storedImage, previewArea, analyzeBtn);

        analyzeBtn?.addEventListener('click', async () => {
            if (analyzeBtn.disabled) return;

            // UI: loading state
            analyzeBtn.disabled = true;
            analyzeBtn.innerHTML = '<span class="material-symbols-outlined animate-spin inline-block">sync</span> Analyzing…';
            analyzeBtn.classList.add('cursor-not-allowed', 'opacity-70');

            try {
                // Convert stored base64 → Blob → send to backend
                const storedDataUrl = sessionStorage.getItem('uploadedImage');
                const filename      = sessionStorage.getItem('uploadedFileName') || 'image.jpg';
                const blob          = DetectorAPI.dataUrlToBlob(storedDataUrl);
                const file          = new File([blob], filename, { type: blob.type });

                const result = await DetectorAPI.analyze(file);

                // Persist result for results.html
                sessionStorage.setItem('analysisResult', JSON.stringify(result));
                sessionStorage.removeItem('resultSaved'); // allow history to save fresh

                window.location.href = 'results.html';

            } catch (err) {
                // Reset button and show user-friendly error
                analyzeBtn.disabled = false;
                analyzeBtn.innerHTML = 'Analyze Image';
                analyzeBtn.classList.remove('cursor-not-allowed', 'opacity-70');

                showError(
                    previewArea,
                    `Could not reach the detection server. Make sure it is running at <code>http://localhost:8000</code>.<br><small>${err.message}</small>`
                );
            }
        });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // RESULTS PAGE  (results.html)
    // ─────────────────────────────────────────────────────────────────────────
    if (path.endsWith('results.html')) {
        const storedResult = sessionStorage.getItem('analysisResult');
        const storedImage  = sessionStorage.getItem('uploadedImage');

        if (!storedResult) {
            // No result — redirect home
            window.location.href = 'index.html';
            return;
        }

        const result = JSON.parse(storedResult);
        const isFake = result.verdict_class === 'ai';

        // ── Image preview ──────────────────────────────────────────────────
        const resultImage = document.getElementById('result-image');
        if (resultImage && storedImage) resultImage.src = storedImage;

        // ── Filename ───────────────────────────────────────────────────────
        const resultFilename = document.getElementById('result-filename');
        if (resultFilename) {
            resultFilename.textContent = result.filename || sessionStorage.getItem('uploadedFileName') || '—';
        }

        // ── File size ──────────────────────────────────────────────────────
        const sizeEl = document.querySelector('[data-result="filesize"]');
        if (sizeEl && result.filesize_kb) sizeEl.textContent = result.filesize_kb + ' KB';

        // ── Verdict badge & heading ────────────────────────────────────────
        const verdictHeading = document.querySelector('h2.font-h1');
        const verdictBadge   = document.querySelector('.bg-primary-container');

        if (verdictHeading) verdictHeading.textContent = result.verdict;

        if (isFake && verdictBadge) {
            verdictBadge.classList.remove('bg-primary-container', 'text-on-primary-container', 'border-primary');
            verdictBadge.classList.add('bg-error-container', 'text-on-error-container', 'border-error');
            const icon = verdictBadge.querySelector('.material-symbols-outlined');
            if (icon) icon.textContent = 'warning';
        }

        if (isFake && verdictHeading) verdictHeading.classList.add('text-error');

        // ── Confidence score ───────────────────────────────────────────────
        const resultScore = document.getElementById('result-score');
        if (resultScore) {
            resultScore.textContent = result.confidence + '%';
            if (isFake) {
                resultScore.classList.remove('text-primary');
                resultScore.classList.add('text-error');
            }
        }

        // ── AI Probability bar ─────────────────────────────────────────────
        const aiProbBar  = document.querySelector('.bg-error.rounded-full');   // the filled bar
        const aiProbText = document.querySelector('.text-primary.font-bold, [data-result="prob-text"]');

        if (aiProbBar) {
            const pct = result.ai_probability ?? (isFake ? 100 - result.confidence : result.confidence);
            aiProbBar.style.width = pct + '%';
        }

        // Update the "Very Low (6%)" label dynamically
        const probLabelEl = document.querySelector('.text-primary.text-primary');
        if (probLabelEl && result.ai_probability !== undefined) {
            const level = result.ai_probability < 25 ? 'Very Low'
                        : result.ai_probability < 50 ? 'Low'
                        : result.ai_probability < 75 ? 'High'
                        : 'Very High';
            // probLabelEl.textContent = `${level} (${result.ai_probability}%)`;
            if (isFake) {
                probLabelEl.classList.remove('text-primary');
                probLabelEl.classList.add('text-error');
            }
        }

        // ── Insight cards ──────────────────────────────────────────────────
        if (result.insights && result.insights.length > 0) {
            const insightsContainer = document.querySelector('.grid.grid-cols-1.gap-4');
            if (insightsContainer) {
                insightsContainer.innerHTML = result.insights.map(insight => `
                    <div class="bg-surface-container-lowest p-4 rounded-lg flex items-start gap-4 border border-outline-variant shadow-sm">
                        <div class="bg-secondary-container text-on-secondary-container p-2 rounded-full flex-shrink-0">
                            <span class="material-symbols-outlined">info</span>
                        </div>
                        <div>
                            <h4 class="font-h3 text-h3 text-on-surface">${escapeHtml(insight.label)}</h4>
                            <p class="font-body-md text-body-md text-on-surface-variant">${escapeHtml(insight.finding)}</p>
                        </div>
                    </div>`).join('');
            }
        }

        // ── Save to history (only once per result) ─────────────────────────
        if (!sessionStorage.getItem('resultSaved')) {
            const history = JSON.parse(localStorage.getItem('realorfake_history') || '[]');
            history.unshift({
                id:          Date.now(),
                image:       storedImage,
                filename:    result.filename || sessionStorage.getItem('uploadedFileName'),
                score:       result.confidence,
                isFake:      isFake,
                verdict:     result.verdict,
                timestamp:   new Intl.DateTimeFormat('en-US', {
                    hour: 'numeric', minute: 'numeric', hour12: true,
                    month: 'short', day: 'numeric'
                }).format(new Date())
            });
            if (history.length > 10) history.pop();
            try {
                localStorage.setItem('realorfake_history', JSON.stringify(history));
                sessionStorage.setItem('resultSaved', 'true');
            } catch (e) {
                console.warn('localStorage quota exceeded:', e);
            }
        }

        // ── Check Another button ───────────────────────────────────────────
        document.getElementById('check-another-btn')?.addEventListener('click', () => {
            sessionStorage.removeItem('uploadedImage');
            sessionStorage.removeItem('uploadedFileName');
            sessionStorage.removeItem('analysisResult');
            sessionStorage.removeItem('resultSaved');
            window.location.href = 'index.html';
        });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // HISTORY PAGE  (history.html)
    // ─────────────────────────────────────────────────────────────────────────
    if (path.endsWith('history.html')) {
        const historyFeed = document.getElementById('history-feed');
        const clearBtn    = document.getElementById('clear-history-btn');

        renderHistory();

        clearBtn?.addEventListener('click', () => {
            localStorage.removeItem('realorfake_history');
            renderHistory();
        });

        function renderHistory() {
            if (!historyFeed) return;
            const history = JSON.parse(localStorage.getItem('realorfake_history') || '[]');

            if (history.length === 0) {
                historyFeed.innerHTML = `
                    <div class="text-center p-8 font-body-lg text-body-lg text-on-surface-variant">
                        No history yet. Verify an image first!
                    </div>`;
                return;
            }

            historyFeed.innerHTML = history.map(item => {
                const verdictClass = item.isFake
                    ? 'bg-error-container text-on-error-container'
                    : 'bg-secondary-container text-on-secondary-container';
                const textClass = item.isFake ? 'text-on-error-container' : 'text-on-secondary-container';
                const icon      = item.isFake ? 'warning' : 'check_circle';
                const label     = item.verdict || (item.isFake ? 'Likely AI Generated' : 'Likely Real');

                return `
                <div class="flex flex-col gap-2 w-full mt-4">
                    <div class="flex gap-4 items-end self-start max-w-[85%]">
                        <div class="w-12 h-12 rounded-full bg-surface-container-high flex items-center justify-center shrink-0 border border-outline-variant">
                            <span class="material-symbols-outlined text-on-surface-variant">person</span>
                        </div>
                        <div class="bg-surface p-3 rounded-2xl rounded-bl-none shadow-sm border border-outline-variant">
                            <img alt="Analyzed image thumbnail"
                                 class="w-48 h-32 object-cover rounded-lg mb-2"
                                 src="${item.image}"/>
                            <p class="font-body-md text-body-md text-on-surface-variant text-sm">
                                Uploaded at ${item.timestamp}
                            </p>
                        </div>
                    </div>
                    <div class="flex gap-4 items-end self-end max-w-[85%]">
                        <div class="${verdictClass} p-4 rounded-2xl rounded-br-none shadow-[0_4px_20px_rgba(0,0,0,0.15)]">
                            <div class="flex items-center gap-2 mb-2">
                                <span class="material-symbols-outlined ${textClass}"
                                      style="font-variation-settings:'FILL' 1;">${icon}</span>
                                <span class="font-h3 text-h3 ${textClass}">${label}</span>
                            </div>
                            <p class="font-body-md text-body-md ${textClass}">
                                Confidence: <span class="font-bold">${item.score}%</span>
                            </p>
                        </div>
                        <div class="w-12 h-12 rounded-full bg-secondary flex items-center justify-center shrink-0 text-on-secondary shadow-md">
                            <span class="material-symbols-outlined">robot_2</span>
                        </div>
                    </div>
                </div>`;
            }).join('');
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // SHARED HELPERS
    // ─────────────────────────────────────────────────────────────────────────

    function handleFileSelection(file) {
        if (!file) return;
        
        // Show loading state on buttons (optional but good for UX on slow phones)
        const uploadBtn = document.getElementById('upload-btn');
        const cameraBtn = document.getElementById('camera-btn');
        if (uploadBtn) uploadBtn.style.opacity = '0.5';
        if (cameraBtn) cameraBtn.style.opacity = '0.5';

        const reader = new FileReader();
        reader.onload = e => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;
                const maxDim = 1200; // max width or height to stay safely under 5MB limit

                if (width > height) {
                    if (width > maxDim) {
                        height = Math.round(height * (maxDim / width));
                        width = maxDim;
                    }
                } else {
                    if (height > maxDim) {
                        width = Math.round(width * (maxDim / height));
                        height = maxDim;
                    }
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                
                // Compress as JPEG
                const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
                
                try {
                    sessionStorage.setItem('uploadedImage', dataUrl);
                    sessionStorage.setItem('uploadedFileName', file.name || 'camera_photo.jpg');
                    window.location.href = 'detect.html';
                } catch (err) {
                    alert('Image could not be processed. Please try a smaller image.');
                    console.error('sessionStorage error:', err);
                    if (uploadBtn) uploadBtn.style.opacity = '1';
                    if (cameraBtn) cameraBtn.style.opacity = '1';
                }
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    }

    function showPreview(dataUrl, previewArea, analyzeBtn) {
        if (previewArea) {
            previewArea.innerHTML = `
                <img src="${dataUrl}"
                     class="w-full h-full object-contain rounded-lg max-h-[300px]"
                     alt="Preview">`;
        }
        if (analyzeBtn) {
            analyzeBtn.disabled = false;
            analyzeBtn.classList.remove('cursor-not-allowed', 'bg-surface-variant', 'text-outline');
            analyzeBtn.classList.add('bg-primary', 'text-on-primary', 'hover:bg-primary-fixed-dim');
            analyzeBtn.textContent = 'Analyze Image';
        }
    }

    function showError(container, htmlMessage) {
        if (!container) return;
        const banner = document.createElement('div');
        banner.className = 'w-full mt-4 bg-error-container text-on-error-container rounded-xl p-4 font-body-md text-body-md';
        banner.innerHTML = `<strong>Error:</strong> ${htmlMessage}`;
        container.after(banner);
        // Auto-remove after 8 s
        setTimeout(() => banner.remove(), 8000);
    }

    function escapeHtml(str) {
        const d = document.createElement('div');
        d.textContent = str;
        return d.innerHTML;
    }
});