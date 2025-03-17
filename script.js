document.addEventListener('DOMContentLoaded', async () => {
    const videoElement = document.getElementById('videoElement');
    const startButton = document.getElementById('startCamera');
    const stopButton = document.getElementById('stopCamera');
    const toggleSpeechBtn = document.getElementById('toggleSpeech');
    const predictionText = document.getElementById('prediction');
    const canvas = document.getElementById('canvas');
    const ctx = canvas.getContext('2d');
    const languageSelector = document.getElementById('voiceLanguage');

    let stream = null;
    let model = null;
    let detecting = false;
    let speechSynthesis = window.speechSynthesis;
    let lastSpokenObjects = [];

    async function loadModel() {
        try {
            predictionText.innerHTML = '<i class="fas fa-cog fa-spin"></i> Loading AI model...';
            model = await cocoSsd.load();
            console.log("COCO-SSD model loaded successfully!");
            predictionText.innerHTML = '<i class="fas fa-check"></i> Model loaded. Start camera to begin.';
        } catch (error) {
            console.error("Error loading model:", error);
            predictionText.innerText = "Error loading model.";
        }
    }

    async function startCamera() {
        try {
            console.log("Requesting camera access...");
            stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
            videoElement.srcObject = stream;
            startButton.disabled = true;
            stopButton.disabled = false;
            predictionText.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Camera started. Detecting objects...';
            detectObjects();
        } catch (error) {
            console.error("Error accessing camera:", error);
            alert("Unable to access camera. Check permissions and ensure it's not in use by another app.");
        }
    }

    function stopCamera() {
        if (stream) {
            stream.getTracks().forEach(track => track.stop());
            videoElement.srcObject = null;
            startButton.disabled = false;
            stopButton.disabled = true;
            detecting = false;
            predictionText.innerHTML = '<i class="fas fa-camera-slash"></i> Camera stopped.';
            
            // Cancel any ongoing speech when camera stops
            speechSynthesis.cancel();
        }
    }

    async function detectObjects() {
        detecting = true;
        
        if (!model) {
            console.warn("Model not loaded yet. Waiting...");
            return;
        }
        
        // Wait for the video to be properly loaded
        if (videoElement.readyState < 2) {
            await new Promise(resolve => {
                videoElement.onloadeddata = () => {
                    resolve();
                };
            });
        }
        
        // Set canvas dimensions to match video
        canvas.width = videoElement.videoWidth;
        canvas.height = videoElement.videoHeight;

        while (detecting) {
            const predictions = await model.detect(videoElement);
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);

            // Display predictions with icons
            if (predictions.length > 0) {
                predictionText.innerHTML = `<i class="fas fa-check-circle"></i> Detected: ${predictions.map(p => `<strong>${p.class}</strong> (${Math.round(p.score * 100)}%)`).join(", ")}`;
                
                // Speak detected objects
                speakDetectedObjects(predictions);
                
                // Draw bounding boxes
                predictions.forEach(prediction => {
                    const [x, y, width, height] = prediction.bbox;
                    
                    // Draw rectangle
                    ctx.strokeStyle = '#e74c3c';
                    ctx.lineWidth = 4;
                    ctx.strokeRect(x, y, width, height);
                    
                    // Draw label background
                    ctx.fillStyle = 'rgba(231, 76, 60, 0.8)';
                    const textWidth = ctx.measureText(prediction.class).width;
                    ctx.fillRect(x, y - 30, textWidth + 20, 30);
                    
                    // Draw text
                    ctx.fillStyle = '#ffffff';
                    ctx.font = '18px Roboto';
                    ctx.fillText(prediction.class, x + 10, y - 10);
                });
            } else {
                predictionText.innerHTML = '<i class="fas fa-search"></i> No objects detected';
            }

            await new Promise(resolve => setTimeout(resolve, 500));
        }
    }
    
    function speakDetectedObjects(predictions) {
        // Don't speak if speech is disabled
        if (!speechEnabled) {
            return;
        }
        
        // Get current object classes
        const currentObjects = predictions.map(p => p.class);
        
        // Filter for objects with confidence over 50%
        const highConfidenceObjects = predictions
            .filter(p => p.score > 0.5)
            .map(p => p.class);
            
        // Check if we have new objects to announce
        const newObjects = highConfidenceObjects.filter(obj => !lastSpokenObjects.includes(obj));
        
        if (newObjects.length > 0) {
            // Cancel any ongoing speech
            speechSynthesis.cancel();
            
            // Create message for new objects
            let message;
            if (newObjects.length === 1) {
                message = `I see a ${newObjects[0]}`;
            } else {
                const lastObject = newObjects.pop();
                message = `I see ${newObjects.join(', ')} and a ${lastObject}`;
            }
            
            // Create and speak utterance
            const utterance = new SpeechSynthesisUtterance(message);
            utterance.lang = languageSelector.value; // Use selected language
            utterance.rate = 1.0;
            utterance.pitch = 1.0;
            utterance.volume = 1.0;
            
            // Try to find a voice that matches the selected language
            const voices = speechSynthesis.getVoices();
            const matchingVoice = voices.find(voice => voice.lang === languageSelector.value);
            if (matchingVoice) {
                utterance.voice = matchingVoice;
            }
            
            speechSynthesis.speak(utterance);
            
            // Update last spoken objects
            lastSpokenObjects = highConfidenceObjects;
        }
    }

    await loadModel();
    startButton.addEventListener('click', startCamera);
    stopButton.addEventListener('click', stopCamera);
    
    // Load voices when available
    function loadVoices() {
        return new Promise((resolve) => {
            let voices = speechSynthesis.getVoices();
            if (voices.length) {
                resolve(voices);
            } else {
                speechSynthesis.onvoiceschanged = () => {
                    voices = speechSynthesis.getVoices();
                    resolve(voices);
                };
            }
        });
    }
    
    // Initialize voices
    loadVoices().then(voices => {
        console.log(`Loaded ${voices.length} voices for speech synthesis`);
    });
    
    // Add speech toggle functionality
    let speechEnabled = true;
    toggleSpeechBtn.addEventListener('click', () => {
        speechEnabled = !speechEnabled;
        if (speechEnabled) {
            toggleSpeechBtn.innerHTML = '<i class="fas fa-volume-up"></i> Speech On';
            toggleSpeechBtn.classList.remove('off');
        } else {
            toggleSpeechBtn.innerHTML = '<i class="fas fa-volume-mute"></i> Speech Off';
            toggleSpeechBtn.classList.add('off');
            speechSynthesis.cancel(); // Cancel any ongoing speech
        }
    });
    
    // Add language change listener
    languageSelector.addEventListener('change', () => {
        // Announce language change if speech is enabled
        if (speechEnabled) {
            speechSynthesis.cancel(); // Cancel any ongoing speech
            const utterance = new SpeechSynthesisUtterance(`Voice language changed to ${languageSelector.options[languageSelector.selectedIndex].text}`);
            utterance.lang = languageSelector.value;
            speechSynthesis.speak(utterance);
        }
    });
});