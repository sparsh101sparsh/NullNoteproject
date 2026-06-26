export function captureVideoFrame(video: HTMLVideoElement): Promise<string> {
  return new Promise((resolve, reject) => {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth || 1280;
      canvas.height = video.videoHeight || 720;
      const context = canvas.getContext('2d');
      if (!context) {
        reject(new Error('Unable to create canvas context.'));
        return;
      }
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      
      // canvas.toBlob runs the compression asynchronously off the main thread,
      // and 0.9 quality dramatically reduces file size and encoding time.
      canvas.toBlob((blob) => {
        // Free memory aggressively
        canvas.width = 0;
        canvas.height = 0;
        canvas.remove();

        if (!blob) {
          reject(new Error('Canvas to Blob conversion failed.'));
          return;
        }
        const reader = new FileReader();
        reader.onloadend = () => {
          resolve(reader.result as string);
        };
        reader.onerror = () => {
          reject(new Error('FileReader failed to read blob.'));
        };
        reader.readAsDataURL(blob);
      }, 'image/jpeg', 0.9);
    } catch (e) {
      reject(e);
    }
  });
}
