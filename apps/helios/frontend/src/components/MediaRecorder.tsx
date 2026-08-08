import { useState, useRef, useCallback, useEffect } from 'react';
import { Mic, Square, Play, Pause, Trash2, Upload, Loader2, AlertCircle } from 'lucide-react';
import { profileService } from '../services/profile.service';
import './MediaRecorder.css';

export type MediaRecorderType = 'voice_intro' | 'name_pronunciation';

interface MediaRecorderProps {
  type: MediaRecorderType;
  maxDuration: number; // in seconds
  onUploadSuccess?: () => void;
  onDelete?: () => void;
  existingMediaUrl?: string;
  existingDuration?: number;
}

type RecordingState = 'idle' | 'recording' | 'recorded' | 'playing' | 'uploading';

export function MediaRecorderComponent({
  type,
  maxDuration,
  onUploadSuccess,
  onDelete,
  existingMediaUrl,
  existingDuration,
}: MediaRecorderProps) {
  const [state, setState] = useState<RecordingState>(existingMediaUrl ? 'recorded' : 'idle');
  const [duration, setDuration] = useState(0);
  const [playbackPosition, setPlaybackPosition] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(existingMediaUrl || null);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationRef = useRef<number | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      if (audioUrl && !existingMediaUrl) {
        URL.revokeObjectURL(audioUrl);
      }
    };
  }, [audioUrl, existingMediaUrl]);

  // Draw waveform visualization
  const drawWaveform = useCallback(() => {
    const canvas = canvasRef.current;
    const analyser = analyserRef.current;
    if (!canvas || !analyser) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      if (state !== 'recording') return;

      animationRef.current = requestAnimationFrame(draw);
      analyser.getByteTimeDomainData(dataArray);

      ctx.fillStyle = '#f3f4f6';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.lineWidth = 2;
      ctx.strokeStyle = '#8b5cf6';
      ctx.beginPath();

      const sliceWidth = canvas.width / bufferLength;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const v = dataArray[i] / 128.0;
        const y = (v * canvas.height) / 2;

        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }

        x += sliceWidth;
      }

      ctx.lineTo(canvas.width, canvas.height / 2);
      ctx.stroke();
    };

    draw();
  }, [state]);

  // Start recording
  const startRecording = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Set up audio context for visualization
      const audioContext = new AudioContext();
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;

      // Set up media recorder
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus',
      });
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        const url = URL.createObjectURL(blob);
        setAudioBlob(blob);
        setAudioUrl(url);
        setState('recorded');

        // Cleanup
        stream.getTracks().forEach(track => track.stop());
        if (animationRef.current) {
          cancelAnimationFrame(animationRef.current);
        }
      };

      mediaRecorder.start(100); // Collect data every 100ms
      setState('recording');
      setDuration(0);

      // Start duration timer
      timerRef.current = setInterval(() => {
        setDuration(prev => {
          const newDuration = prev + 1;
          if (newDuration >= maxDuration) {
            stopRecording();
          }
          return newDuration;
        });
      }, 1000);

      // Start visualization
      drawWaveform();
    } catch (err: any) {
      console.error('Failed to start recording:', err);
      setError('Could not access microphone. Please check permissions.');
    }
  };

  // Stop recording
  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  // Play recorded audio
  const playAudio = () => {
    if (!audioRef.current || !audioUrl) return;

    audioRef.current.play();
    setState('playing');
  };

  // Pause audio
  const pauseAudio = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      setState('recorded');
    }
  };

  // Delete recording
  const deleteRecording = async () => {
    if (existingMediaUrl) {
      // Delete from server
      const success = await profileService.deleteMedia(type);
      if (success && onDelete) {
        onDelete();
      }
    }

    // Reset local state
    if (audioUrl && !existingMediaUrl) {
      URL.revokeObjectURL(audioUrl);
    }
    setAudioUrl(null);
    setAudioBlob(null);
    setDuration(0);
    setPlaybackPosition(0);
    setState('idle');
  };

  // Upload recording
  const uploadRecording = async () => {
    if (!audioBlob) return;

    setState('uploading');
    setError(null);

    try {
      const result = await profileService.uploadMedia(type, audioBlob, duration);
      if (result) {
        setAudioUrl(result.presignedUrl);
        setAudioBlob(null); // Clear blob since we have server URL now
        setState('recorded');
        if (onUploadSuccess) {
          onUploadSuccess();
        }
      } else {
        throw new Error('Upload failed');
      }
    } catch (err: any) {
      console.error('Failed to upload recording:', err);
      setError('Failed to upload recording. Please try again.');
      setState('recorded');
    }
  };

  // Format duration as MM:SS
  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Handle audio timeupdate
  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setPlaybackPosition(audioRef.current.currentTime);
    }
  };

  // Handle audio ended
  const handleAudioEnded = () => {
    setState('recorded');
    setPlaybackPosition(0);
  };

  const title = type === 'voice_intro' ? 'Voice Introduction' : 'Name Pronunciation';
  const description = type === 'voice_intro'
    ? `Record a short audio introduction (up to ${maxDuration} seconds)`
    : `Help colleagues pronounce your name correctly (up to ${maxDuration} seconds)`;

  return (
    <div className="media-recorder">
      <div className="media-recorder-header">
        <h4>{title}</h4>
        <p>{description}</p>
      </div>

      {error && (
        <div className="media-recorder-error">
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      <div className="media-recorder-content">
        {/* Waveform canvas (visible during recording) */}
        {state === 'recording' && (
          <canvas
            ref={canvasRef}
            className="waveform-canvas"
            width={300}
            height={60}
          />
        )}

        {/* Timer/Progress display */}
        <div className="media-recorder-timer">
          {state === 'recording' && (
            <>
              <span className="recording-indicator" />
              <span className="timer">{formatDuration(duration)}</span>
              <span className="timer-max">/ {formatDuration(maxDuration)}</span>
            </>
          )}
          {(state === 'recorded' || state === 'playing') && (
            <>
              <span className="timer">{formatDuration(Math.floor(playbackPosition))}</span>
              <span className="timer-max">/ {formatDuration(existingDuration || duration)}</span>
            </>
          )}
        </div>

        {/* Audio element for playback */}
        {audioUrl && (
          <audio
            ref={audioRef}
            src={audioUrl}
            onTimeUpdate={handleTimeUpdate}
            onEnded={handleAudioEnded}
          />
        )}

        {/* Controls */}
        <div className="media-recorder-controls">
          {state === 'idle' && (
            <button className="btn-record" onClick={startRecording}>
              <Mic size={20} />
              <span>Start Recording</span>
            </button>
          )}

          {state === 'recording' && (
            <button className="btn-stop" onClick={stopRecording}>
              <Square size={20} />
              <span>Stop</span>
            </button>
          )}

          {state === 'recorded' && (
            <>
              <button className="btn-play" onClick={playAudio}>
                <Play size={20} />
                <span>Play</span>
              </button>
              <button className="btn-delete" onClick={deleteRecording}>
                <Trash2 size={20} />
              </button>
              {audioBlob && (
                <button className="btn-upload" onClick={uploadRecording}>
                  <Upload size={20} />
                  <span>Save</span>
                </button>
              )}
            </>
          )}

          {state === 'playing' && (
            <>
              <button className="btn-pause" onClick={pauseAudio}>
                <Pause size={20} />
                <span>Pause</span>
              </button>
              <button className="btn-delete" onClick={deleteRecording}>
                <Trash2 size={20} />
              </button>
            </>
          )}

          {state === 'uploading' && (
            <div className="uploading-state">
              <Loader2 className="spin" size={20} />
              <span>Uploading...</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
