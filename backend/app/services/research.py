from datetime import datetime
import re
from typing import Any, Dict, List, Optional
from sqlalchemy import or_, text
from sqlalchemy.orm import Session

from app.db.models import Document, ResearchSource
from app.services.ollama import OllamaService

STOP_WORDS = {"what", "is", "my", "the", "a", "an", "and", "or", "in", "on", "at", "to", "for", "of", "with", "about"}


class ResearchService:
    """Document search with SQLite FTS5 and source-backed AI research."""

    def __init__(self, ollama_service: Optional[OllamaService] = None):
        self.ollama = ollama_service or OllamaService()

    @staticmethod
    def init_fts5(db: Session) -> None:
        """Create SQLite FTS5 virtual table for full-text search."""
        try:
            db.execute(text("""
                CREATE VIRTUAL TABLE IF NOT EXISTS documents_fts USING fts5(
                    title,
                    content,
                    doc_id UNINDEXED
                );
            """))
            db.commit()
        except Exception as exc:
            print(f"FTS5 initialization notice: {exc}")

    @classmethod
    def index_document(cls, db: Session, doc_id: int, title: str, content: str) -> None:
        """Insert or update FTS5 index for document."""
        cls.init_fts5(db)
        try:
            db.execute(
                text("INSERT INTO documents_fts (title, content, doc_id) VALUES (:title, :content, :doc_id)"),
                {"title": title, "content": content, "doc_id": doc_id},
            )
            db.commit()
        except Exception as exc:
            print(f"FTS5 indexing notice: {exc}")

    @classmethod
    def search_documents(cls, db: Session, query: str, limit: int = 5) -> List[Dict[str, Any]]:
        """Search documents using FTS5 match query with fallback to keyword LIKE search."""
        cls.init_fts5(db)
        results = []
        words = [w for w in re.findall(r"\w+", query.lower()) if w not in STOP_WORDS and len(w) > 2]

        # 1. Try FTS5 with keywords joined by OR
        if words:
            fts_query = " OR ".join(words)
            try:
                stmt = text("""
                    SELECT doc_id, snippet(documents_fts, 1, '<b>', '</b>', '...', 20) as snippet_text
                    FROM documents_fts
                    WHERE documents_fts MATCH :q
                    LIMIT :lim
                """)
                rows = db.execute(stmt, {"q": fts_query, "lim": limit}).fetchall()
                seen_ids = set()
                for r in rows:
                    doc_id = r[0]
                    if doc_id not in seen_ids:
                        seen_ids.add(doc_id)
                        doc = db.query(Document).filter(Document.id == doc_id).first()
                        if doc:
                            results.append({
                                "id": doc.id,
                                "title": doc.title,
                                "snippet": r[1],
                                "created_at": doc.created_at.isoformat(),
                            })
            except Exception:
                pass

        # 2. Fallback to keyword LIKE matching in Document table
        if not results:
            conditions = []
            for w in (words if words else [query]):
                term = f"%{w}%"
                conditions.append(Document.title.like(term))
                conditions.append(Document.content.like(term))

            fallback_docs = db.query(Document).filter(or_(*conditions)).limit(limit).all()
            for d in fallback_docs:
                idx = -1
                for w in words:
                    pos = d.content.lower().find(w)
                    if pos != -1:
                        idx = pos
                        break
                snippet = d.content[max(0, idx - 40) : min(len(d.content), idx + 80)] if idx >= 0 else d.content[:100]
                results.append({
                    "id": d.id,
                    "title": d.title,
                    "snippet": f"...{snippet}...",
                    "created_at": d.created_at.isoformat(),
                })

        return results

    async def answer_with_research(self, question: str, db: Session) -> Dict[str, Any]:
        """
        Research Assistant query:
        1. Search personal documents with FTS5
        2. Prompt local Ollama with retrieved context and strict citation instruction
        3. Save cited research sources
        """
        relevant_docs = self.search_documents(db, question, limit=4)
        
        context_blocks = []
        sources_list = []
        for i, d in enumerate(relevant_docs, 1):
            doc_rec = db.query(Document).filter(Document.id == d["id"]).first()
            content_snippet = doc_rec.content[:500] if doc_rec else d["snippet"]
            context_blocks.append(f"[Source {i}: {d['title']}]\n{content_snippet}")
            sources_list.append({
                "source_id": i,
                "title": d["title"],
                "snippet": d["snippet"],
            })

        combined_context = "\n\n".join(context_blocks) if context_blocks else "No relevant personal documents found."

        system_prompt = (
            "You are Tina's Research Assistant for Raul. The primary language is always English. Always formulate your answer strictly in clear, articulate English. "
            "Answer Raul's question accurately using ONLY the provided personal documents context. "
            "Cite your sources (e.g. [Source 1]). If the context does not contain the answer, clearly state that rather than inventing facts."
        )

        user_prompt = f"Personal Knowledge Context:\n{combined_context}\n\nQuestion: {question}"
        
        ai_response = await self.ollama.generate(prompt=user_prompt, system_prompt=system_prompt)
        answer_text = ai_response.get("response", "No answer could be generated.")

        # Save to research_sources
        for s in sources_list:
            db.add(ResearchSource(
                title=s["title"],
                snippet=s["snippet"][:255],
                retrieval_date=datetime.utcnow(),
            ))
        db.commit()

        return {
            "question": question,
            "answer": answer_text,
            "sources": sources_list,
        }
