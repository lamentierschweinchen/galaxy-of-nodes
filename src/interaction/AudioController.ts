/**
 * Audio controller — plays ambient soundtrack with a minimal toggle button.
 * Handles browser autoplay restrictions by requiring user interaction to start.
 */
export class AudioController {
  private audio: HTMLAudioElement;
  private button: HTMLElement;
  private playing = false;

  constructor() {
    // Audio element
    this.audio = new Audio('/Consensus Pulse (V2).mp3');
    this.audio.loop = true;
    this.audio.volume = 0.3;

    // Toggle button — bottom-right corner, minimal
    this.button = document.createElement('button');
    this.button.innerHTML = this.muteIcon();
    this.button.style.cssText = `
      position: absolute;
      bottom: 24px;
      right: 28px;
      z-index: 20;
      width: 36px;
      height: 36px;
      border: 1px solid rgba(255, 255, 255, 0.15);
      border-radius: 50%;
      background: rgba(5, 5, 16, 0.6);
      backdrop-filter: blur(8px);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: border-color 0.2s ease, background 0.2s ease;
      padding: 0;
    `;

    this.button.addEventListener('mouseenter', () => {
      this.button.style.borderColor = 'rgba(255, 255, 255, 0.35)';
      this.button.style.background = 'rgba(5, 5, 16, 0.8)';
    });
    this.button.addEventListener('mouseleave', () => {
      this.button.style.borderColor = 'rgba(255, 255, 255, 0.15)';
      this.button.style.background = 'rgba(5, 5, 16, 0.6)';
    });

    this.button.addEventListener('click', () => this.toggle());

    document.body.appendChild(this.button);
  }

  private toggle(): void {
    if (this.playing) {
      this.audio.pause();
      this.playing = false;
      this.button.innerHTML = this.muteIcon();
    } else {
      this.audio.play().catch(() => {
        // Autoplay blocked — will play on next user interaction
      });
      this.playing = true;
      this.button.innerHTML = this.soundIcon();
    }
  }

  private muteIcon(): string {
    return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.5)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
      <line x1="23" y1="9" x2="17" y2="15"></line>
      <line x1="17" y1="9" x2="23" y2="15"></line>
    </svg>`;
  }

  private soundIcon(): string {
    return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path>
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>
    </svg>`;
  }

  dispose(): void {
    this.audio.pause();
    this.button.remove();
  }
}
