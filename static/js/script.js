document.addEventListener("DOMContentLoaded", () => {
    
    // --- Scroll Animations ---
    const animatedElements = document.querySelectorAll('.animate-on-scroll');
    
    if (animatedElements.length > 0) {
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('fade-in-up');
                    observer.unobserve(entry.target);
                }
            });
        }, { threshold: 0.1, rootMargin: "0px 0px -50px 0px" });

        animatedElements.forEach(el => observer.observe(el));
    }


    // --- Drag and Drop Logic (Predict Page) ---
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');
    const imagePreview = document.getElementById('image-preview');
    const placeholderText = document.getElementById('placeholder-text');
    const analyzeBtn = document.getElementById('analyze-btn');
    const loadingState = document.getElementById('loading-state');

    if (dropZone && fileInput) {
        // Handle drag events
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            dropZone.addEventListener(eventName, preventDefaults, false);
        });

        function preventDefaults(e) {
            e.preventDefault();
            e.stopPropagation();
        }

        ['dragenter', 'dragover'].forEach(eventName => {
            dropZone.addEventListener(eventName, () => {
                dropZone.classList.add('dragover');
            });
        });

        ['dragleave', 'drop'].forEach(eventName => {
            dropZone.addEventListener(eventName, () => {
                dropZone.classList.remove('dragover');
            });
        });

        // Handle File Drop
        dropZone.addEventListener('drop', (e) => {
            const dt = e.dataTransfer;
            const files = dt.files;
            
            if (files.length > 0) {
                fileInput.files = files; // Assign files to input
                handleFiles(files[0]);
            }
        });

        // Handle File Select (Click)
        fileInput.addEventListener('change', function() {
            if (this.files && this.files[0]) {
                handleFiles(this.files[0]);
            }
        });

        function handleFiles(file) {
            if (!file.type.startsWith('image/')) {
                alert('Please upload an image file.');
                return;
            }

            const reader = new FileReader();
            reader.onload = (e) => {
                imagePreview.src = e.target.result;
                imagePreview.style.display = 'block';
                imagePreview.classList.add('fade-in-up');
                
                if (placeholderText) placeholderText.style.display = 'none';
                if (analyzeBtn) analyzeBtn.disabled = false;
            }
            reader.readAsDataURL(file);
        }

        // Handle analyze button click for loading state animation and API fetch
        const uploadForm = document.getElementById('upload-form');
        const resultsSection = document.getElementById('results-section');

        if (uploadForm && analyzeBtn && loadingState) {
            uploadForm.addEventListener('submit', async (e) => {
                e.preventDefault(); // Stop normal submission
                
                if(!analyzeBtn.disabled) {
                    analyzeBtn.style.display = 'none';
                    loadingState.style.display = 'block';

                    // Prepare data
                    const formData = new FormData(uploadForm);

                    try {
                        const response = await fetch('/api/predict', {
                            method: 'POST',
                            body: formData
                        });

                        const result = await response.json();

                        if (result.success) {
                            renderResults(result);
                        } else {
                            alert("Error analyzing image: " + result.error);
                            resetState();
                        }
                    } catch (error) {
                        console.error("Fetch error: ", error);
                        alert("An error occurred while communicating with the server.");
                        resetState();
                    }
                }
            });
        }
        
        function resetState() {
            analyzeBtn.style.display = 'block';
            loadingState.style.display = 'none';
        }

        // Dynamically create or update results section without reloading the page
        function renderResults(data) {
            loadingState.style.display = 'none';
            analyzeBtn.style.display = 'none'; // Keep it hidden after successful analysis

            // Check if results container exists, if not, create it
            let resultsDiv = document.getElementById('dynamic-results-section');
            if (!resultsDiv) {
                resultsDiv = document.createElement('div');
                resultsDiv.id = 'dynamic-results-section';
                resultsDiv.className = 'row justify-content-center animate-on-scroll fade-in-up mt-5';
                uploadForm.closest('.container').parentElement.appendChild(resultsDiv);
            }

            const isMalignant = data.prediction === "Malignant";
            const badgeClass = isMalignant ? "malignant" : "benign";
            const bgSubtle = isMalignant ? "bg-danger-subtle" : "bg-success-subtle";
            const textClass = isMalignant ? "text-danger" : "text-success";
            const iconClass = isMalignant ? "bi-exclamation-triangle-fill" : "bi-shield-check";
            const progressClass = isMalignant ? "bg-danger" : "bg-success";

            resultsDiv.innerHTML = `
            <div class="col-lg-8 col-md-10">
                <div class="glass-panel p-4 p-md-5 result-card ${badgeClass} mx-2 mb-5">
                    
                    <div class="text-center mb-4">
                        <span class="badge bg-light text-dark px-3 py-2 rounded-pill shadow-sm mb-3">
                            <i class="bi bi-check-circle-fill text-success me-1"></i> Analysis Complete
                        </span>
                        <h2 class="fw-bold text-dark mb-0">Prediction Results</h2>
                    </div>

                    <div class="row align-items-center g-4">
                        <div class="col-md-5 text-center">
                            <div class="position-relative d-inline-block">
                                <img src="${data.image_path}" class="img-fluid rounded-4 shadow" style="max-height:250px; object-fit: cover;" alt="Analyzed Skin Image">
                                <div class="position-absolute bottom-0 end-0 m-2">
                                     <span class="badge bg-dark rounded-pill px-3 py-2 opacity-75"><i class="bi bi-zoom-in"></i> Analyzed</span>
                                </div>
                            </div>
                        </div>

                        <div class="col-md-7">
                            <div class="p-4 rounded-4 shadow-sm ${bgSubtle}">
                                <h5 class="text-uppercase fw-bold text-muted mb-1" style="letter-spacing: 1px;">Diagnosis</h5>
                                <h1 class="display-6 fw-bolder ${textClass} mb-3">
                                    <i class="bi ${iconClass} me-2"></i>${data.prediction}
                                </h1>
                                
                                <div class="mb-2 d-flex justify-content-between align-items-center text-dark">
                                    <span class="fw-bold fs-5">Confidence Score</span>
                                    <span class="fw-bold fs-5">${data.confidence}%</span>
                                </div>
                                
                                <div class="progress shadow-sm bg-white" style="height: 15px;">
                                    <div class="progress-bar progress-bar-striped progress-bar-animated ${progressClass}" 
                                         role="progressbar" 
                                         style="width: ${data.confidence}%;" 
                                         aria-valuenow="${data.confidence}" aria-valuemin="0" aria-valuemax="100">
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <hr class="my-4 text-muted">

                    <div class="text-muted fs-6">
                        <h6 class="fw-bold text-dark mb-2">
                            <i class="bi bi-info-circle me-1"></i> Important Disclaimer
                        </h6>
                        <p class="mb-1">
                            DermaLens is an AI-powered medical support system built using Convolutional Neural Networks for preliminary screening.
                        </p>
                        <p class="mb-0 text-dark fw-medium">
                            This tool supports awareness but <strong>does not replace professional medical consultation</strong>. Please consult a dermatologist for clinical diagnosis.
                        </p>
                    </div>
                    
                    <div class="mt-4 text-center">
                        <button class="btn btn-outline-dark rounded-pill px-4 py-2 fw-bold shadow-sm" onclick="resetPredictionView()">
                            <i class="bi bi-arrow-repeat me-2"></i>Analyze Another Image
                        </button>
                    </div>

                </div>
            </div>
            `;

            // Remove the old jinja-based results section if it exists
            const oldResults = document.getElementById('results-section');
            if (oldResults) oldResults.remove();
            
            // Append right after the upload container
            document.querySelector('.predict-bg .container.z-index-1').appendChild(resultsDiv);

            // Smooth scroll to it
            setTimeout(() => {
                resultsDiv.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 100);

            // Dynamically add to history carousel
            addToHistoryCarousel(data);
        }

        function addToHistoryCarousel(data) {
            const carousel = document.getElementById('history-carousel');
            
            // If the carousel doesn't exist yet (first ever prediction for this user), we might need to reload 
            // the page to get the container rendered by Jinja, or we just silently fail/build it.
            // For a smooth experience, if it exists, prepend it:
            if (carousel) {
                const isMalignant = data.prediction === "Malignant";
                const badgeClass = isMalignant ? "bg-danger" : "bg-success";
                const textClass = isMalignant ? "text-danger" : "text-success";
                const iconClass = isMalignant ? "bi-exclamation-triangle-fill" : "bi-shield-check";
                
                // Get current local time
                const now = new Date();
                const timeString = now.toLocaleString(undefined, {
                    year: 'numeric', month: 'short', day: 'numeric', 
                    hour: 'numeric', minute: '2-digit', hour12: true
                });

                const newCard = document.createElement('div');
                newCard.className = 'history-card animate-on-scroll fade-in-up';
                newCard.innerHTML = `
                    <div class="glass-panel p-3 h-100 shadow-sm d-flex flex-column text-start border border-primary">
                        <div class="position-relative mb-3 flex-grow-1 text-center" style="min-height: 150px;">
                            <img src="${data.image_path}" class="img-fluid rounded-3 shadow-sm" style="max-height: 180px; width: 100%; object-fit: cover;" alt="Past Scan">
                        </div>
                        <div>
                            <h5 class="fw-bold mb-1 ${textClass}">
                                <i class="bi ${iconClass} me-2"></i>${data.prediction}
                            </h5>
                            <div class="d-flex justify-content-between align-items-center mb-2">
                                <span class="text-muted small fw-bold">Confidence</span>
                                <span class="badge ${badgeClass}">${data.confidence}%</span>
                            </div>
                            <hr class="my-2 opacity-25">
                            <p class="text-dark small mb-0 fw-medium">
                                <i class="bi bi-calendar3 text-muted me-2"></i>
                                <span class="local-time">${timeString}</span>
                            </p>
                        </div>
                    </div>
                `;
                
                // Insert at the beginning
                carousel.insertBefore(newCard, carousel.firstChild);
                
                // Scroll carousel to the absolute left to show the new card
                carousel.scrollTo({ left: 0, behavior: 'smooth' });
            }
        }

        // Global function to reset the view for another prediction
        window.resetPredictionView = function() {
            const resultsDiv = document.getElementById('dynamic-results-section');
            if (resultsDiv) {
                resultsDiv.style.opacity = '0';
                setTimeout(() => resultsDiv.remove(), 300); // fade out effect
            }

            if (uploadForm) uploadForm.reset();
            
            if (imagePreview) {
                imagePreview.src = '#';
                imagePreview.style.display = 'none';
                imagePreview.classList.remove('fade-in-up');
            }
            
            if (placeholderText) placeholderText.style.display = 'block';
            
            if (analyzeBtn) {
                analyzeBtn.disabled = true;
                analyzeBtn.style.display = 'block';
            }

            // Scroll back to the upload zone
            document.querySelector('.predict-bg').scrollIntoView({ behavior: 'smooth', block: 'start' });
        };
    }
});
