import { useEffect, useRef, useState, useCallback } from 'react';

export function useAudioVisualizer(stream) {
  const [bars, setBars] = useState([]);
  const animationRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  
  const BAR_COUNT = 32;
  
  useEffect(() => {
    if (!stream) {
      setBars([]);
      return;
    }
    
    // Create bars array
    const initialBars = new Array(BAR_COUNT).fill(8);
    setBars(initialBars);
    
    try {
      // Set up Web Audio API
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      audioContextRef.current = audioContext;
      
      const analyser = audioContext.createAnalyser();
      analyserRef.current = analyser;
      
      const source = audioContext.createMediaStreamSource(stream);
      
      analyser.fftSize = 64;
      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      
      source.connect(analyser);
      
      // Animate visualizer
      const animate = () => {
        animationRef.current = requestAnimationFrame(animate);
        analyser.getByteFrequencyData(dataArray);
        
        const newBars = [];
        for (let i = 0; i < BAR_COUNT; i++) {
          const value = dataArray[i] || 0;
          const height = (value / 255) * 100;
          newBars.push(Math.max(height, 8));
        }
        setBars(newBars);
      };
      
      animate();
    } catch (error) {
      console.error("Visualizer error:", error);
    }
    
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, [stream]);
  
  return bars;
}
