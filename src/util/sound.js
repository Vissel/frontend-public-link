/**
 * Notification chime, synthesized instead of shipped as an audio file.
 *
 * No asset to download, no licence to check, and it stays short enough not to
 * annoy a support desk that hears it fifty times a day. Browsers only allow
 * audio after the first user gesture on the page, which is why the context is
 * resumed on every call: an administrator who clicked anything at all in the
 * app will hear the chime, and one who never touched the page gets the silent
 * visual notification instead.
 */

let audioContext = null;

const tone = (context, frequency, startAt, duration, peak) => {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = "sine";
  oscillator.frequency.value = frequency;
  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(peak, startAt + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(startAt);
  oscillator.stop(startAt + duration + 0.02);
};

export const playChime = () => {
  try {
    const AudioCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtor) {
      return;
    }
    audioContext = audioContext || new AudioCtor();
    if (audioContext.state === "suspended") {
      audioContext.resume();
    }
    const start = audioContext.currentTime;
    // Two-note rising interval: short, distinct from a mail client's buzz.
    tone(audioContext, 880, start, 0.16, 0.16);
    tone(audioContext, 1174.66, start + 0.13, 0.2, 0.14);
  } catch {
    // Autoplay policy or no output device; the visual notification still fires.
  }
};
