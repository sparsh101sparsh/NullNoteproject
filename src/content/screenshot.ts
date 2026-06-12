export async function captureVideoFrame(video: HTMLVideoElement): Promise<string> {
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth || 1280;
  canvas.height = video.videoHeight || 720;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Unable to create canvas context.');
  }
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  // Using 1.0 quality JPEG ensures maximum visual fidelity without the heavy main-thread blocking of PNG encoding
  return canvas.toDataURL('image/jpeg', 1.0);
}
