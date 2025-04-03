import { useState, useCallback, useRef } from 'react';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { ImageBatchUploader } from './ImageBatchUploader';
import { QueuedImage } from './ImageProcessingQueue';
import './ImageProcessing.css';

// API rate limiting - Track recent calls to prevent 429 errors
const API_CALLS_HISTORY: number[] = [];
const MAX_CALLS_PER_MINUTE = 10; // Adjust based on your API tier
const CALLS_WINDOW_MS = 60000; // 1 minute window

// Helper to check if we should rate limit
const shouldRateLimit = () => {
  // Remove calls older than the window
  const now = Date.now();
  
  // Keep only recent calls
  while (API_CALLS_HISTORY.length > 0 && now - API_CALLS_HISTORY[0] >= CALLS_WINDOW_MS) {
    API_CALLS_HISTORY.shift();
  }
  
  // Check if we've made too many calls recently
  return API_CALLS_HISTORY.length >= MAX_CALLS_PER_MINUTE;
};

const GEMINI_API_KEY_STORAGE_KEY = 'gemini_api_key';

const generationConfig = {
  temperature: 1,
  topP: 0.95,
  topK: 40,
  maxOutputTokens: 8192,
  responseModalities: ["image", "text"],
  responseMimeType: "text/plain",
};

interface QuickAction {
  id: string;
  label: string;
  prompt: string;
  description: string;
}

const quickActions: QuickAction[] = [
  {
    id: 'remove-bg',
    label: 'Remove Background',
    prompt: 'Please remove the background and make it completely white',
    description: 'Removes the background and replaces it with white'
  },
  {
    id: 'enhance',
    label: 'Enhance Quality',
    prompt: 'Please enhance this image to make it more professional and high quality',
    description: 'Improves overall image quality'
  },
  {
    id: 'cartoon',
    label: 'Cartoon Style',
    prompt: 'Convert this image into a cartoon style illustration',
    description: 'Converts the image to cartoon style'
  },
  {
    id: 'vibrant',
    label: 'Make Vibrant',
    prompt: 'Make the colors more vibrant and eye-catching',
    description: 'Enhances color vibrancy'
  }
];

