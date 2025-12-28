import { useState } from 'react';
import { Loader2, AlertCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { AudioTranscriptionService } from '../services/audioTranscription';

interface TranscriptionProcessorProps {
  recordingId: string;
  audioUrl: string;
  onComplete: () => void;
}

export function TranscriptionProcessor({ recordingId, audioUrl, onComplete }: TranscriptionProcessorProps) {
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [currentSegment, setCurrentSegment] = useState<string>('');

  const startTranscription = async () => {
    setProcessing(true);
    setError(null);
    setProgress(0);

    try {
      await supabase
        .from('audio_recordings')
        .update({ status: 'processing' })
        .eq('id', recordingId);

      const response = await fetch(audioUrl);
      const blob = await response.blob();
      const file = new File([blob], 'audio.mp3', { type: blob.type });

      const service = new AudioTranscriptionService();

      const audioContext = new AudioContext();
      const arrayBuffer = await file.arrayBuffer();
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

      const segments = await service.transcribeAudio(
        file,
        (progress) => setProgress(progress),
        (segment) => setCurrentSegment(segment.text)
      );

      const diarizedSegments = await service.performDiarization(audioBuffer, segments);

      const transcriptions = diarizedSegments.map((segment, index) => ({
        recording_id: recordingId,
        speaker_label: segment.speakerLabel,
        text: segment.text,
        start_time: segment.startTime,
        end_time: segment.endTime,
        confidence: segment.confidence || 0.9
      }));

      const { error: insertError } = await supabase
        .from('transcriptions')
        .insert(transcriptions);

      if (insertError) throw insertError;

      await supabase
        .from('audio_recordings')
        .update({ status: 'completed' })
        .eq('id', recordingId);

      onComplete();
    } catch (err: any) {
      console.error('Ошибка транскрибации:', err);
      setError(err.message || 'Произошла ошибка при обработке аудио');

      await supabase
        .from('audio_recordings')
        .update({ status: 'error' })
        .eq('id', recordingId);
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-lg p-6">
      <h3 className="text-lg font-semibold mb-4">Обработка аудиозаписи</h3>

      {!processing && !error && (
        <div className="text-center">
          <p className="text-gray-600 mb-4">
            Нажмите кнопку для начала транскрибации с диаризацией
          </p>
          <button
            onClick={startTranscription}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
          >
            Начать транскрибацию
          </button>
          <p className="text-xs text-gray-500 mt-3">
            Примечание: Используется Web Speech API (Google). Для лучших результатов используйте Chrome и стабильное интернет-соединение.
          </p>
          <p className="text-xs text-yellow-600 mt-2 font-medium">
            При первом запуске браузер может запросить разрешение на использование микрофона - разрешите доступ.
          </p>
        </div>
      )}

      {processing && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />
            <span className="text-gray-700 font-medium">
              Обработка... {Math.round(progress)}%
            </span>
          </div>

          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>

          {currentSegment && (
            <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
              <p className="text-sm text-gray-700">
                <span className="font-medium">Текущий сегмент:</span> {currentSegment}
              </p>
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 mt-0.5" />
            <div>
              <p className="font-medium text-red-800">Ошибка обработки</p>
              <p className="text-sm text-red-600 mt-1">{error}</p>
              <button
                onClick={startTranscription}
                className="mt-3 text-sm text-red-700 underline hover:text-red-800"
              >
                Попробовать снова
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
