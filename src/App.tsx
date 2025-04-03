import { useState, ChangeEvent, useEffect } from 'react'
import { removeBackground } from '@imgly/background-removal'
import { GeminiTab } from './components/GeminiTab'
import './App.css'

type OutputFormat = 'image/png' | 'image/jpeg' | 'image/webp';
type Tab = 'background-removal' | 'gemini';

interface AppConfig {
  model: 'isnet' | 'isnet_fp16' | 'isnet_quint8';
  output: {
    format: OutputFormat;
    quality: number;
    type: 'foreground' | 'background' | 'mask';
  };
}

interface GeminiProcessedImage {
  id: string;
  preview: string;
  result: string;
  file: {
    name: string;
    type: string;
    size: number;
  };
}

function App() {
  const [activeTab, setActiveTab] = useState<Tab>('background-removal');
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [processedImage, setProcessedImage] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [config, setConfig] = useState<AppConfig>({
    model: 'isnet_fp16',
    output: {
      format: 'image/png',
      quality: 0.8,
      type: 'foreground'
    }
  });
  const [pendingGeminiImages, setPendingGeminiImages] = useState<GeminiProcessedImage[]>([]);
  const [currentGeminiImageIndex, setCurrentGeminiImageIndex] = useState(-1);
  const [processedGeminiResults, setProcessedGeminiResults] = useState<{original: string, processed: string, name: string}[]>([]);
  const [isProcessingBatch, setIsProcessingBatch] = useState(false);

  // Check for pending Gemini images when tab is activated
  useEffect(() => {
    if (activeTab === 'background-removal') {
      checkForGeminiImages();
    }
  }, [activeTab]);

  // Function to check localStorage for Gemini images
  const checkForGeminiImages = () => {
    try {
      const storedImages = localStorage.getItem('gemini_processed_images');
      if (storedImages) {
        const images = JSON.parse(storedImages) as GeminiProcessedImage[];
        if (images.length > 0) {
          setPendingGeminiImages(images);
        }
      }
    } catch (error) {
      console.error('Error loading Gemini images:', error);
    }
  };

  // Function to process all Gemini images at once
  const processAllGeminiImages = async () => {
    if (pendingGeminiImages.length === 0) return;
    
    setIsProcessingBatch(true);
    setProcessedGeminiResults([]);
    
    try {
      // Process each image one by one
      for (let i = 0; i < pendingGeminiImages.length; i++) {
        const image = pendingGeminiImages[i];
        
        // Update UI to show current image
        setSelectedImage(image.result);
        setProcessedImage(null);
        setCurrentGeminiImageIndex(i);
        
        // Process the image
        const blob = await removeBackground(image.result, config);
        const url = URL.createObjectURL(blob);
        
        // Save the result
        setProcessedImage(url);
        setProcessedGeminiResults(prev => [
          ...prev, 
          {
            original: image.result,
            processed: url,
            name: image.file.name
          }
        ]);
        
        // Short delay to ensure UI updates
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      
      // All images processed
      localStorage.removeItem('gemini_processed_images');
      
    } catch (error) {
      console.error('Error in batch processing:', error);
    } finally {
      setIsProcessingBatch(false);
    }
  };

  // Function to download all processed images
  const downloadAllProcessedImages = () => {
    processedGeminiResults.forEach((result, index) => {
      const link = document.createElement('a');
      link.href = result.processed;
      link.download = `processed-${result.name || index}.${config.output.format.split('/')[1]}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      // Add slight delay between downloads to prevent browser issues
      setTimeout(() => {}, 200);
    });
  };

  // Clear Gemini images
  const clearGeminiImages = () => {
    setPendingGeminiImages([]);
    setCurrentGeminiImageIndex(-1);
    setProcessedGeminiResults([]);
    localStorage.removeItem('gemini_processed_images');
  };

  const handleImageUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedImage(URL.createObjectURL(file));
      setProcessedImage(null);
    }
  };

  const handleBackgroundRemoval = async () => {
    if (!selectedImage) return;

    setIsProcessing(true);
    try {
      const blob = await removeBackground(selectedImage, config);
      const url = URL.createObjectURL(blob);
      setProcessedImage(url);
    } catch (error) {
      console.error('Error removing background:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleConfigChange = (key: string, value: any) => {
    setConfig(prev => {
      if (key.includes('.')) {
        const [parent, child] = key.split('.');
        if (parent === 'output') {
          return {
            ...prev,
            output: {
              ...prev.output,
              [child]: value
            }
          };
        }
      }
      return {
        ...prev,
        [key]: value
      };
    });
  };

  return (
    <div className="container">
      <div className="tabs">
        <button 
          className={`tab-button ${activeTab === 'background-removal' ? 'active' : ''}`}
          onClick={() => setActiveTab('background-removal')}
        >
          Background Removal
        </button>
        <button 
          className={`tab-button ${activeTab === 'gemini' ? 'active' : ''}`}
          onClick={() => setActiveTab('gemini')}
        >
          Gemini AI
        </button>
      </div>

      {activeTab === 'background-removal' ? (
        <>
          <h1>Background Removal</h1>
          
          {/* Gemini Images Import Section */}
          {pendingGeminiImages.length > 0 && (
            <div className="gemini-import-section">
              <h3>Images from Gemini AI Available!</h3>
              <p>There are {pendingGeminiImages.length} images processed by Gemini AI ready for final background removal.</p>
              {isProcessingBatch && currentGeminiImageIndex >= 0 && (
                <p className="processing-status">
                  Processing image {currentGeminiImageIndex + 1} of {pendingGeminiImages.length}...
                </p>
              )}
              <div className="gemini-controls">
                <button 
                  onClick={processAllGeminiImages} 
                  className="gemini-load-button"
                  disabled={isProcessingBatch}
                >
                  Process All Images At Once
                </button>
                <button 
                  onClick={clearGeminiImages} 
                  className="clear-button"
                  disabled={isProcessingBatch}
                >
                  Discard Gemini Images
                </button>
              </div>
            </div>
          )}

          {/* Results section - show when batch processing is complete */}
          {processedGeminiResults.length > 0 && !isProcessingBatch && (
            <div className="batch-results-section">
              <h3>All Images Processed Successfully!</h3>
              <p>All {processedGeminiResults.length} images have been processed with transparent backgrounds.</p>
              <button 
                onClick={downloadAllProcessedImages} 
                className="download-all-button"
              >
                Download All Processed Images
              </button>
              
              <div className="results-gallery">
                {processedGeminiResults.map((result, index) => (
                  <div key={index} className="result-item">
                    <img 
                      src={result.processed} 
                      alt={`Processed ${index + 1}`} 
                      className="thumbnail"
                    />
                    <a 
                      href={result.processed} 
                      download={`processed-${result.name || index}.${config.output.format.split('/')[1]}`}
                      className="download-button small"
                    >
                      Download
                    </a>
                  </div>
                ))}
              </div>
            </div>
          )}

          <input
            type="file"
            accept="image/*"
            onChange={handleImageUpload}
            className="file-input"
          />

          <div className="config-section">
            <h3>Configuration</h3>
            <div className="config-group">
              <label title="Choose the model size. Larger models provide better quality but are slower to process. Smaller models are faster but may have some artifacts.">
                Model:
                <select 
                  value={config.model} 
                  onChange={(e) => handleConfigChange('model', e.target.value)}
                >
                  <option value="isnet" title="Best quality but slowest processing time. Recommended for high-quality results where speed is not critical.">
                    ISNet (Large)
                  </option>
                  <option value="isnet_fp16" title="Balanced option between quality and speed. Good for most use cases.">
                    ISNet FP16 (Medium)
                  </option>
                  <option value="isnet_quint8" title="Fastest processing time but may show some artifacts. Best for quick previews or when speed is crucial.">
                    ISNet Quint8 (Small)
                  </option>
                </select>
              </label>

              <label title="Select what type of output image you want to generate">
                Output Type:
                <select 
                  value={config.output.type} 
                  onChange={(e) => handleConfigChange('output.type', e.target.value)}
                >
                  <option value="foreground" title="Keeps the main subject and makes the background transparent. Perfect for placing the subject on a different background.">
                    Foreground
                  </option>
                  <option value="background" title="Removes the subject and keeps only the background. Useful for background plate creation or scene reconstruction.">
                    Background
                  </option>
                  <option value="mask" title="Creates a black and white image where white represents the subject and black represents the background. Useful for advanced editing.">
                    Mask
                  </option>
                </select>
              </label>

              <label title="Choose the output image format. Different formats have different advantages in terms of quality, file size, and transparency support.">
                Output Format:
                <select 
                  value={config.output.format} 
                  onChange={(e) => handleConfigChange('output.format', e.target.value as OutputFormat)}
                >
                  <option value="image/png" title="Best format for preserving transparency and quality. Larger file size but no quality loss.">
                    PNG
                  </option>
                  <option value="image/jpeg" title="Smallest file size but doesn't support transparency. Good for web sharing when transparency isn't needed.">
                    JPEG
                  </option>
                  <option value="image/webp" title="Modern format that supports transparency and offers good compression. Best balance between quality and file size.">
                    WebP
                  </option>
                </select>
              </label>

              <label title="Adjust the quality of the output image. Higher values mean better quality but larger file size.">
                Quality:
                <input 
                  type="range" 
                  min="0.1" 
                  max="1" 
                  step="0.1"
                  value={config.output.quality}
                  onChange={(e) => handleConfigChange('output.quality', parseFloat(e.target.value))}
                  title={`Current quality: ${config.output.quality}. Lower values reduce file size but may affect image quality.`}
                />
                <span>{config.output.quality}</span>
              </label>
            </div>
          </div>

          <div className="image-container">
            {selectedImage && (
              <div className="image-box">
                <h3>Original Image</h3>
                <img src={selectedImage} alt="Original" className="image" />
              </div>
            )}
            
            {processedImage && (
              <div className="image-box">
                <h3>Processed Image</h3>
                <img src={processedImage} alt="Processed" className="image" />
                {processedImage && (
                  <a 
                    href={processedImage} 
                    download={`processed-image-${new Date().getTime()}.${config.output.format.split('/')[1]}`}
                    className="download-button"
                  >
                    Download
                  </a>
                )}
              </div>
            )}
          </div>

          {selectedImage && !isProcessing && !isProcessingBatch && (
            <button onClick={handleBackgroundRemoval} className="process-button">
              Remove Background
            </button>
          )}

          {isProcessing && <div className="loading">Processing...</div>}
          {isProcessingBatch && <div className="loading">Processing Gemini images in batch mode...</div>}
        </>
      ) : (
        <GeminiTab />
      )}
    </div>
  );
}

export default App
