from fastapi import FastAPI

app = FastAPI(title="SOTA Vision RAG API")

@app.get("/health")
def health_check():
    return {"status": "ok"}
