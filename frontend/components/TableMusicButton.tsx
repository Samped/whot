"use client";

import { useTableMusic } from "@/hooks/useTableMusic";

function SpeakerIcon({ on }: { on: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 9.5v5h3.2L12 18.5V5.5L7.2 9.5H4Z"
        fill="currentColor"
        opacity={0.95}
      />
      {on ? (
        <>
          <path
            d="M15.2 9.2a3.4 3.4 0 0 1 0 5.6"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
          <path
            d="M17.6 6.8a6.4 6.4 0 0 1 0 10.4"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            opacity="0.75"
          />
        </>
      ) : (
        <path
          d="M15.5 9.5 20 14m0-4.5-4.5 4.5"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      )}
    </svg>
  );
}

export function TableMusicButton() {
  const { playing, track, ready, toggle } = useTableMusic();

  return (
    <button
      type="button"
      className={`music-toggle ${playing ? "is-on" : ""}`}
      onClick={() => void toggle()}
      disabled={!ready}
      aria-pressed={playing}
      aria-label={playing ? "Pause table music" : "Play table music"}
      title={playing ? `${track.title} · tap to pause` : "Play table music"}
    >
      <SpeakerIcon on={playing} />
      <span className="music-toggle-label">
        {playing ? track.title : "Music"}
      </span>
    </button>
  );
}
