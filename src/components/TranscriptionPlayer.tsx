import { useRef, useState, useEffect } from 'react';
import { Play, Pause, Volume2, Download } from 'lucide-react';
import { Transcription } from '../lib/supabase';
import { exportToText, exportToSRT, exportToJSON } from '../utils/exportTranscription';

interface TranscriptionPlayerProps {
  audioUrl: string;
  transcriptions: Transcription[];
  filename?: string;
}

export function TranscriptionPlayer({ audioUrl, transcriptions, filename = 'audio' }: TranscriptionPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [activeSegmentId, setActiveSegmentId] = useState<string | null>(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);

      const activeSegment = transcriptions.find(
        t => audio.currentTime >= t.start_time && audio.currentTime <= t.end_time
      );

      setActiveSegmentId(activeSegment?.id || null);
    };

    const handleLoadedMetadata = () => {
      setDuration(audio.duration);
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
    };
  }, [transcriptions]);

  const togglePlay = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const seekTo = (time: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = time;
      setCurrentTime(time);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getSpeakerColor = (label: string) => {
    if (label === 'interviewer') return 'bg-blue-100 border-blue-300';
    if (label === 'interviewee') return 'bg-green-100 border-green-300';
    return 'bg-gray-100 border-gray-300';
  };

  const getSpeakerName = (label: string) => {
    if (label === 'interviewer') return 'Интервьюер';
    if (label === 'interviewee') return 'Респондент';
    return label;
  };

  return (
    <div className="bg-white rounded-lg shadow-lg p-6">
      <audio ref={audioRef} src={audioUrl} />

      {transcriptions.length > 0 && (
        <div className="mb-4 flex gap-2 justify-end">
          <button
            onClick={() => exportToText(transcriptions, filename)}
            className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors text-sm"
          >
            <Download className="w-4 h-4" />
            Текст
          </button>
          <button
            onClick={() => exportToSRT(transcriptions, filename)}
            className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors text-sm"
          >
            <Download className="w-4 h-4" />
            SRT
          </button>
          <button
            onClick={() => exportToJSON(transcriptions, filename)}
            className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors text-sm"
          >
            <Download className="w-4 h-4" />
            JSON
          </button>
        </div>
      )}

      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={togglePlay}
          className="w-12 h-12 rounded-full bg-blue-600 text-white flex items-center justify-center hover:bg-blue-700 transition-colors"
        >
          {isPlaying ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6 ml-1" />}
        </button>

        <div className="flex-1">
          <input
            type="range"
            min="0"
            max={duration || 0}
            value={currentTime}
            onChange={(e) => seekTo(Number(e.target.value))}
            className="w-full"
          />
          <div className="flex justify-between text-sm text-gray-600 mt-1">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>

        <Volume2 className="w-6 h-6 text-gray-600" />
      </div>

      <div className="space-y-3 max-h-96 overflow-y-auto">
        {transcriptions.length === 0 ? (
          <p className="text-center text-gray-500 py-8">
            Транскрипция будет отображена здесь после обработки
          </p>
        ) : (
          transcriptions.map((transcription) => (
            <div
              key={transcription.id}
              className={`p-4 rounded-lg border-2 transition-all cursor-pointer ${
                getSpeakerColor(transcription.speaker_label)
              } ${
                activeSegmentId === transcription.id
                  ? 'ring-2 ring-blue-500 shadow-md'
                  : 'hover:shadow-sm'
              }`}
              onClick={() => seekTo(transcription.start_time)}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="font-semibold text-sm">
                  {getSpeakerName(transcription.speaker_label)}
                </span>
                <span className="text-xs text-gray-600">
                  {formatTime(transcription.start_time)} - {formatTime(transcription.end_time)}
                </span>
              </div>
              <p className="text-gray-800">{transcription.text}</p>
              <div className="mt-1 text-xs text-gray-500">
                Уверенность: {Math.round(transcription.confidence * 100)}%
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
