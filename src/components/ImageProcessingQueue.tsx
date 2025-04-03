import { useState, useCallback, useEffect } from 'react';

export interface QueuedImage {
  id: string;
  file: File;
  preview: string;
  status: 'queued' | 'processing' | 'completed' | 'error';
  result?: string;
  error?: string;
}

interface ImageProcessingQueueProps {
  images: QueuedImage[];
  onProcessingComplete: (processedImages: QueuedImage[]) => void;
  processImage: (image: File) => Promise<string>;
  onClearQueue?: () => void;
  autoStart?: boolean;
  resetQueue?: boolean;
}

export const ImageProcessingQueue = ({
  images,
  onProcessingComplete,
  processImage,
  onClearQueue,
  autoStart = true,
  resetQueue = false
}: ImageProcessingQueueProps) => {
  const [queue, setQueue] = useState<QueuedImage[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(-1);

  // Initialize the queue when images change
  useEffect(() => {
    setQueue(images.map(img => ({
      ...img,
      status: 'queued'
    })));
  }, [images]);

  // Function to process the next image in queue
  const processNext = useCallback(async () => {
    console.log('processNext called:', { currentIndex, queueLength: queue.length, isProcessing });
    
    if (currentIndex >= queue.length - 1 || !isProcessing) {
      console.log('Stopping processNext - end of queue or not processing');
      return;
    }

    const nextIndex = currentIndex + 1;
    const currentImage = queue[nextIndex];
    console.log('Processing next image:', nextIndex, currentImage.file.name);

    setCurrentIndex(nextIndex);
    setQueue(prev => prev.map((img, idx) => 
      idx === nextIndex ? { ...img, status: 'processing' } : img
    ));

    try {
      console.log('Calling processImage for:', currentImage.file.name);
      const result = await processImage(currentImage.file);
      console.log('processImage succeeded for:', currentImage.file.name);
      
      setQueue(prev => prev.map((img, idx) => 
        idx === nextIndex ? { ...img, status: 'completed', result } : img
      ));
    } catch (error: any) {
      console.error('Error in processImage:', error.message);
      setQueue(prev => prev.map((img, idx) => 
        idx === nextIndex ? { ...img, status: 'error', error: error.message } : img
      ));
    }

    // Process next image or complete the queue
    if (nextIndex < queue.length - 1) {
      // Add a delay before processing the next image to avoid rate limiting
      console.log('Scheduling next image processing in 2 seconds');
      setTimeout(() => {
        processNext();
      }, 2000); // 2-second delay between API calls
    } else {
      console.log('Queue processing complete');
      setIsProcessing(false);
      onProcessingComplete(queue);
    }
  }, [currentIndex, queue, isProcessing, processImage, onProcessingComplete]);

  // Function to start processing the queue
  const startProcessing = useCallback(() => {
    if (!isProcessing && queue.length > 0) {
      setIsProcessing(true);
      setCurrentIndex(-1);
      processNext();
    }
  }, [isProcessing, queue.length, processNext]);

  // Function to clear the queue
  const clearQueue = useCallback(() => {
    setQueue([]);
    setIsProcessing(false);
    setCurrentIndex(-1);
    onClearQueue?.();
  }, [onClearQueue]);

  // Auto-start processing when queue changes
  useEffect(() => {
    if (autoStart && queue.length > 0 && !isProcessing) {
      // Only start processing if there are unprocessed images
      const hasUnprocessedImages = queue.some(img => img.status === 'queued');
      if (hasUnprocessedImages) {
        startProcessing();
      }
    }
  }, [queue, autoStart, isProcessing, startProcessing]);

  // Reset and restart queue when resetQueue prop changes to true
  useEffect(() => {
    console.log('resetQueue effect triggered:', resetQueue, 'queue length:', queue.length);
    
    if (resetQueue && queue.length > 0) {
      console.log('Resetting queue with', queue.length, 'images');
      
      // Reset all images to queued status
      setQueue(prevQueue => {
        console.log('Resetting queue status for all images');
        return prevQueue.map(img => ({
          ...img,
          status: 'queued',
          result: undefined,
          error: undefined
        }));
      });
      
      // Reset processing state
      setIsProcessing(false);
      setCurrentIndex(-1);
      
      // Start processing after a brief delay to allow state updates
      // But don't start immediately to avoid rate limits
      console.log('Scheduling queue start in 1 second');
      const timer = setTimeout(() => {
        console.log('Starting queue processing after reset');
        setIsProcessing(true);
        setCurrentIndex(-1);
        processNext();
      }, 1000); // 1-second delay before starting new processing
      
      return () => {
        console.log('Cleaning up reset timer');
        clearTimeout(timer);
      };
    }
  }, [resetQueue, queue.length, processNext]);

  return (
    <div className="processing-queue">
      <div className="queue-status">
        {isProcessing && (
          <div className="processing-status">
            Processing image {currentIndex + 1} of {queue.length}
          </div>
        )}
        <div className="queue-controls">
          {!isProcessing && queue.length > 0 && (
            <button onClick={startProcessing} className="start-button">
              Start Processing
            </button>
          )}
          {queue.length > 0 && (
            <button onClick={clearQueue} className="clear-button">
              Clear Queue
            </button>
          )}
        </div>
      </div>

      <div className="queue-items">
        {queue.map((image, index) => (
          <div key={image.id} className={`queue-item ${image.status}`}>
            <div className="item-preview">
              <img 
                src={image.status === 'completed' ? image.result : image.preview} 
                alt={`Queue item ${index + 1}`}
              />
            </div>
            <div className="item-status">
              {image.status === 'queued' && 'Waiting...'}
              {image.status === 'processing' && 'Processing...'}
              {image.status === 'completed' && 'Completed'}
              {image.status === 'error' && `Error: ${image.error}`}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};