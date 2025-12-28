import { useEffect, useState } from 'react';
import { supabase, AudioRecording, Transcription } from './lib/supabase';
import { AuthForm } from './components/AuthForm';
import { AudioUploader } from './components/AudioUploader';
import { TranscriptionProcessor } from './components/TranscriptionProcessor';
import { TranscriptionPlayer } from './components/TranscriptionPlayer';
import { LogOut, FileAudio } from 'lucide-react';

function App() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [recordings, setRecordings] = useState<AudioRecording[]>([]);
  const [selectedRecording, setSelectedRecording] = useState<AudioRecording | null>(null);
  const [transcriptions, setTranscriptions] = useState<Transcription[]>([]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (user) {
      loadRecordings();
    }
  }, [user]);

  useEffect(() => {
    if (selectedRecording) {
      loadTranscriptions(selectedRecording.id);
    }
  }, [selectedRecording]);

  const loadRecordings = async () => {
    const { data, error } = await supabase
      .from('audio_recordings')
      .select('*')
      .order('created_at', { ascending: false });

    if (!error && data) {
      setRecordings(data);
    }
  };

  const loadTranscriptions = async (recordingId: string) => {
    const { data, error } = await supabase
      .from('transcriptions')
      .select('*')
      .eq('recording_id', recordingId)
      .order('start_time', { ascending: true });

    if (!error && data) {
      setTranscriptions(data);
    }
  };

  const handleUploadComplete = (recordingId: string, audioUrl: string, duration: number) => {
    loadRecordings();
    const newRecording: AudioRecording = {
      id: recordingId,
      user_id: user.id,
      filename: 'audio',
      audio_url: audioUrl,
      duration,
      status: 'uploaded',
      created_at: new Date().toISOString()
    };
    setSelectedRecording(newRecording);
  };

  const handleTranscriptionComplete = () => {
    if (selectedRecording) {
      loadRecordings();
      loadTranscriptions(selectedRecording.id);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setSelectedRecording(null);
    setTranscriptions([]);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-600">Загрузка...</div>
      </div>
    );
  }

  if (!user) {
    return <AuthForm />;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
                <FileAudio className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Транскрибатор</h1>
                <p className="text-sm text-gray-600">Транскрибация с диаризацией</p>
              </div>
            </div>
            <button
              onClick={handleSignOut}
              className="flex items-center gap-2 px-4 py-2 text-gray-700 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <LogOut className="w-5 h-5" />
              <span>Выйти</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1 space-y-6">
            <div>
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Загрузить аудио</h2>
              <AudioUploader onUploadComplete={handleUploadComplete} />
            </div>

            <div>
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Мои записи</h2>
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 divide-y max-h-96 overflow-y-auto">
                {recordings.length === 0 ? (
                  <p className="p-4 text-center text-gray-500 text-sm">
                    Нет загруженных записей
                  </p>
                ) : (
                  recordings.map((recording) => (
                    <button
                      key={recording.id}
                      onClick={() => setSelectedRecording(recording)}
                      className={`w-full p-4 text-left hover:bg-gray-50 transition-colors ${
                        selectedRecording?.id === recording.id ? 'bg-blue-50' : ''
                      }`}
                    >
                      <div className="font-medium text-gray-900 truncate">
                        {recording.filename}
                      </div>
                      <div className="flex items-center justify-between mt-1">
                        <span className="text-xs text-gray-500">
                          {Math.round(recording.duration)}s
                        </span>
                        <span className={`text-xs px-2 py-1 rounded-full ${
                          recording.status === 'completed'
                            ? 'bg-green-100 text-green-700'
                            : recording.status === 'processing'
                            ? 'bg-yellow-100 text-yellow-700'
                            : recording.status === 'error'
                            ? 'bg-red-100 text-red-700'
                            : 'bg-gray-100 text-gray-700'
                        }`}>
                          {recording.status === 'completed' && 'Готово'}
                          {recording.status === 'processing' && 'Обработка'}
                          {recording.status === 'error' && 'Ошибка'}
                          {recording.status === 'uploaded' && 'Загружено'}
                        </span>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>

          <div className="lg:col-span-2 space-y-6">
            {selectedRecording ? (
              <>
                {selectedRecording.status === 'uploaded' && (
                  <TranscriptionProcessor
                    recordingId={selectedRecording.id}
                    audioUrl={selectedRecording.audio_url}
                    onComplete={handleTranscriptionComplete}
                  />
                )}

                {(selectedRecording.status === 'completed' || transcriptions.length > 0) && (
                  <TranscriptionPlayer
                    audioUrl={selectedRecording.audio_url}
                    transcriptions={transcriptions}
                    filename={selectedRecording.filename}
                  />
                )}

                {selectedRecording.status === 'processing' && (
                  <div className="bg-white rounded-lg shadow-lg p-8 text-center">
                    <div className="text-gray-600">
                      Запись обрабатывается...
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="bg-white rounded-lg shadow-lg p-12 text-center">
                <FileAudio className="w-16 h-16 mx-auto text-gray-400 mb-4" />
                <h3 className="text-xl font-semibold text-gray-900 mb-2">
                  Начните работу
                </h3>
                <p className="text-gray-600">
                  Загрузите аудиофайл или выберите существующую запись для просмотра транскрипции
                </p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;
