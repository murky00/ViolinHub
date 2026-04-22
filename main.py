import os
import json
import shutil
import logging
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(BASE_DIR, "static")
DB_FILE = os.path.join(BASE_DIR, "annotations.json")
INBOX_DIR = os.path.join(BASE_DIR, "Upload_Inbox")

# Ensure required directories and files exist on startup
os.makedirs(INBOX_DIR, exist_ok=True)
if not os.path.exists(DB_FILE):
    with open(DB_FILE, "w") as f:
        json.dump([], f)

app = FastAPI(title="Violin Studio API")

@app.get("/favicon.ico", include_in_schema=False)
async def favicon():
    fav_path = os.path.join(BASE_DIR, "favicon.ico")
    if not os.path.exists(fav_path):
        raise HTTPException(status_code=404)
    return FileResponse(fav_path)

app.mount("/media", StaticFiles(directory=BASE_DIR), name="media")
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

@app.get("/")
async def serve_frontend():
    return FileResponse(os.path.join(STATIC_DIR, "index.html"))


# ── File Tree ──────────────────────────────────────────────────────────────────

MEDIA_EXTENSIONS = {'.mp4', '.pdf', '.mov', '.flac', '.mp3', '.webm', '.mkv'}
IGNORED_DIRS = {"venv", "static", "__pycache__", "node_modules", ".git"}

@app.get("/api/files")
async def get_files():
    target_dirs = ["1_Repertoire", "2_Practice_Logs", "Upload_Inbox", "data"]

    def build_tree(current_path: str) -> list:
        nodes = []
        try:
            items = sorted(
                os.listdir(current_path),
                key=lambda x: (not os.path.isdir(os.path.join(current_path, x)), x.lower()),
            )
            for item in items:
                if item.startswith('.') or item in IGNORED_DIRS:
                    continue
                full_path = os.path.join(current_path, item)
                if os.path.isdir(full_path):
                    nodes.append({
                        "name": item,
                        "type": "folder",
                        "children": build_tree(full_path),
                    })
                elif os.path.splitext(item)[1].lower() in MEDIA_EXTENSIONS:
                    rel_path = os.path.relpath(full_path, BASE_DIR).replace("\\", "/")
                    nodes.append({
                        "name": item,
                        "type": "file",
                        "path": f"/media/{rel_path}",
                        "ext": os.path.splitext(item)[1].lstrip('.').lower(),
                    })
        except PermissionError as e:
            logger.warning("Permission denied reading %s: %s", current_path, e)
        return nodes

    tree = []
    for d in target_dirs:
        path = os.path.join(BASE_DIR, d)
        if os.path.exists(path):
            tree.append({"name": d, "type": "folder", "children": build_tree(path)})
    return tree


# ── Upload ─────────────────────────────────────────────────────────────────────

ALLOWED_UPLOAD_EXTENSIONS = {'.mp4', '.mov', '.webm', '.mkv', '.flac', '.mp3'}

@app.post("/api/upload")
async def upload_video(file: UploadFile = File(...)):
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in ALLOWED_UPLOAD_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"Unsupported file type: {ext}")

    # Avoid silently overwriting existing files — append a counter suffix
    base_name = os.path.splitext(file.filename)[0]
    dest_path = os.path.join(INBOX_DIR, file.filename)
    counter = 1
    while os.path.exists(dest_path):
        dest_path = os.path.join(INBOX_DIR, f"{base_name}_{counter}{ext}")
        counter += 1

    final_name = os.path.basename(dest_path)
    try:
        with open(dest_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    except OSError as e:
        logger.error("Failed to save upload %s: %s", final_name, e)
        raise HTTPException(status_code=500, detail="Failed to save file.")

    logger.info("Uploaded: %s", final_name)
    return {"status": "success", "filename": final_name}


# ── Annotations ────────────────────────────────────────────────────────────────

class Annotation(BaseModel):
    video_url: str
    timestamp: float
    text: str
    author: str


def _read_annotations() -> list:
    try:
        with open(DB_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except (json.JSONDecodeError, OSError):
        return []


def _write_annotations(data: list) -> None:
    with open(DB_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


@app.get("/api/annotations")
async def get_annotations():
    return _read_annotations()


@app.post("/api/annotations")
async def save_annotation(note: Annotation):
    data = _read_annotations()
    data.append(note.dict())
    _write_annotations(data)
    return {"status": "success"}


# ── AI Chat stub ───────────────────────────────────────────────────────────────

@app.post("/api/chat")
async def chat_with_ai(req: dict):
    # Wire this to your Ollama / LLM endpoint.
    # Expected request body: { "message": str, "context": str }
    return {"reply": "AI module ready — connect an Ollama or OpenAI-compatible endpoint here."}
