import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Microphone capture for the AI Assist voice tab (AI_Assist_PRD.md §9.3).
 *
 * Uses MediaRecorder rather than the Web Speech API because Web Speech does
 * not exist on iOS Safari, and salesmen are on phones. Transcription happens
 * server-side through Gemini instead.
 */
const MAX_SECONDS = 90;

export function useVoiceRecorder({ maxSeconds = MAX_SECONDS } = {}) {
  const [isRecording, setIsRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [audioBlob, setAudioBlob] = useState(null);
  const [error, setError] = useState('');

  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const streamRef = useRef(null);
  const timerRef = useRef(null);

  const cleanup = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    recorderRef.current = null;
  }, []);

  const stop = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop();
    }
    setIsRecording(false);
  }, []);

  const start = useCallback(async () => {
    setError('');
    setAudioBlob(null);
    setSeconds(0);
    chunksRef.current = [];

    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError('এই ব্রাউজারে ভয়েস রেকর্ড করা যায় না। টেক্সট ট্যাব ব্যবহার করুন।');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Opus at 32 kbps: a 30-second note is about 120 KB.
      const preferred = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];
      const mimeType = preferred.find((t) => MediaRecorder.isTypeSupported?.(t)) || '';

      const recorder = new MediaRecorder(stream, {
        ...(mimeType ? { mimeType } : {}),
        audioBitsPerSecond: 32000,
      });
      recorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data?.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const type = recorder.mimeType || 'audio/webm';
        setAudioBlob(chunksRef.current.length ? new Blob(chunksRef.current, { type }) : null);
        cleanup();
      };

      recorder.start();
      setIsRecording(true);

      timerRef.current = setInterval(() => {
        setSeconds((s) => {
          const next = s + 1;
          // Hard cap: a long note produces an unusable transcript and a
          // needlessly large upload.
          if (next >= maxSeconds) stop();
          return next;
        });
      }, 1000);
    } catch (err) {
      setError(
        err?.name === 'NotAllowedError'
          ? 'মাইক্রোফোনের অনুমতি দেওয়া হয়নি।'
          : 'মাইক্রোফোন চালু করা যায়নি।'
      );
      cleanup();
    }
  }, [cleanup, maxSeconds, stop]);

  const reset = useCallback(() => {
    setAudioBlob(null);
    setSeconds(0);
    setError('');
  }, []);

  // Never leave the microphone open if the modal closes mid-recording.
  useEffect(() => () => {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop();
    }
    cleanup();
  }, [cleanup]);

  return { isRecording, seconds, audioBlob, error, start, stop, reset, maxSeconds };
}
