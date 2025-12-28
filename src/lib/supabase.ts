import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export interface SpeakerProfile {
  id: string;
  user_id: string;
  name: string;
  audio_sample_url?: string;
  voice_embedding?: any;
  created_at: string;
}

export interface AudioRecording {
  id: string;
  user_id: string;
  filename: string;
  audio_url: string;
  duration: number;
  status: 'uploaded' | 'processing' | 'completed' | 'error';
  created_at: string;
}

export interface Transcription {
  id: string;
  recording_id: string;
  speaker_id?: string;
  speaker_label: string;
  text: string;
  start_time: number;
  end_time: number;
  confidence: number;
  created_at: string;
}
