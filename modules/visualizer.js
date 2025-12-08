// Audio Visualizer module

/**
 * Initialize audio visualizer for a given stream
 * @param {string} containerId - ID of the container element for visualizer bars
 * @param {MediaStream} stream - Audio stream to visualize
 */
export function initVisualizer(containerId, stream) {
  const container = document.getElementById(containerId);
  if (!container) return;

  // Clear existing bars
  container.innerHTML = "";

  // Create visualizer bars
  const barCount = 32;
  const bars = [];

  for (let i = 0; i < barCount; i++) {
    const bar = document.createElement("div");
    bar.className = "visualizer-bar";
    container.appendChild(bar);
    bars.push(bar);
  }

  // Set up Web Audio API
  try {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const analyser = audioContext.createAnalyser();
    const source = audioContext.createMediaStreamSource(stream);

    analyser.fftSize = 64;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    source.connect(analyser);

    // Animate visualizer
    function animate() {
      requestAnimationFrame(animate);
      analyser.getByteFrequencyData(dataArray);

      for (let i = 0; i < bars.length; i++) {
        const value = dataArray[i] || 0;
        const height = (value / 255) * 100;
        bars[i].style.height = `${Math.max(height, 8)}%`;
      }
    }

    animate();
  } catch (error) {
    console.error("Visualizer error:", error);
  }
}
