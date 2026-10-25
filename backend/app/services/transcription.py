import asyncio
from typing import Any, Dict, List, Optional
from faster_whisper import WhisperModel

from app.config import Settings, get_settings


class TranscriptionService:
    """Local speech-to-text service using Faster-Whisper."""

    def __init__(self, settings: Optional[Settings] = None):
        self.settings = settings or get_settings()
        self.model_size = self.settings.whisper_model
        self.compute_type = self.settings.whisper_compute_type
        self._model: Optional[WhisperModel] = None

    def _get_model(self) -> WhisperModel:
        """Lazy load the Whisper model into memory on first use."""
        if self._model is None:
            # CPU with INT8 compute runs efficiently on Apple Silicon
            self._model = WhisperModel(
                self.model_size,
                device="cpu",
                compute_type=self.compute_type,
            )
        return self._model

    def _sync_transcribe(self, audio_path: str) -> Dict[str, Any]:
        """Synchronous transcription execution."""
        model = self._get_model()
        # Always transcribe in English
        segments, info = model.transcribe(
            audio_path,
            language=self.settings.whisper_language,
            beam_size=5,
            vad_filter=True,
        )

        segment_list: List[Dict[str, Any]] = []
        full_text_parts: List[str] = []

        for s in segments:
            text = s.text.strip()
            if text:
                full_text_parts.append(text)
                segment_list.append({
                    "start": round(s.start, 2),
                    "end": round(s.end, 2),
                    "text": text,
                })

        return {
            "text": " ".join(full_text_parts),
            "language": info.language,
            "language_probability": round(info.language_probability, 3),
            "duration_seconds": round(info.duration, 2) if info.duration else None,
            "segments": segment_list,
        }

    async def transcribe_file(self, audio_path: str) -> Dict[str, Any]:
        """Asynchronously run transcription in a background thread."""
        return await asyncio.to_thread(self._sync_transcribe, audio_path)
