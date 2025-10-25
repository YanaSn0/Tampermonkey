from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from transformers import pipeline
import requests
from PIL import Image
from io import BytesIO

app = FastAPI()

# --- CORS so the extension can talk to us ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],   # or ["chrome-extension://<your-extension-id>"]
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Load CLIP zero-shot classifier ---
classifier = pipeline(
    "zero-shot-image-classification",
    model="openai/clip-vit-base-patch32"
)

# --- Candidate labels for each category ---
SEX_LABELS = ["male", "female", "unknown"]
RACE_LABELS = ["white", "black", "latino", "asian", "indian", "middle eastern", "mixed", "indigenous", "pacific islander", "unknown"]
CLOTHING_LABELS = ["hoodie", "suit", "tactical gear", "casual", "uniform", "unknown"]
OBJECT_LABELS = ["gun", "knife", "sword", "coin", "phone", "computer", "rocket", "unknown"]

def classify(img: Image.Image, labels):
    results = classifier(img, candidate_labels=labels)
    best = max(results, key=lambda r: r["score"])
    return {"label": best["label"], "score": best["score"]}

@app.get("/classify")
def classify_url(url: str = Query(...)):
    try:
        resp = requests.get(url, timeout=10)
        resp.raise_for_status()
        img = Image.open(BytesIO(resp.content)).convert("RGB")

        return {
            "sex": classify(img, SEX_LABELS),
            "race": classify(img, RACE_LABELS),
            "clothing": classify(img, CLOTHING_LABELS),
            "object": classify(img, OBJECT_LABELS),
        }
    except Exception as e:
        return {"error": str(e)}
