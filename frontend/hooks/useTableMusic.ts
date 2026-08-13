"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MUSIC_PREF_KEY, TABLE_PLAYLIST, type TableTrack } from "@/lib/table-music";

export function useTableMusic() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const indexRef = useRef(0);
  const [playing, setPlaying] = useState(false);
  const [track, setTrack] = useState<TableTrack>(TABLE_PLAYLIST[0]!);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const audio = new Audio();
    audio.preload = "metadata";
    audio.volume = 0.55;
    audioRef.current = audio;

    const onEnded = () => {
      const next = (indexRef.current + 1) % TABLE_PLAYLIST.length;
      indexRef.current = next;
      const song = TABLE_PLAYLIST[next]!;
      setTrack(song);
      audio.src = song.src;
      void audio.play().then(
        () => setPlaying(true),
        () => setPlaying(false),
      );
    };
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);

    audio.addEventListener("ended", onEnded);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);

    const first = TABLE_PLAYLIST[0]!;
    audio.src = first.src;
    setTrack(first);
    setReady(true);

    return () => {
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.pause();
      audio.src = "";
      audioRef.current = null;
    };
  }, []);

  const toggle = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (!audio.paused) {
      audio.pause();
      try {
        localStorage.setItem(MUSIC_PREF_KEY, "off");
      } catch {
        /* ignore */
      }
      return;
    }

    if (!audio.src) {
      const song = TABLE_PLAYLIST[indexRef.current] ?? TABLE_PLAYLIST[0]!;
      audio.src = song.src;
      setTrack(song);
    }

    try {
      await audio.play();
      try {
        localStorage.setItem(MUSIC_PREF_KEY, "on");
      } catch {
        /* ignore */
      }
    } catch {
      setPlaying(false);
    }
  }, []);

  return { playing, track, ready, toggle };
}