export const GeminiTab = () => {
  const [apiKey, setApiKey] = useState(() => {
    return localStorage.getItem(GEMINI_API_KEY_STORAGE_KEY) || '';
  });
  const [images, setImages] = useState<QueuedImage[]>([]);
  const [selectedAction, setSelectedAction] = useState<QuickAction>(quickActions[0]);
  const [processedImages, setProcessedImages] = useState<QueuedImage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  
  // Processing state
  const [currentImageIndex, setCurrentImageIndex] = useState(-1);
  const abortControllerRef = useRef<AbortController | null>(null);

  const handleImagesSelected = useCallback((selectedImages: any[]) => {
    if (isProcessing) {
      setError("Cannot change images while processing is in progress");
      return;
    }
    setImages(selectedImages);
    setProcessedImages([]);
    setCurrentImageIndex(-1);
  }, [isProcessing]);

  const processImage = useCallback(async (file: File): Promise<string> => {
    if (!apiKey) throw new Error('API key is required');

    console.log('Processing image:', file.name, 'with action:', selectedAction.id);

    // Check if we should rate limit
    if (shouldRateLimit()) {
      const waitTime = Math.ceil((CALLS_WINDOW_MS - (Date.now() - API_CALLS_HISTORY[0])) / 1000);
      throw new Error(`Rate limit reached. Please wait ${waitTime} seconds before trying again.`);
    }

    // Record this API call
    API_CALLS_HISTORY.push(Date.now());
    console.log('API calls in last minute:', API_CALLS_HISTORY.length);

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: "gemini-2.0-flash-exp-image-generation",
    });

    const base64Image = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const base64String = reader.result as string;
        resolve(base64String.split(',')[1]);
      };
      reader.onerror = error => reject(error);
    });

    console.log('Sending API request for:', file.name);
    const chatSession = model.startChat({
      generationConfig,
      history: [
        {
          role: "user",
          parts: [
            {
              inlineData: {
                mimeType: file.type,
                data: base64Image
              }
            },
            { text: selectedAction.prompt }
          ]
        }
      ]
    });

    const result = await chatSession.sendMessage("");
    console.log('Received API response for:', file.name);
    
    if (!result.response?.candidates?.[0]?.content?.parts) {
      throw new Error('Invalid response from Gemini API');
    }

    for (const part of result.response.candidates[0].content.parts) {
      if (part.inlineData) {
        return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
      }
    }

    throw new Error('No processed image found in response');
  }, [apiKey, selectedAction]);

  // Function to process all images sequentially
  const processAllImages = useCallback(async () => {
    if (images.length === 0) {
      setError("No images to process");
      return;
    }

    if (!apiKey) {
      setError("API key is required");
      return;
    }

    try {
      setIsProcessing(true);
      setError(null);
      
      // Create a new abort controller for this processing session
      abortControllerRef.current = new AbortController();
      const signal = abortControllerRef.current.signal;
      
      // Create a copy of the current state
      const workingImages: QueuedImage[] = images.map(img => ({
        ...img,
        status: 'queued',
        result: undefined, 
        error: undefined
      }));
      
      setProcessedImages(workingImages);
      
      // Process each image sequentially
      for (let i = 0; i < workingImages.length; i++) {
        // Check if processing was aborted
        if (signal.aborted) {
          console.log('Processing aborted');
          break;
        }
        
        // Update status to processing
        workingImages[i] = {
          ...workingImages[i],
          status: 'processing'
        };
        
        setCurrentImageIndex(i);
        setProcessedImages([...workingImages]);
        
        try {
          console.log(`Processing image ${i + 1}/${workingImages.length}: ${workingImages[i].file.name}`);
          const result = await processImage(workingImages[i].file);
          
          // Update with result
          workingImages[i] = {
            ...workingImages[i],
            status: 'completed',
            result
          };
          
          setProcessedImages([...workingImages]);
          
          // Add delay between images to avoid rate limits
          if (i < workingImages.length - 1) {
            console.log('Waiting 2 seconds before processing next image...');
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
        } catch (error: any) {
          console.error('Error processing image:', error);
          
          workingImages[i] = {
            ...workingImages[i],
            status: 'error',
            error: error.message
          };
          
          setProcessedImages([...workingImages]);
          
          // Continue with next image
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
    } finally {
      setIsProcessing(false);
      setCurrentImageIndex(-1);
      abortControllerRef.current = null;
    }
  }, [images, apiKey, processImage]);

  // Function to cancel ongoing processing
  const cancelProcessing = useCallback(() => {
    if (abortControllerRef.current) {
      console.log('Aborting processing');
      abortControllerRef.current.abort();
      setError("Processing cancelled");
    }
  }, []);

  const clearAll = useCallback(() => {
    if (isProcessing) {
      setError("Cannot clear while processing is in progress");
      return;
    }
    setImages([]);
    setProcessedImages([]);
    setError(null);
    setCurrentImageIndex(-1);
    console.log('Cleared all images and processing history');
  }, [isProcessing]);

  const sendToImgly = useCallback(() => {
    const successfullyProcessed = processedImages.filter(img => img.status === 'completed');
    console.log('Sending to IMGLY:', successfullyProcessed.length, 'images');
    
    if (successfullyProcessed.length === 0) {
      setError("No successfully processed images to send to IMGLY");
      return;
    }

    try {
      // Store the processed images in localStorage
      const imagesForImgly = successfullyProcessed.map(img => ({
        id: img.id,
        preview: img.preview,
        result: img.result,
        file: {
          name: img.file.name,
          type: img.file.type,
          size: img.file.size
        }
      }));
      
      // Save to localStorage
      localStorage.setItem('gemini_processed_images', JSON.stringify(imagesForImgly));
      
      // Show success message
      setError(null);
      
      // Provide visual feedback
      alert(`${successfullyProcessed.length} images sent to IMGLY tab. Please switch to the IMGLY tab to continue processing.`);
      
    } catch (error) {
      console.error('Error sending to IMGLY:', error);
      setError("Failed to send images to IMGLY. See console for details.");
    }
  }, [processedImages, setError]);

  return (
    <div className="gemini-container">
      <div className="input-section">
        <input
          type="password"
          placeholder="Enter your Gemini API key"
          value={apiKey}
          onChange={(e) => {
            const value = e.target.value;
            setApiKey(value);
            if (value) {
              localStorage.setItem(GEMINI_API_KEY_STORAGE_KEY, value);
            } else {
              localStorage.removeItem(GEMINI_API_KEY_STORAGE_KEY);
            }
          }}
          className="api-key-input"
        />

        <div className="action-selection">
          <h3>1. Select Action</h3>
        <div className="quick-actions">
          {quickActions.map(action => (
            <button
              key={action.id}
              onClick={() => setSelectedAction(action)}
              className={`action-button ${selectedAction.id === action.id ? 'active' : ''}`}
              title={action.description}
                disabled={isProcessing}
            >
              {action.label}
            </button>
          ))}
          </div>
        </div>

        <div className="image-upload-section">
          <h3>2. Upload Images</h3>
        <ImageBatchUploader
          onImagesSelected={handleImagesSelected}
          maxFiles={5}
        />
        </div>

        {error && (
          <div className="error-message">
            {error}
          </div>
        )}

        <div className="processing-section">
          <h3>3. Process Images</h3>
          <div className="processing-controls">
            <button 
              onClick={processAllImages}
              disabled={isProcessing || images.length === 0}
              className="process-button"
            >
              {isProcessing ? 'Processing...' : 'Process All Images with Gemini'}
            </button>
            
            {isProcessing && (
              <button 
                onClick={cancelProcessing}
                className="cancel-button"
              >
                Cancel Processing
              </button>
            )}
            
            <button 
              onClick={clearAll}
              disabled={isProcessing || (images.length === 0 && processedImages.length === 0)}
              className="clear-button"
            >
              Clear All
            </button>
          </div>
          
          {isProcessing && (
            <div className="processing-status">
              Processing image {currentImageIndex + 1} of {images.length}
            </div>
          )}
          
          <div className="images-preview">
            {processedImages.map((image, index) => (
              <div key={image.id} className={`image-item ${image.status}`}>
                <div className="image-preview">
                  <img 
                    src={image.status === 'completed' ? image.result : image.preview} 
                    alt={`Image ${index + 1}`}
                  />
                </div>
                <div className="image-status">
                  {image.status === 'queued' && 'Waiting...'}
                  {image.status === 'processing' && 'Processing...'}
                  {image.status === 'completed' && 'Completed'}
                  {image.status === 'error' && `Error: ${image.error}`}
                </div>
                {image.status === 'completed' && image.result && (
                  <a 
                    href={image.result} 
                    download={`gemini-processed-${image.file.name}`}
                    className="download-button small"
                    onClick={(e) => {
                      e.stopPropagation();
                    }}
                  >
                    Download Result
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>

        {processedImages.some(img => img.status === 'completed') && (
          <div className="final-actions">
            <h3>4. Send to IMGLY</h3>
            <button 
              onClick={sendToImgly}
              className="send-to-imgly-button"
              title="Send processed images to IMGLY for final background removal"
              disabled={isProcessing}
            >
              Send to IMGLY for Final Processing
            </button>
          </div>
        )}
      </div>
    </div>
  );
};