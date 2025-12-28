export interface TranscriptionSegment {
  text: string;
  startTime: number;
  endTime: number;
  speakerLabel: string;
  confidence: number;
}

export class AudioTranscriptionService {
  private recognition: any;
  private audioContext: AudioContext | null = null;
  private isProcessing = false;

  constructor() {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      this.recognition = new SpeechRecognition();
      this.recognition.continuous = true;
      this.recognition.interimResults = false;
      this.recognition.lang = 'ru-RU';
    }
  }

  async transcribeAudio(
    audioFile: File,
    onProgress?: (progress: number) => void,
    onSegment?: (segment: TranscriptionSegment) => void
  ): Promise<TranscriptionSegment[]> {
    if (!this.recognition) {
      throw new Error('Web Speech API не поддерживается в этом браузере');
    }

    const segments: TranscriptionSegment[] = [];
    this.audioContext = new AudioContext();

    const arrayBuffer = await audioFile.arrayBuffer();
    const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
    const duration = audioBuffer.duration;

    const audioElement = new Audio(URL.createObjectURL(audioFile));
    audioElement.volume = 0.01;

    let startTime = 0;
    let isRecognitionActive = false;
    let shouldContinue = true;

    const startRecognition = () => {
      if (!shouldContinue || isRecognitionActive) return;

      try {
        isRecognitionActive = true;
        this.recognition.start();
      } catch (err) {
        console.warn('Recognition start error:', err);
        isRecognitionActive = false;
      }
    };

    this.recognition.onresult = (event: any) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          const transcript = event.results[i][0].transcript;
          const confidence = event.results[i][0].confidence || 0.9;
          const currentTime = audioElement.currentTime;

          const segment: TranscriptionSegment = {
            text: transcript.trim(),
            startTime: startTime,
            endTime: currentTime,
            speakerLabel: 'speaker_1',
            confidence: confidence
          };

          segments.push(segment);
          startTime = currentTime;

          if (onSegment) {
            onSegment(segment);
          }

          if (onProgress) {
            const progress = (currentTime / duration) * 100;
            onProgress(Math.min(progress, 100));
          }
        }
      }
    };

    return new Promise((resolve, reject) => {
      let recognitionRestartTimeout: number | null = null;

      this.recognition.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error);
        isRecognitionActive = false;

        if (event.error === 'aborted' || event.error === 'no-speech') {
          if (shouldContinue && audioElement.currentTime < duration - 1) {
            recognitionRestartTimeout = window.setTimeout(() => {
              startRecognition();
            }, 300);
          } else {
            audioElement.pause();
            URL.revokeObjectURL(audioElement.src);
            if (onProgress) onProgress(100);
            resolve(segments);
          }
        } else if (event.error === 'not-allowed') {
          audioElement.pause();
          URL.revokeObjectURL(audioElement.src);
          reject(new Error('Доступ к микрофону запрещен. Разрешите доступ в настройках браузера.'));
        } else {
          audioElement.pause();
          URL.revokeObjectURL(audioElement.src);
          reject(new Error(`Ошибка распознавания: ${event.error}`));
        }
      };

      this.recognition.onstart = () => {
        isRecognitionActive = true;
      };

      this.recognition.onend = () => {
        isRecognitionActive = false;

        if (shouldContinue && audioElement.currentTime < duration - 1) {
          recognitionRestartTimeout = window.setTimeout(() => {
            startRecognition();
          }, 100);
        } else {
          shouldContinue = false;
          audioElement.pause();
          URL.revokeObjectURL(audioElement.src);
          if (onProgress) onProgress(100);
          resolve(segments);
        }
      };

      audioElement.onended = () => {
        shouldContinue = false;
        if (recognitionRestartTimeout) {
          clearTimeout(recognitionRestartTimeout);
        }
        setTimeout(() => {
          if (isRecognitionActive) {
            this.recognition.stop();
          }
        }, 500);
      };

      audioElement.onerror = (err) => {
        console.error('Audio playback error:', err);
        shouldContinue = false;
        audioElement.pause();
        URL.revokeObjectURL(audioElement.src);
        reject(new Error('Ошибка воспроизведения аудио'));
      };

      this.isProcessing = true;

      audioElement.play()
        .then(() => {
          setTimeout(() => {
            startRecognition();
          }, 500);
        })
        .catch((err) => {
          console.error('Play error:', err);
          reject(new Error('Не удалось начать воспроизведение. Попробуйте снова.'));
        });
    });
  }

  async performDiarization(
    audioBuffer: AudioBuffer,
    transcriptionSegments: TranscriptionSegment[]
  ): Promise<TranscriptionSegment[]> {
    if (transcriptionSegments.length === 0) {
      return transcriptionSegments;
    }

    const channelData = audioBuffer.getChannelData(0);
    const sampleRate = audioBuffer.sampleRate;

    const features = transcriptionSegments.map((segment) => {
      const startSample = Math.floor(segment.startTime * sampleRate);
      const endSample = Math.floor(segment.endTime * sampleRate);
      const segmentData = channelData.slice(startSample, endSample);

      return {
        energy: this.calculateEnergy(segmentData),
        pitch: this.estimatePitch(segmentData, sampleRate),
        zcr: this.calculateZeroCrossingRate(segmentData)
      };
    });

    const { cluster1, cluster2 } = this.kMeansClustering(features, 2);

    const avgPitchCluster1 = cluster1.reduce((sum, idx) => sum + features[idx].pitch, 0) / cluster1.length;
    const avgPitchCluster2 = cluster2.reduce((sum, idx) => sum + features[idx].pitch, 0) / cluster2.length;

    const interviewerCluster = avgPitchCluster1 < avgPitchCluster2 ? cluster1 : cluster2;
    const intervieweeCluster = avgPitchCluster1 < avgPitchCluster2 ? cluster2 : cluster1;

    const interviewerSet = new Set(interviewerCluster);

    const diarizedSegments = transcriptionSegments.map((segment, index) => {
      const speakerLabel = interviewerSet.has(index) ? 'interviewer' : 'interviewee';
      return {
        ...segment,
        speakerLabel
      };
    });

    return this.smoothSpeakerTransitions(diarizedSegments);
  }

  private kMeansClustering(
    features: Array<{ energy: number; pitch: number; zcr: number }>,
    k: number
  ): { cluster1: number[]; cluster2: number[] } {
    if (features.length < 2) {
      return { cluster1: [0], cluster2: [] };
    }

    const normalize = (values: number[]) => {
      const min = Math.min(...values);
      const max = Math.max(...values);
      const range = max - min || 1;
      return values.map(v => (v - min) / range);
    };

    const energies = normalize(features.map(f => f.energy));
    const pitches = normalize(features.map(f => f.pitch));
    const zcrs = normalize(features.map(f => f.zcr));

    let centroid1 = { energy: energies[0], pitch: pitches[0], zcr: zcrs[0] };
    let centroid2 = { energy: energies[Math.floor(features.length / 2)], pitch: pitches[Math.floor(features.length / 2)], zcr: zcrs[Math.floor(features.length / 2)] };

    let cluster1: number[] = [];
    let cluster2: number[] = [];

    for (let iteration = 0; iteration < 10; iteration++) {
      cluster1 = [];
      cluster2 = [];

      features.forEach((_, index) => {
        const dist1 = Math.sqrt(
          Math.pow(energies[index] - centroid1.energy, 2) +
          Math.pow(pitches[index] - centroid1.pitch, 2) +
          Math.pow(zcrs[index] - centroid1.zcr, 2)
        );

        const dist2 = Math.sqrt(
          Math.pow(energies[index] - centroid2.energy, 2) +
          Math.pow(pitches[index] - centroid2.pitch, 2) +
          Math.pow(zcrs[index] - centroid2.zcr, 2)
        );

        if (dist1 < dist2) {
          cluster1.push(index);
        } else {
          cluster2.push(index);
        }
      });

      if (cluster1.length === 0 || cluster2.length === 0) break;

      centroid1 = {
        energy: cluster1.reduce((sum, idx) => sum + energies[idx], 0) / cluster1.length,
        pitch: cluster1.reduce((sum, idx) => sum + pitches[idx], 0) / cluster1.length,
        zcr: cluster1.reduce((sum, idx) => sum + zcrs[idx], 0) / cluster1.length
      };

      centroid2 = {
        energy: cluster2.reduce((sum, idx) => sum + energies[idx], 0) / cluster2.length,
        pitch: cluster2.reduce((sum, idx) => sum + pitches[idx], 0) / cluster2.length,
        zcr: cluster2.reduce((sum, idx) => sum + zcrs[idx], 0) / cluster2.length
      };
    }

    return { cluster1, cluster2 };
  }

  private smoothSpeakerTransitions(segments: TranscriptionSegment[]): TranscriptionSegment[] {
    if (segments.length < 3) return segments;

    const smoothed = [...segments];

    for (let i = 1; i < smoothed.length - 1; i++) {
      const prev = smoothed[i - 1].speakerLabel;
      const curr = smoothed[i].speakerLabel;
      const next = smoothed[i + 1].speakerLabel;

      if (prev === next && curr !== prev) {
        if (smoothed[i].text.split(' ').length < 3) {
          smoothed[i].speakerLabel = prev;
        }
      }
    }

    return smoothed;
  }

  private calculateZeroCrossingRate(data: Float32Array): number {
    let crossings = 0;
    for (let i = 1; i < data.length; i++) {
      if ((data[i] >= 0 && data[i - 1] < 0) || (data[i] < 0 && data[i - 1] >= 0)) {
        crossings++;
      }
    }
    return crossings / data.length;
  }

  private calculateEnergy(data: Float32Array): number {
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      sum += data[i] * data[i];
    }
    return Math.sqrt(sum / data.length);
  }

  private calculateEnergyThreshold(data: Float32Array): number {
    const windowSize = Math.floor(data.length / 10);
    let maxEnergy = 0;

    for (let i = 0; i < data.length - windowSize; i += windowSize) {
      const window = data.slice(i, i + windowSize);
      const energy = this.calculateEnergy(window);
      maxEnergy = Math.max(maxEnergy, energy);
    }

    return maxEnergy * 0.3;
  }

  private estimatePitch(data: Float32Array, sampleRate: number): number {
    const bufferSize = 2048;
    const buffer = data.slice(0, Math.min(bufferSize, data.length));

    let maxCorrelation = 0;
    let bestOffset = 0;

    for (let offset = 20; offset < buffer.length / 2; offset++) {
      let correlation = 0;
      for (let i = 0; i < buffer.length - offset; i++) {
        correlation += Math.abs(buffer[i] - buffer[i + offset]);
      }
      correlation = 1 - correlation / (buffer.length - offset);

      if (correlation > maxCorrelation) {
        maxCorrelation = correlation;
        bestOffset = offset;
      }
    }

    return sampleRate / bestOffset;
  }

  stop() {
    if (this.recognition && this.isProcessing) {
      this.recognition.stop();
      this.isProcessing = false;
    }
  }
}
