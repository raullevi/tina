import json
import re
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field

from app.services.ollama import OllamaService


class ExtractedActivity(BaseModel):
    category: str = Field(default="general")
    name: str
    duration_minutes: Optional[float] = None
    notes: Optional[str] = None


class ExtractedMeasurement(BaseModel):
    metric: str
    value: float
    unit: str
    review_status: str = Field(default="confirmed")
    notes: Optional[str] = None


class ExtractedFact(BaseModel):
    category: str = Field(default="fact")
    key: str
    value: str


class ExtractedTask(BaseModel):
    title: str
    cluster: str = Field(default="Personal Life")
    schedule_type: str = Field(default="daily")
    duration_minutes: Optional[int] = None
    notes: Optional[str] = None


class ExtractionResult(BaseModel):
    daily_summary: Optional[str] = None
    activities: List[ExtractedActivity] = Field(default_factory=list)
    measurements: List[ExtractedMeasurement] = Field(default_factory=list)
    facts: List[ExtractedFact] = Field(default_factory=list)
    tasks: List[ExtractedTask] = Field(default_factory=list)


EXTRACTION_SYSTEM_PROMPT = """You are Tina's Personal Memory and Action Extraction Engine.
Analyze the user's transcript or input and extract structured personal records and any tasks/routines requested.
Output STRICT, VALID JSON ONLY. Do not include markdown codeblocks or conversational text.

JSON Schema format:
{
  "daily_summary": "1 concise sentence summarizing what the user did or noted.",
  "tasks": [
    {
      "title": "task title or action to do",
      "cluster": "cluster name (e.g. 'Health & Fitness', 'Work & Projects', 'Personal Life', 'Finance & Wealth', 'Growth & Learning', or custom user cluster)",
      "schedule_type": "daily" | "weekly" | "interval",
      "duration_minutes": number or null,
      "notes": "extra context or null"
    }
  ],
  "activities": [
    {
      "category": "gym" | "study" | "work" | "chore" | "general",
      "name": "activity name",
      "duration_minutes": number or null,
      "notes": "extra context or null"
    }
  ],
  "measurements": [
    {
      "metric": "weight" | "sleep_hours" | "water_liters" | "steps" | "etc",
      "value": number,
      "unit": "kg" | "lbs" | "hours" | "liters" | "count" | "etc",
      "review_status": "confirmed" or "uncertain" (use "uncertain" if the user seemed to guess or estimate),
      "notes": "extra context or null"
    }
  ],
  "facts": [
    {
      "category": "preference" | "decision" | "fact" | "goal",
      "key": "short key description",
      "value": "detail"
    }
  ]
}
"""


class ExtractionService:
    """Extracts structured entities from text transcripts using local Ollama."""

    def __init__(self, ollama_service: Optional[OllamaService] = None):
        self.ollama = ollama_service or OllamaService()

    async def extract_from_text(self, text: str) -> ExtractionResult:
        """Run extraction prompt against Ollama and parse/validate with Pydantic."""
        prompt = f"Transcript:\n\"\"\"\n{text}\n\"\"\"\n\nExtract structured JSON:"
        
        try:
            res = await self.ollama.generate(
                prompt=prompt,
                system_prompt=EXTRACTION_SYSTEM_PROMPT,
            )
            raw_response = res.get("response", "").strip()
            
            # Clean possible markdown ```json ... ``` blocks
            cleaned_json = raw_response
            if "```" in cleaned_json:
                match = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", cleaned_json)
                if match:
                    cleaned_json = match.group(1).strip()

            parsed_data = json.loads(cleaned_json)
            return ExtractionResult(**parsed_data)
        except Exception as exc:
            # Fallback extraction: preserve summary of the transcript so data is never dropped
            return ExtractionResult(
                daily_summary=f"Logged update: {text[:120]}...",
                activities=[],
                measurements=[],
                facts=[],
            )
