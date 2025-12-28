import { Transcription } from '../lib/supabase';

export function formatTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

export function exportToText(transcriptions: Transcription[], filename: string): void {
  const getSpeakerName = (label: string) => {
    if (label === 'interviewer') return 'Интервьюер';
    if (label === 'interviewee') return 'Респондент';
    return label;
  };

  let textContent = `Транскрипция: ${filename}\n`;
  textContent += `Дата: ${new Date().toLocaleString('ru-RU')}\n`;
  textContent += `Всего сегментов: ${transcriptions.length}\n`;
  textContent += '\n' + '='.repeat(80) + '\n\n';

  transcriptions.forEach((transcription, index) => {
    const speaker = getSpeakerName(transcription.speaker_label);
    const timeRange = `${formatTime(transcription.start_time)} - ${formatTime(transcription.end_time)}`;
    const confidence = `${Math.round(transcription.confidence * 100)}%`;

    textContent += `[${index + 1}] ${timeRange} | ${speaker} (${confidence})\n`;
    textContent += `${transcription.text}\n\n`;
  });

  const blob = new Blob([textContent], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `transcription_${filename}_${Date.now()}.txt`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function exportToSRT(transcriptions: Transcription[], filename: string): void {
  const formatSRTTime = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    const millis = Math.floor((seconds % 1) * 1000);

    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')},${millis.toString().padStart(3, '0')}`;
  };

  const getSpeakerName = (label: string) => {
    if (label === 'interviewer') return 'Интервьюер';
    if (label === 'interviewee') return 'Респондент';
    return label;
  };

  let srtContent = '';

  transcriptions.forEach((transcription, index) => {
    const speaker = getSpeakerName(transcription.speaker_label);
    srtContent += `${index + 1}\n`;
    srtContent += `${formatSRTTime(transcription.start_time)} --> ${formatSRTTime(transcription.end_time)}\n`;
    srtContent += `[${speaker}] ${transcription.text}\n\n`;
  });

  const blob = new Blob([srtContent], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `subtitles_${filename}_${Date.now()}.srt`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function exportToJSON(transcriptions: Transcription[], filename: string): void {
  const exportData = {
    filename,
    exportDate: new Date().toISOString(),
    totalSegments: transcriptions.length,
    transcriptions: transcriptions.map(t => ({
      speaker: t.speaker_label,
      text: t.text,
      startTime: t.start_time,
      endTime: t.end_time,
      confidence: t.confidence
    }))
  };

  const jsonContent = JSON.stringify(exportData, null, 2);
  const blob = new Blob([jsonContent], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `transcription_${filename}_${Date.now()}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
