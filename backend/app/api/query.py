from fastapi import APIRouter, Request, HTTPException
from pydantic import BaseModel, Field
import json
import logging
from qdrant_client.http import models
from google.genai import types

logger = logging.getLogger(__name__)

router = APIRouter()

class QueryRequest(BaseModel):
    question: str

class EntityTokens(BaseModel):
    target_labels: list[str] = Field(description="Specific target labels like 'person', 'car', etc.")
    facial_features: list[str] = Field(description="Facial features mentioned.")
    chronological_window: str | None = Field(None, description="A chronological window mentioned.")

@router.post("/api/query")
async def conversational_search(request: QueryRequest, req: Request):
    rag_engine = getattr(req.app.state, "rag_engine", None)
    if not rag_engine:
        raise HTTPException(status_code=500, detail="RAG Engine not initialized.")

    # 1. Parse entity tokens using Gemini
    try:
        config = types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=EntityTokens,
            system_instruction="Extract entity tokens from the user's natural language question."
        )
        response = await rag_engine.genai_client.aio.models.generate_content(
            model="gemini-2.5-flash",
            contents=request.question,
            config=config,
        )
        parsed_tokens = EntityTokens.model_validate_json(response.text)
    except Exception as e:
        logger.error(f"Error parsing with Gemini: {e}")
        raise HTTPException(status_code=500, detail="Error parsing question.")

    # 2. Perform a "hybrid vector-metadata search" against Qdrant
    # Since we lack a text embedder, we use a zero vector for the vector part
    # and Qdrant Filter for the metadata part.
    try:
        must_conditions = []
        for label in parsed_tokens.target_labels:
            # Assuming payload contains 'objects' which is a list of dicts with 'label'
            must_conditions.append(
                models.FieldCondition(
                    key="objects[].label",
                    match=models.MatchValue(value=label)
                )
            )

        query_filter = models.Filter(must=must_conditions) if must_conditions else None

        # Dummy vector for the hybrid search component
        dummy_vector = [0.0] * 512

        search_result = await rag_engine.qdrant_client.search(
            collection_name=rag_engine.collection_name,
            query_vector=dummy_vector,
            query_filter=query_filter,
            limit=5
        )

        historical_context = [hit.payload for hit in search_result if hit.payload is not None]
    except Exception as e:
        logger.error(f"Error querying Qdrant: {e}")
        raise HTTPException(status_code=500, detail="Error searching database.")

    # 3. Dynamic historical summary
    try:
        summary_prompt = (
            f"User Question: {request.question}\n"
            f"Search Results: {json.dumps(historical_context)}\n"
            f"Please provide a dynamic historical summary text block based on the search results."
        )
        summary_config = types.GenerateContentConfig(
            system_instruction="You are an AI assistant analyzing video frames. Summarize the historical context relevant to the user's question."
        )
        summary_response = await rag_engine.genai_client.aio.models.generate_content(
            model="gemini-2.5-flash",
            contents=summary_prompt,
            config=summary_config,
        )
        summary = summary_response.text
    except Exception as e:
        logger.error(f"Error generating summary: {e}")
        summary = "Error generating summary."

    # Extract timestamps and bboxes
    timestamps = []
    bboxes = []
    for payload in historical_context:
        if payload.get("timestamp"):
            timestamps.append(payload["timestamp"])
        for obj in payload.get("objects", []):
            if obj.get("bbox"):
                bboxes.append(obj["bbox"])
        for face in payload.get("faces", []):
            if face.get("bbox"):
                bboxes.append(face["bbox"])

    return {
        "timestamps": timestamps,
        "bounding_boxes": bboxes,
        "historical_summary": summary,
        "parsed_tokens": parsed_tokens.model_dump()
    }
