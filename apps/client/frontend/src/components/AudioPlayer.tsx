import { useState, useRef, useEffect, useCallback } from 'react';
import { Play, Pause, Volume2, VolumeX, RotateCcw } from 'lucide-react';
import './AudioPlayer.css';

interface AudioPlayerProps {
  src: string;
  title?: string;
  className?: string;
  compact?: boolean;
  autoPlay?: boolean;
  onEnded?: () => void;
  onError?: (error: Error) => void;
}

export function AudioPlayer({
  src,
  title,
  className = '',
  compact = false,
  autoPlay = false,
  onEnded,
  onError,
}: AudioPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [waveformData, setWaveformData] = useState<number[]>([]);

  const audioRef = useRef<HTMLAudioElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);

  // Generate waveform visualization from audio
  const generateWaveform = useCallback(async () => {
    try {
      const response = await fetch(src);
      const arrayBuffer = await response.arrayBuffer();
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

      const rawData = audioBuffer.getChannelData(0);
      const samples = 50; // Number of bars in waveform
      const blockSize = Math.floor(rawData.length / samples);
      const filteredData: number[] = [];

      for (let i = 0; i < samples; i++) {
        let blockStart = blockSize * i;
        let sum = 0;
        for (let j = 0; j < blockSize; j++) {
          sum += Math.abs(rawData[blockStart + j]);
        }
        filteredData.push(sum / blockSize);
      }

      // Normalize
      const multiplier = Math.max(...filteredData) || 1;
      const normalizedData = filteredData.map((n) => n / multiplier);
      setWaveformData(normalizedData);
      audioContext.close();
    } catch (err) {
      console.warn('Could not generate waveform:', err);
      // Generate placeholder waveform
      setWaveformData(Array(50).fill(0.5));
    }
  }, [src]);

  // Draw waveform on canvas
  const drawWaveform = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || waveformData.length === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const width = canvas.offsetWidth;
    const height = canvas.offsetHeight;

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, width, height);

    const barWidth = (width / waveformData.length) * 0.8;
    const gap = (width / waveformData.length) * 0.2;
    const progress = duration > 0 ? currentTime / duration : 0;

    waveformData.forEach((value, index) => {
      const x = index * (barWidth + gap);
      const barHeight = Math.max(value * (height - 4), 2);
      const y = (height - barHeight) / 2;

      // Color based on playback progress
      const barProgress = (index + 1) / waveformData.length;
      if (barProgress <= progress) {
        ctx.fillStyle = '#8b5cf6'; // Purple - played
      } else {
        ctx.fillStyle = '#d1d5db'; // Gray - unplayed
      }

      ctx.beginPath();
      ctx.roundRect(x, y, barWidth, barHeight, 1);
      ctx.fill();
    });
  }, [waveformData, currentTime, duration]);

  // Initialize audio and generate waveform
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    setIsLoading(true);
    setError(null);
    generateWaveform();

    const handleLoadedMetadata = () => {
      setDuration(audio.duration);
      setIsLoading(false);
      if (autoPlay) {
        audio.play().catch(console.error);
      }
    };

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
    };

    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
      onEnded?.();
    };

    const handleError = () => {
      const errorMessage = 'Failed to load audio';
      setError(errorMessage);
      setIsLoading(false);
      onError?.(new Error(errorMessage));
    };

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);

    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('error', handleError);
    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);

    return () => {
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('error', handleError);
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
    };
  }, [src, autoPlay, onEnded, onError, generateWaveform]);

  // Redraw waveform when data or progress changes
  useEffect(() => {
    drawWaveform();
  }, [drawWaveform]);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
    } else {
      audio.play().catch(console.error);
    }
  };

  const toggleMute = () => {
    const audio = audioRef.current;
    if (!audio) return;

    audio.muted = !audio.muted;
    setIsMuted(!isMuted);
  };

  const restart = () => {
    const audio = audioRef.current;
    if (!audio) return;

    audio.currentTime = 0;
    audio.play().catch(console.error);
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    const progressBar = progressRef.current;
    if (!audio || !progressBar) return;

    const rect = progressBar.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    audio.currentTime = percent * duration;
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (error) {
    return (
      <div className={`audio-player error ${className}`}>
        <span className="error-text">{error}</span>
      </div>
    );
  }

  if (compact) {
    return (
      <div className={`audio-player compact ${className}`}>
        <audio ref={audioRef} src={src} preload="metadata" />
        <button
          className="play-btn"
          onClick={togglePlay}
          disabled={isLoading}
          aria-label={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? <Pause size={16} /> : <Play size={16} />}
        </button>
        <div className="time-display compact">
          <span>{formatTime(currentTime)}</span>
          <span className="separator">/</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`audio-player ${className}`}>
      <audio ref={audioRef} src={src} preload="metadata" />

      {title && <div className="audio-title">{title}</div>}

      <div className="player-controls">
        <button
          className="play-btn"
          onClick={togglePlay}
          disabled={isLoading}
          aria-label={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? <Pause size={18} /> : <Play size={18} />}
        </button>

        <div
          className="waveform-container"
          ref={progressRef}
          onClick={handleSeek}
          role="slider"
          aria-label="Audio progress"
          aria-valuemin={0}
          aria-valuemax={duration}
          aria-valuenow={currentTime}
        >
          <canvas ref={canvasRef} className="waveform-canvas" />
        </div>

        <div className="time-display">
          <span>{formatTime(currentTime)}</span>
          <span className="separator">/</span>
          <span>{formatTime(duration)}</span>
        </div>

        <div className="secondary-controls">
          <button
            className="control-btn"
            onClick={restart}
            disabled={isLoading}
            aria-label="Restart"
          >
            <RotateCcw size={16} />
          </button>
          <button
            className="control-btn"
            onClick={toggleMute}
            disabled={isLoading}
            aria-label={isMuted ? 'Unmute' : 'Mute'}
          >
            {isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
          </button>
        </div>
      </div>
    </div>
  );
}
