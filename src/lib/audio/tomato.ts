/**
 * Audio utilities for Pomodoro timer sounds
 * Uses Web Audio API for tone generation (no external files needed)
 */

/**
 * Create and play a beep sound using Web Audio API
 * @param frequency - Frequency in Hz (default 800)
 * @param duration - Duration in milliseconds (default 200)
 * @param volume - Volume 0-1 (default 0.5)
 */
export function playBeep(frequency = 800, duration = 200, volume = 0.5): void {
  try {
    const audioContext = new (
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: NewableFunction })
        .webkitAudioContext
    )();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.frequency.value = frequency;
    oscillator.type = "sine";

    // Fade in and out
    gainNode.gain.setValueAtTime(0, audioContext.currentTime);
    gainNode.gain.linearRampToValueAtTime(
      volume,
      audioContext.currentTime + 0.05,
    );
    gainNode.gain.linearRampToValueAtTime(
      0,
      audioContext.currentTime + duration / 1000,
    );

    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + duration / 1000);
  } catch (error) {
    console.warn("Could not play beep sound:", error);
  }
}

/**
 * Play start sound - ascending tones
 */
export function playStartSound(volume = 0.5): void {
  try {
    playBeep(600, 100, volume * 0.6);
    setTimeout(() => playBeep(800, 100, volume * 0.6), 120);
    setTimeout(() => playBeep(1000, 100, volume * 0.6), 240);
  } catch (error) {
    console.warn("Could not play start sound:", error);
  }
}

/**
 * Play end/alert sound - descending tones
 */
export function playEndSound(volume = 0.5): void {
  try {
    playBeep(1000, 150, volume);
    setTimeout(() => playBeep(800, 150, volume), 170);
    setTimeout(() => playBeep(600, 150, volume), 340);
  } catch (error) {
    console.warn("Could not play end sound:", error);
  }
}

/**
 * Play a simple tick sound (quiet beep)
 */
export function playTickSound(volume = 0.2): void {
  try {
    playBeep(1200, 50, volume);
  } catch (error) {
    console.warn("Could not play tick sound:", error);
  }
}

/**
 * Check if audio is supported in the browser
 */
export function isAudioSupported(): boolean {
  return !!(
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: NewableFunction })
      .webkitAudioContext
  );
}
