import { useState } from 'react';
import { Upload, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface AudioUploaderProps {
  onUploadComplete: (recordingId: string, audioUrl: string, duration: number) => void;
}

export function AudioUploader({ onUploadComplete }: AudioUploaderProps) {
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  const handleFile = async (file: File) => {
    if (!file.type.startsWith('audio/')) {
      alert('Пожалуйста, загрузите аудиофайл');
      return;
    }

    setUploading(true);

    try {
      const audio = new Audio();
      const objectUrl = URL.createObjectURL(file);

      await new Promise<void>((resolve, reject) => {
        audio.onloadedmetadata = () => resolve();
        audio.onerror = () => reject(new Error('Не удалось загрузить аудио'));
        audio.src = objectUrl;
      });

      const duration = audio.duration;
      URL.revokeObjectURL(objectUrl);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Пользователь не авторизован');

      const fileExt = file.name.split('.').pop();
      const fileName = `${user.id}/${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('audio-files')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('audio-files')
        .getPublicUrl(fileName);

      const { data: recording, error: dbError } = await supabase
        .from('audio_recordings')
        .insert({
          user_id: user.id,
          filename: file.name,
          audio_url: urlData.publicUrl,
          duration,
          status: 'uploaded'
        })
        .select()
        .single();

      if (dbError) throw dbError;

      onUploadComplete(recording.id, urlData.publicUrl, duration);
    } catch (error) {
      console.error('Ошибка загрузки:', error);
      alert('Ошибка при загрузке файла');
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
  };

  return (
    <div
      className={`border-2 border-dashed rounded-lg p-12 text-center transition-colors ${
        dragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'
      }`}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
    >
      {uploading ? (
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-12 h-12 text-blue-500 animate-spin" />
          <p className="text-gray-600">Загрузка аудиофайла...</p>
        </div>
      ) : (
        <>
          <Upload className="w-12 h-12 mx-auto mb-4 text-gray-400" />
          <p className="text-lg font-medium text-gray-700 mb-2">
            Перетащите аудиофайл сюда
          </p>
          <p className="text-sm text-gray-500 mb-4">
            или нажмите для выбора файла
          </p>
          <input
            type="file"
            accept="audio/*"
            onChange={(e) => e.target.files && handleFile(e.target.files[0])}
            className="hidden"
            id="audio-upload"
          />
          <label
            htmlFor="audio-upload"
            className="inline-block px-6 py-2 bg-blue-600 text-white rounded-lg cursor-pointer hover:bg-blue-700 transition-colors"
          >
            Выбрать файл
          </label>
        </>
      )}
    </div>
  );
}
